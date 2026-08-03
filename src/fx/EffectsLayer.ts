import { Container, Graphics, Text } from 'pixi.js';
import { MoviePlayer } from './MoviePlayer';

const REEL_X = 562;
// キャラクターの顔(盤面中央 y≈400〜740)に被らない下部に置く
const REEL_Y = 880;
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

const CELEBRATE_TIME = 3.2; // 大当り演出の長さ(秒)。atari 動画(約2.9〜3.2秒)に合わせる

interface Heart {
  node: Text;
  vx: number;
  vy: number;
  spin: number;
}

/**
 * 液晶部分の演出(図柄変動リール・リーチ・大当りラウンド表示)。
 * Game が startSpin / setBonusRound を呼び、update(dt) でアニメーションする。
 */
export class EffectsLayer {
  readonly container = new Container();
  /** 演出用動画(盤面全体に重ねる。view は main が背景直上に addChild する) */
  readonly movie = new MoviePlayer();
  private reelBox = new Container();
  private digits: Text[] = [];
  private reachText: Text;
  private roundText: Text;
  private spin: SpinState | null = null;
  private lingerT = 0;

  // 大当り演出(ハート + バナー)
  private celebration = new Container();
  private banner: Text;
  private hearts: Heart[] = [];
  private celebrateT = -1; // 負なら停止中

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

    // 大当り演出レイヤ
    this.banner = new Text({
      text: 'BONUS!!',
      style: {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: 110,
        fontWeight: '900',
        fill: 0xffd166,
        stroke: { color: 0x8a2a5c, width: 10 },
      },
    });
    this.banner.anchor.set(0.5);
    this.banner.position.set(REEL_X, 330);
    this.celebration.addChild(this.banner);
    this.celebration.visible = false;
    this.container.addChild(this.celebration);
  }

  /** 大当り時のお祝い演出を再生する */
  celebrate(): void {
    this.movie.play('atari'); // 1回再生。動画の ended で自動停止する
    this.celebrateT = 0;
    this.celebration.visible = true;
    this.celebration.alpha = 1;
    for (const h of this.hearts) h.node.destroy();
    this.hearts = [];
    for (let i = 0; i < 16; i++) {
      const node = new Text({
        text: '💖',
        style: { fontSize: 28 + Math.random() * 26 },
      });
      node.anchor.set(0.5);
      node.position.set(REEL_X + (Math.random() - 0.5) * 500, 700 + Math.random() * 300);
      this.hearts.push({
        node,
        vx: (Math.random() - 0.5) * 120,
        vy: -140 - Math.random() * 160,
        spin: (Math.random() - 0.5) * 4,
      });
      this.celebration.addChild(node);
    }
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
    this.movie.play('loco'); // 変動のたびにランダムで選び直してループ再生
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
    this.movie.stop();
    this.spin = null;
    this.reelBox.visible = false;
    this.reachText.visible = false;
    this.roundText.visible = false;
    this.celebrateT = -1;
    this.celebration.visible = false;
    for (const h of this.hearts) h.node.destroy();
    this.hearts = [];
  }

  private updateCelebration(dt: number): void {
    if (this.celebrateT < 0) return;
    this.celebrateT += dt;
    const t = this.celebrateT;

    this.banner.scale.set(1 + 0.08 * Math.sin(t * 12));

    for (const h of this.hearts) {
      h.node.x += h.vx * dt;
      h.node.y += h.vy * dt;
      h.vy += 40 * dt; // ふわっと減速
      h.node.rotation += h.spin * dt;
    }

    // 終盤はフェードアウト
    const fade = CELEBRATE_TIME - 0.5;
    if (t > fade) this.celebration.alpha = Math.max(0, 1 - (t - fade) / 0.5);
    if (t >= CELEBRATE_TIME) {
      this.celebrateT = -1;
      this.celebration.visible = false;
      for (const h of this.hearts) h.node.destroy();
      this.hearts = [];
      // 通常は動画の ended で停止済み。再生できなかった場合の取り残し対策
      this.movie.stop();
    }
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    this.movie.update(dtMs);
    this.updateCelebration(dt);
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
        this.movie.stop(); // 当落表示の終了で loco を止める(当りなら celebrate が atari を流す)
        onDone(win);
      }
    }
  }
}
