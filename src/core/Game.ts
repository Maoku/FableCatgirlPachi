import { Container, Sprite, Texture } from 'pixi.js';
import { PhysicsWorld } from './PhysicsWorld';
import { BALL_KILL_Y } from './constants';
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

  stats: GameStats = { launched: 0, starts: 0, wins: 0, payout: 0 };

  private ballSprites = new Map<number, Sprite>();

  constructor(
    private layoutRef: LayoutRef,
    private ballLayer: Container,
    private ballTexture: Texture,
  ) {
    this.physics = new PhysicsWorld(layoutRef.current);
  }

  /** モード切替。エディットに入ると玉を消し、プレイに戻るとレイアウトを物理へ反映する */
  setMode(mode: GameMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.firing = false;
    if (mode === 'edit') {
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
  }

  protected onPocket(role: PocketRole, _pocketId: string): void {
    switch (role) {
      case 'start':
        this.stats.starts++;
        this.addPayout(START_PAYOUT);
        break;
      case 'attacker':
        // 大当りロジックは Phase 3 で実装
        break;
      case 'out':
        break;
    }
  }

  protected addPayout(n: number): void {
    this.ballStock += n;
    this.stats.payout += n;
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
