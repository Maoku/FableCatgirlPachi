import * as RAPIER from '@dimforge/rapier2d-compat';
import {
  PPM,
  BALL_R,
  FIXED_DT,
  FIELD_CX,
  FIELD_CY,
  FIELD_RX,
  FIELD_RY,
  RAIL_RX,
  RAIL_RY,
  RAIL_FROM_DEG,
  RAIL_TO_DEG,
  DISPLAY_POLY,
  LAUNCH_POS,
  LAUNCH_DIR,
  LAUNCH_MIN_V,
  LAUNCH_MAX_V,
} from './constants';

let rapierReady = false;

/** Rapier(WASM)の初期化。アプリ起動時に一度だけ await する */
export async function initRapier(): Promise<void> {
  if (!rapierReady) {
    await RAPIER.init();
    rapierReady = true;
  }
}

/** 楕円弧を折れ線近似した点列(px)を返す */
export function ellipseArc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fromDeg: number,
  toDeg: number,
  stepDeg = 3,
): number[][] {
  const pts: number[][] = [];
  const n = Math.max(2, Math.ceil(Math.abs(toDeg - fromDeg) / stepDeg));
  for (let i = 0; i <= n; i++) {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / n) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

interface BallEntry {
  body: RAPIER.RigidBody;
  colliderHandle: number;
}

export class PhysicsWorld {
  private world: RAPIER.World;
  private events: RAPIER.EventQueue;
  private balls = new Map<number, BallEntry>();
  private handleToBall = new Map<number, number>();
  private nextBallId = 1;
  private acc = 0;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: 9.81 });
    this.world.timestep = FIXED_DT;
    this.events = new RAPIER.EventQueue(true);
    this.buildBoard();
  }

  /** 盤面の固定ジオメトリ(外周・発射レール・中央液晶) */
  private buildBoard(): void {
    // 外周(閉じた楕円)
    this.addPolyline(ellipseArc(FIELD_CX, FIELD_CY, FIELD_RX, FIELD_RY, -180, 180));
    // 発射レール。玉は外周との間の溝を上り、右上の切れ目から盤面に放たれる
    this.addPolyline(
      ellipseArc(FIELD_CX, FIELD_CY, RAIL_RX, RAIL_RY, RAIL_FROM_DEG, RAIL_TO_DEG),
      0.02,
    );
    // 中央液晶の島。屋根が傾斜していて玉を左右に振り分ける
    this.addPolyline(DISPLAY_POLY);
  }

  private addPolyline(points: number[][], friction = 0.05): void {
    const flat = new Float32Array(points.length * 2);
    points.forEach(([x, y], i) => {
      flat[i * 2] = x / PPM;
      flat[i * 2 + 1] = y / PPM;
    });
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(
      RAPIER.ColliderDesc.polyline(flat).setRestitution(0.25).setFriction(friction),
      body,
    );
  }

  /** 玉を生成する。座標は px、速度は m/s */
  spawnBall(x: number, y: number, vx = 0, vy = 0): number {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x / PPM, y / PPM)
        .setLinvel(vx, vy)
        .setCcdEnabled(true) // 高速の小球が釘をすり抜けないように CCD を有効化
        .setLinearDamping(0.02)
        .setAngularDamping(0.4),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_R / PPM)
        .setRestitution(0.38)
        .setFriction(0.08)
        .setDensity(7.5)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    const id = this.nextBallId++;
    this.balls.set(id, { body, colliderHandle: collider.handle });
    this.handleToBall.set(collider.handle, id);
    return id;
  }

  /** 発射装置から玉を打ち出す。power は 0..1 */
  launch(power: number): number {
    const p = Math.min(1, Math.max(0, power));
    const v = LAUNCH_MIN_V + (LAUNCH_MAX_V - LAUNCH_MIN_V) * p;
    const jitter = 1 + (Math.random() - 0.5) * 0.03;
    return this.spawnBall(
      LAUNCH_POS.x,
      LAUNCH_POS.y,
      LAUNCH_DIR.x * v * jitter,
      LAUNCH_DIR.y * v * jitter,
    );
  }

  removeBall(id: number): void {
    const entry = this.balls.get(id);
    if (!entry) return;
    this.handleToBall.delete(entry.colliderHandle);
    this.balls.delete(id);
    this.world.removeRigidBody(entry.body);
  }

  clearAllBalls(): void {
    for (const id of [...this.balls.keys()]) this.removeBall(id);
  }

  get ballCount(): number {
    return this.balls.size;
  }

  forEachBall(cb: (id: number, x: number, y: number) => void): void {
    for (const [id, { body }] of this.balls) {
      const t = body.translation();
      cb(id, t.x * PPM, t.y * PPM);
    }
  }

  /** 固定タイムステップで物理を進める */
  step(dtMs: number): void {
    this.acc = Math.min(this.acc + dtMs / 1000, 0.25);
    while (this.acc >= FIXED_DT) {
      this.acc -= FIXED_DT;
      this.world.step(this.events);
      this.events.drainCollisionEvents(() => {
        // 入賞口のセンサー処理は Phase 1 で実装
      });
    }
  }

  dispose(): void {
    this.world.free();
    this.events.free();
  }
}
