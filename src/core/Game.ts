import { Container, Sprite, Texture } from 'pixi.js';
import { PhysicsWorld } from './PhysicsWorld';
import { BALL_KILL_Y } from './constants';
import type { EffectsLayer } from '../fx/EffectsLayer';
import type { Layout, PocketRole } from '../types';

export type GameMode = 'play' | 'edit';

export interface GameStats {
  launched: number;
  starts: number;
  wins: number;
  payout: number;
}

const FIRE_INTERVAL = 0.3; // 秒/発
const START_PAYOUT = 3; // スタート入賞の賞球
const ATTACKER_PAYOUT = 15; // アタッカー入賞の賞球

// 抽選と大当りの仕様(盤面画像の「大当り確率 1/199」に合わせる)
const WIN_PROBABILITY = 1 / 199;
const MAX_PENDING = 4; // 保留上限
const BONUS_ROUNDS = 10;
const ROUND_MAX_BALLS = 8; // 1ラウンドの規定入賞数
const ROUND_TIME = 8; // 1ラウンドの最大時間(秒)
const ROUND_INTERVAL = 1.2; // ラウンド間のインターバル(秒)
const BONUS_START_DELAY = 2.6; // 当り演出からアタッカー開放までの間(秒)

interface BonusState {
  round: number;
  ballsIn: number;
  phase: 'open' | 'interval';
  timer: number;
}

/** レイアウトへの参照。エディタでの差し替え(インポート等)を全員に伝えるためのホルダ */
export interface LayoutRef {
  current: Layout;
}

export class Game {
  physics: PhysicsWorld;
  mode: GameMode = 'play';

  ballStock = 500;
  firing = false;
  firePower = 0.62;
  private fireTimer = 0;

  /** 保留玉(未消化の抽選) */
  pending = 0;
  bonus: BonusState | null = null;
  private bonusStartDelay = 0;

  stats: GameStats = { launched: 0, starts: 0, wins: 0, payout: 0 };

  /** アタッカー開閉などの見た目に影響する状態が変わったときに呼ばれる(main が redraw を割り当てる) */
  onVisualChange: (() => void) | null = null;

  private ballSprites = new Map<number, Sprite>();

  constructor(
    private layoutRef: LayoutRef,
    private ballLayer: Container,
    private ballTexture: Texture,
    private fx: EffectsLayer,
  ) {
    this.physics = new PhysicsWorld(layoutRef.current);
  }

  get attackerOpen(): boolean {
    return this.bonus?.phase === 'open';
  }

  /** モード切替。エディットに入ると玉と進行中の抽選を消し、プレイに戻るとレイアウトを反映する */
  setMode(mode: GameMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.firing = false;
    if (mode === 'edit') {
      // 進行中の抽選・大当りを破棄
      this.pending = 0;
      this.bonus = null;
      this.bonusStartDelay = 0;
      this.fx.reset();
      this.physics.clearAllBalls();
      this.syncBalls();
    } else {
      this.rebuildPhysics();
    }
  }

  /** レイアウトから物理ワールドを作り直す */
  rebuildPhysics(): void {
    this.physics.dispose();
    this.physics = new PhysicsWorld(this.layoutRef.current);
    for (const sprite of this.ballSprites.values()) sprite.destroy();
    this.ballSprites.clear();
  }

  update(dtMs: number): void {
    this.fx.update(dtMs);
    if (this.mode !== 'play') return;
    const dt = dtMs / 1000;

    // 発射(ハンドルを握っている間、一定間隔で打ち出す)
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.firing && this.ballStock > 0 && this.fireTimer === 0) {
      this.fireTimer = FIRE_INTERVAL;
      this.physics.launch(this.firePower);
      this.ballStock--;
      this.stats.launched++;
    }

    this.physics.step(dtMs, (role, id) => this.onPocket(role, id));
    this.syncBalls();
    this.updateLottery(dt);
    this.updateBonus(dt);
  }

  private onPocket(role: PocketRole, _pocketId: string): void {
    switch (role) {
      case 'start':
        this.stats.starts++;
        this.addPayout(START_PAYOUT);
        if (this.pending < MAX_PENDING) this.pending++;
        break;
      case 'attacker':
        // 開放中のみ賞球(閉鎖中は蓋があるため通常は届かない)
        if (this.attackerOpen && this.bonus) {
          this.addPayout(ATTACKER_PAYOUT);
          this.bonus.ballsIn++;
          if (this.bonus.ballsIn >= ROUND_MAX_BALLS) this.closeRound();
        }
        break;
      case 'out':
        break;
    }
  }

  private addPayout(n: number): void {
    this.ballStock += n;
    this.stats.payout += n;
  }

  /** 保留を消化して図柄変動を開始する */
  private updateLottery(dt: number): void {
    if (this.bonusStartDelay > 0) {
      this.bonusStartDelay -= dt;
      if (this.bonusStartDelay <= 0) this.startBonus();
      return;
    }
    if (this.fx.spinning || this.bonus || this.pending === 0) return;
    this.pending--;
    const win = Math.random() < WIN_PROBABILITY;
    this.fx.startSpin(win, (didWin) => {
      if (didWin) {
        this.stats.wins++;
        this.fx.celebrate();
        this.bonusStartDelay = BONUS_START_DELAY;
      }
    });
  }

  private startBonus(): void {
    this.bonus = { round: 1, ballsIn: 0, phase: 'open', timer: ROUND_TIME };
    this.physics.setAttackerOpen(true);
    this.fx.setBonusRound(1, BONUS_ROUNDS);
    this.onVisualChange?.();
  }

  private closeRound(): void {
    if (!this.bonus || this.bonus.phase !== 'open') return;
    this.bonus.phase = 'interval';
    this.bonus.timer = ROUND_INTERVAL;
    this.physics.setAttackerOpen(false);
    this.onVisualChange?.();
  }

  private updateBonus(dt: number): void {
    const b = this.bonus;
    if (!b) return;
    b.timer -= dt;
    if (b.timer > 0) return;
    if (b.phase === 'open') {
      this.closeRound();
      return;
    }
    // インターバル終了 → 次ラウンドか終了
    if (b.round >= BONUS_ROUNDS) {
      this.bonus = null;
      this.fx.setBonusRound(null);
      this.onVisualChange?.();
      return;
    }
    b.round++;
    b.ballsIn = 0;
    b.phase = 'open';
    b.timer = ROUND_TIME;
    this.physics.setAttackerOpen(true);
    this.fx.setBonusRound(b.round, BONUS_ROUNDS);
    this.onVisualChange?.();
  }

  /** 物理→スプライトの同期。消えた玉のスプライトも回収する */
  private syncBalls(): void {
    const seen = new Set<number>();
    const dead: number[] = [];
    this.physics.forEachBall((id, x, y) => {
      if (y > BALL_KILL_Y) {
        dead.push(id);
        return;
      }
      seen.add(id);
      let sprite = this.ballSprites.get(id);
      if (!sprite) {
        sprite = new Sprite(this.ballTexture);
        sprite.anchor.set(0.5);
        this.ballSprites.set(id, sprite);
        this.ballLayer.addChild(sprite);
      }
      sprite.position.set(x, y);
    });
    for (const id of dead) this.physics.removeBall(id);
    for (const [id, sprite] of this.ballSprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.ballSprites.delete(id);
      }
    }
  }
}
