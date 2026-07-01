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
import type { Layout, PocketRole } from '../types';

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

export type PocketHandler = (role: PocketRole, pocketId: string) => void;

interface BallEntry {
  body: RAPIER.RigidBody;
  colliderHandle: number;
  /** ほぼ停止している累積時間(秒)。スタック玉の自動回収に使う */
  stillTime: number;
}

interface PocketEntry {
  role: PocketRole;
  id: string;
}

const POCKET_H = 24; // 入賞口センサーの高さ(px)

export class PhysicsWorld {
  private world: RAPIER.World;
  private events: RAPIER.EventQueue;
  private balls = new Map<number, BallEntry>();
  private handleToBall = new Map<number, number>();
  private pocketByHandle = new Map<number, PocketEntry>();
  private attackerLids: RAPIER.Collider[] = [];
  private windmills: { id: string; body: RAPIER.RigidBody }[] = [];
  private nextBallId = 1;
  private acc = 0;

  constructor(layout: Layout) {
    this.world = new RAPIER.World({ x: 0, y: 9.81 });
    this.world.timestep = FIXED_DT;
    this.events = new RAPIER.EventQueue(true);
    this.buildBoard();
    this.buildLayout(layout);
  }

  /** 盤面の固定ジオメトリ(外周・発射レール・中央液晶) */
  private buildBoard(): void {
    // 外周(閉じた楕円)。玉が溝を滑らかに上れるよう細かく分割し、摩擦・反発を殺す
    this.addPolyline(ellipseArc(FIELD_CX, FIELD_CY, FIELD_RX, FIELD_RY, -180, 180, 1.5), {
      friction: 0,
      restitution: 0.05,
    });
    // 発射レール。玉は外周との間の溝を上り、右上の切れ目から盤面に放たれる
    this.addPolyline(
      ellipseArc(FIELD_CX, FIELD_CY, RAIL_RX, RAIL_RY, RAIL_FROM_DEG, RAIL_TO_DEG, 1.5),
      { friction: 0, restitution: 0.05 },
    );
    // 中央液晶の島。屋根が傾斜していて玉を左右に振り分ける
    this.addPolyline(DISPLAY_POLY, { friction: 0.05, restitution: 0.25 });
  }

  /** レイアウト JSON から釘・壁・風車・入賞口を構築する */
  private buildLayout(layout: Layout): void {
    for (const obj of layout.objects) {
      switch (obj.type) {
        case 'nail': {
          const body = this.world.createRigidBody(
            RAPIER.RigidBodyDesc.fixed().setTranslation(obj.x / PPM, obj.y / PPM),
          );
          this.world.createCollider(
            RAPIER.ColliderDesc.ball(obj.radius / PPM).setRestitution(0.45).setFriction(0.1),
            body,
          );
          break;
        }
        case 'wall': {
          const mx = (obj.x1 + obj.x2) / 2;
          const my = (obj.y1 + obj.y2) / 2;
          const len = Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1);
          const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
          const body = this.world.createRigidBody(
            RAPIER.RigidBodyDesc.fixed().setTranslation(mx / PPM, my / PPM).setRotation(angle),
          );
          this.world.createCollider(
            RAPIER.ColliderDesc.cuboid(len / 2 / PPM, 3 / PPM)
              .setRestitution(0.3)
              .setFriction(0.05),
            body,
          );
          break;
        }
        case 'windmill': {
          const body = this.world.createRigidBody(
            RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(
              obj.x / PPM,
              obj.y / PPM,
            ),
          );
          body.setAngvel(obj.speed, true);
          // 中心のハブ + 十字の羽根
          this.world.createCollider(
            RAPIER.ColliderDesc.ball(6 / PPM).setRestitution(0.4),
            body,
          );
          for (const rot of [0, Math.PI / 2]) {
            this.world.createCollider(
              RAPIER.ColliderDesc.cuboid(obj.radius / PPM, 2.2 / PPM)
                .setRotation(rot)
                .setRestitution(0.4)
                .setFriction(0.2),
              body,
            );
          }
          this.windmills.push({ id: obj.id, body });
          break;
        }
        case 'pocket': {
          const body = this.world.createRigidBody(
            RAPIER.RigidBodyDesc.fixed().setTranslation(obj.x / PPM, obj.y / PPM),
          );
          const sensor = this.world.createCollider(
            RAPIER.ColliderDesc.cuboid(obj.width / 2 / PPM, POCKET_H / 2 / PPM)
              .setSensor(true)
              .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
            body,
          );
          this.pocketByHandle.set(sensor.handle, { role: obj.role, id: obj.id });

          if (obj.role === 'attacker') {
            // アタッカーの蓋。玉が乗ったまま止まらないよう少し傾けておく
            const lidBody = this.world.createRigidBody(
              RAPIER.RigidBodyDesc.fixed()
                .setTranslation(obj.x / PPM, (obj.y - POCKET_H / 2 - 6) / PPM)
                .setRotation(-0.07),
            );
            const lid = this.world.createCollider(
              RAPIER.ColliderDesc.cuboid((obj.width / 2 + 6) / PPM, 4 / PPM)
                .setRestitution(0.25)
                .setFriction(0.05),
              lidBody,
            );
            this.attackerLids.push(lid);
          }
          break;
        }
      }
    }
  }

  private addPolyline(
    points: number[][],
    opts: { friction?: number; restitution?: number } = {},
  ): void {
    const flat = new Float32Array(points.length * 2);
    points.forEach(([x, y], i) => {
      flat[i * 2] = x / PPM;
      flat[i * 2 + 1] = y / PPM;
    });
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(
      RAPIER.ColliderDesc.polyline(flat)
        .setRestitution(opts.restitution ?? 0.25)
        .setFriction(opts.friction ?? 0.05),
      body,
    );
  }

  /** アタッカーの開閉(大当り中に開く) */
  setAttackerOpen(open: boolean): void {
    for (const lid of this.attackerLids) lid.setEnabled(!open);
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
    this.balls.set(id, { body, colliderHandle: collider.handle, stillTime: 0 });
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

  forEachWindmill(cb: (id: string, angle: number) => void): void {
    for (const { id, body } of this.windmills) cb(id, body.rotation());
  }

  /** 固定タイムステップで物理を進め、入賞イベントを onPocket で通知する */
  step(dtMs: number, onPocket?: PocketHandler): void {
    this.acc = Math.min(this.acc + dtMs / 1000, 0.25);
    const captured: { ballId: number; pocket: PocketEntry }[] = [];
    while (this.acc >= FIXED_DT) {
      this.acc -= FIXED_DT;
      this.world.step(this.events);
      this.events.drainCollisionEvents((h1, h2, started) => {
        if (!started) return;
        const pocket = this.pocketByHandle.get(h1) ?? this.pocketByHandle.get(h2);
        if (!pocket) return;
        const ballHandle = this.pocketByHandle.has(h1) ? h2 : h1;
        const ballId = this.handleToBall.get(ballHandle);
        if (ballId !== undefined) captured.push({ ballId, pocket });
      });
    }
    for (const { ballId, pocket } of captured) {
      if (!this.balls.has(ballId)) continue; // 二重検出を無視
      this.removeBall(ballId);
      onPocket?.(pocket.role, pocket.id);
    }
    this.sweepStuckBalls(dtMs / 1000, onPocket);
  }

  /**
   * どこかに挟まる・詰まるなどでほぼ停止した玉を自動回収する。
   * 発射口での玉詰まりや、エディットで作られた詰まりやすい配置へのフェイルセーフ。
   */
  private sweepStuckBalls(dt: number, onPocket?: PocketHandler): void {
    const STILL_SPEED = 0.15; // m/s
    const STILL_LIMIT = 2; // 秒
    const stuck: number[] = [];
    for (const [id, entry] of this.balls) {
      const v = entry.body.linvel();
      if (Math.hypot(v.x, v.y) < STILL_SPEED) {
        entry.stillTime += dt;
        if (entry.stillTime > STILL_LIMIT) stuck.push(id);
      } else {
        entry.stillTime = 0;
      }
    }
    for (const id of stuck) {
      this.removeBall(id);
      onPocket?.('out', 'stuck-sweep');
    }
  }

  dispose(): void {
    this.world.free();
    this.events.free();
  }
}
