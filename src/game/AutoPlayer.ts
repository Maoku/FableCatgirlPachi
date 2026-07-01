import type { Game } from '../core/Game';

export interface AutoConfig {
  /** 発射強度 0..1 */
  power: number;
  /** 発射数の上限。null なら無制限 */
  ballLimit: number | null;
  /** 実行時間の上限(分)。null なら無制限 */
  timeLimitMin: number | null;
}

export interface AutoStatus {
  active: boolean;
  firedBalls: number;
  elapsedSec: number;
  stopReason: string | null;
}

/**
 * 自動プレイ。指定された玉数 or 時間の間、ハンドルを握り続ける。
 * 持ち玉が尽きたときも停止する。
 */
export class AutoPlayer {
  private cfg: AutoConfig | null = null;
  private launchedAtStart = 0;
  private elapsed = 0;
  private stopReason: string | null = null;

  constructor(private game: Game) {}

  get active(): boolean {
    return this.cfg !== null;
  }

  start(cfg: AutoConfig): void {
    this.cfg = cfg;
    this.launchedAtStart = this.game.stats.launched;
    this.elapsed = 0;
    this.stopReason = null;
    this.game.firePower = cfg.power;
    this.game.firing = true;
  }

  stop(reason = '手動停止'): void {
    if (!this.cfg) return;
    this.cfg = null;
    this.stopReason = reason;
    this.game.firing = false;
  }

  /** 毎フレーム呼ぶ。停止条件を監視する */
  update(dtMs: number): void {
    const cfg = this.cfg;
    if (!cfg) return;
    this.elapsed += dtMs / 1000;

    const fired = this.game.stats.launched - this.launchedAtStart;
    if (cfg.ballLimit !== null && fired >= cfg.ballLimit) {
      this.stop(`指定玉数 (${cfg.ballLimit}発) を打ち切りました`);
      return;
    }
    if (cfg.timeLimitMin !== null && this.elapsed >= cfg.timeLimitMin * 60) {
      this.stop(`指定時間 (${cfg.timeLimitMin}分) が経過しました`);
      return;
    }
    if (this.game.ballStock <= 0 && this.game.physics.ballCount === 0) {
      this.stop('持ち玉がなくなりました');
      return;
    }
    // 大当り中もハンドルは維持する
    this.game.firing = true;
  }

  status(): AutoStatus {
    return {
      active: this.active,
      firedBalls: this.game.stats.launched - this.launchedAtStart,
      elapsedSec: this.elapsed,
      stopReason: this.stopReason,
    };
  }
}
