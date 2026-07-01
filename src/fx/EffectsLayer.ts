import { Container, Graphics, Text } from 'pixi.js';

const REEL_X = 562;
const REEL_Y = 520;
const DIGIT_GAP = 120;

// 停止タイミング(秒)。停止順は 左 → 右 → 中
const STOP_L = 0.9;
const STOP_R = 1.6;
const STOP_C = 2.4;
const STOP_C_REACH = 4.2; // リーチ時は中図柄を引っ張る
const RESULT_LINGER = 0.6;

interface SpinState {
  t: number;
  finals: [number, number, number]; // [左, 中, 右]
  reach: boolean;
  win: boolean;
  stopped: [boolean, boolean, boolean];
  cycleT: number;
  done: boolean;
  onDone: (win: boolean) => void;
}

/**
 * 液晶部分の演出(図柄変動リール・リーチ・大当りラウンド表示)。
 * Game が startSpin / setBonusRound を呼び、update(dt) でアニメーションする。
 */
export class EffectsLayer {
  readonly container = new Container();
  private reelBox = new Container();
  private digits: Text[] = [];
  private reachText: Text;
  private roundText: Text;
  private spin: SpinState | null = null;
  private lingerT = 0;

  constructor() {
    this.container.eventMode = 'none';

    const bg = new Graphics()
      .roundRect(REEL_X - 200, REEL_Y - 80, 400, 160, 18)
      .fill({ color: 0x14030d, alpha: 0.72 })
      .stroke({ width: 3, color: 0xff5fa2, alpha: 0.9 });
    this.reelBox.addChild(bg);

    for (let i = 0; i < 3; i++) {
      const t = new Text({
        text: '7',
        style: {
          fontFamily: 'Arial, sans-serif',
          fontSize: 96,
          fontWeight: '900',
          fill: 0xffffff,
          stroke: { color: 0xff5fa2, width: 6 },
        },
      });
      t.anchor.set(0.5);
      t.position.set(REEL_X + (i - 1) * DIGIT_GAP, REEL_Y);
      this.digits.push(t);
      this.reelBox.addChild(t);
    }

    this.reachText = new Text({
      text: 'リーチ!',
      style: {
        fontFamily: 'sans-serif',
        fontSize: 44,
        fontWeight: '900',
        fill: 0xffe14d,
        stroke: { color: 0x8a2a5c, width: 5 },
      },
    });
    this.reachText.anchor.set(0.5);
    this.reachText.position.set(REEL_X, REEL_Y - 120);
    this.reachText.visible = false;
    this.reelBox.addChild(this.reachText);

    this.roundText = new Text({
      text: '',
      style: {
        fontFamily: 'sans-serif',
        fontSize: 40,
        fontWeight: '900',
        fill: 0xffd166,
        stroke: { color: 0x3a1a0e, width: 5 },
      },
    });
    this.roundText.anchor.set(0.5);
    this.roundText.position.set(REEL_X, REEL_Y + 110);
    this.roundText.visible = false;
    this.reelBox.addChild(this.roundText);

    this.reelBox.visible = false;
    this.container.addChild(this.reelBox);
  }

  get spinning(): boolean {
    return this.spin !== null;
  }

  /** 図柄変動を開始する。結果(当落)は開始時点で確定している */
  startSpin(win: boolean, onDone: (win: boolean) => void): void {
    const d = () => Math.floor(Math.random() * 10);
    let finals: [number, number, number];
    let reach = false;
    if (win) {
      const n = d();
      finals = [n, n, n];
      reach = true;
    } else if (Math.random() < 0.18) {
      // ガセリーチ: 左右が揃って中だけ外れる
      const n = d();
      finals = [n, (n + 1 + Math.floor(Math.random() * 8)) % 10, n];
      reach = true;
    } else {
      const l = d();
      const r = (l + 1 + Math.floor(Math.random() * 8)) % 10; // 左右は揃えない
      finals = [l, d(), r];
    }
    this.spin = {
      t: 0,
      finals,
      reach,
      win,
      stopped: [false, false, false],
      cycleT: 0,
      done: false,
      onDone,
    };
    this.lingerT = 0;
    this.reelBox.visible = true;
    this.reachText.visible = false;
    for (const digit of this.digits) digit.style.fill = 0xffffff;
  }

  /** 大当り中のラウンド表示。null で消灯 */
  setBonusRound(round: number | null, total = 10): void {
    if (round === null) {
      this.roundText.visible = false;
      if (!this.spin) this.reelBox.visible = false;
      return;
    }
    this.reelBox.visible = true;
    this.roundText.visible = true;
    this.roundText.text = `ROUND ${round} / ${total}`;
  }

  /** 変動を強制終了して非表示(エディットモード遷移時など) */
  reset(): void {
    this.spin = null;
    this.reelBox.visible = false;
    this.reachText.visible = false;
    this.roundText.visible = false;
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    const s = this.spin;
    if (!s) return;
    s.t += dt;
    s.cycleT += dt;

    const stopC = s.reach ? STOP_C_REACH : STOP_C;
    // 停止順: 左 → 右 → 中
    const stopAt = [STOP_L, stopC, STOP_R];
    for (let i = 0; i < 3; i++) {
      if (!s.stopped[i] && s.t >= stopAt[i]) {
        s.stopped[i] = true;
        this.digits[i].text = String(s.finals[i]);
        this.digits[i].scale.set(1);
      }
    }

    // リーチ表示(左右停止済みで中だけ回っている)
    const reachNow = s.reach && s.stopped[0] && s.stopped[2] && !s.stopped[1];
    this.reachText.visible = reachNow;
    if (reachNow) {
      const pulse = 1 + 0.12 * Math.sin(s.t * 10);
      this.reachText.scale.set(pulse);
    }

    // 回転中の図柄をパラパラ切り替える
    if (s.cycleT >= 0.06) {
      s.cycleT = 0;
      for (let i = 0; i < 3; i++) {
        if (!s.stopped[i]) this.digits[i].text = String(Math.floor(Math.random() * 10));
      }
    }

    if (!s.done && s.stopped.every(Boolean)) {
      s.done = true;
      if (s.win) {
        for (const digit of this.digits) digit.style.fill = 0xffe14d;
      }
    }
    if (s.done) {
      this.lingerT += dt;
      if (this.lingerT >= RESULT_LINGER) {
        const { win, onDone } = s;
        this.spin = null;
        if (!this.roundText.visible && !win) this.reelBox.visible = false;
        onDone(win);
      }
    }
  }
}
