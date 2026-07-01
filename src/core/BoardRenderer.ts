import { Container, Graphics } from 'pixi.js';
import type { Layout, LayoutObject, PocketRole } from '../types';
import {
  FIELD_CX,
  FIELD_CY,
  FIELD_RX,
  FIELD_RY,
  RAIL_RX,
  RAIL_RY,
  RAIL_FROM_DEG,
  RAIL_TO_DEG,
  DISPLAY_POLY,
} from './constants';
import { ellipseArc } from './PhysicsWorld';
import type { PhysicsWorld } from './PhysicsWorld';

const POCKET_COLORS: Record<PocketRole, number> = {
  start: 0x3ddc84,
  attacker: 0xffb020,
  out: 0x8899aa,
};

export interface RedrawOptions {
  editMode: boolean;
  selectedId: string | null;
  attackerOpen: boolean;
}

/**
 * レイアウトオブジェクト(釘・壁・風車・入賞口)と固定ジオメトリのオーバーレイ描画。
 * 物理が正で、描画は redraw / update で追従する。
 */
export class BoardRenderer {
  readonly container = new Container();
  private staticG = new Graphics();
  private windmillG = new Map<string, Graphics>();

  constructor() {
    this.container.addChild(this.staticG);
  }

  redraw(layout: Layout, opts: RedrawOptions): void {
    const g = this.staticG;
    g.clear();
    for (const wm of this.windmillG.values()) wm.destroy();
    this.windmillG.clear();

    const baseAlpha = opts.editMode ? 0.95 : 0.55;

    // 固定ジオメトリの輪郭(うっすら表示して当たり判定を可視化)
    const guideAlpha = opts.editMode ? 0.4 : 0.15;
    g.poly(ellipseArc(FIELD_CX, FIELD_CY, FIELD_RX, FIELD_RY, -180, 180).flat(), true).stroke({
      width: 2,
      color: 0xff5fa2,
      alpha: guideAlpha,
    });
    const rail = ellipseArc(FIELD_CX, FIELD_CY, RAIL_RX, RAIL_RY, RAIL_FROM_DEG, RAIL_TO_DEG);
    g.moveTo(rail[0][0], rail[0][1]);
    for (const [x, y] of rail.slice(1)) g.lineTo(x, y);
    g.stroke({ width: 2, color: 0xff5fa2, alpha: guideAlpha });
    g.poly(DISPLAY_POLY.flat(), false).stroke({ width: 2, color: 0xff5fa2, alpha: guideAlpha });

    for (const obj of layout.objects) {
      const selected = obj.id === opts.selectedId;
      switch (obj.type) {
        case 'nail':
          g.circle(obj.x, obj.y, obj.radius + 1)
            .fill({ color: 0xffd9ea, alpha: baseAlpha })
            .stroke({ width: 1.5, color: 0xc4457e, alpha: baseAlpha });
          break;
        case 'wall':
          g.moveTo(obj.x1, obj.y1)
            .lineTo(obj.x2, obj.y2)
            .stroke({ width: 6, color: 0xffd166, alpha: baseAlpha });
          break;
        case 'pocket': {
          const color = POCKET_COLORS[obj.role];
          g.roundRect(obj.x - obj.width / 2, obj.y - 12, obj.width, 24, 6)
            .fill({ color, alpha: 0.25 })
            .stroke({ width: 2, color, alpha: Math.min(1, baseAlpha + 0.2) });
          // アタッカーの蓋(閉じているときのみ)
          if (obj.role === 'attacker' && !opts.attackerOpen) {
            g.moveTo(obj.x - obj.width / 2 - 6, obj.y - 18)
              .lineTo(obj.x + obj.width / 2 + 6, obj.y - 18)
              .stroke({ width: 4, color: 0xffb020, alpha: baseAlpha });
          }
          break;
        }
        case 'windmill': {
          const wm = new Graphics();
          wm.circle(0, 0, obj.radius).stroke({ width: 1.5, color: 0xff8ec1, alpha: 0.5 });
          wm.circle(0, 0, 6).fill({ color: 0xff8ec1, alpha: baseAlpha });
          wm.rect(-obj.radius, -2.2, obj.radius * 2, 4.4).fill({
            color: 0xffb7d5,
            alpha: baseAlpha,
          });
          wm.rect(-2.2, -obj.radius, 4.4, obj.radius * 2).fill({
            color: 0xffb7d5,
            alpha: baseAlpha,
          });
          wm.position.set(obj.x, obj.y);
          this.windmillG.set(obj.id, wm);
          this.container.addChild(wm);
          break;
        }
      }
      if (selected) this.drawSelection(g, obj);
    }
  }

  private drawSelection(g: Graphics, obj: LayoutObject): void {
    let x0: number, y0: number, x1: number, y1: number;
    switch (obj.type) {
      case 'nail':
        (x0 = obj.x - obj.radius), (y0 = obj.y - obj.radius);
        (x1 = obj.x + obj.radius), (y1 = obj.y + obj.radius);
        break;
      case 'windmill':
        (x0 = obj.x - obj.radius), (y0 = obj.y - obj.radius);
        (x1 = obj.x + obj.radius), (y1 = obj.y + obj.radius);
        break;
      case 'pocket':
        (x0 = obj.x - obj.width / 2), (y0 = obj.y - 12);
        (x1 = obj.x + obj.width / 2), (y1 = obj.y + 12);
        break;
      case 'wall':
        (x0 = Math.min(obj.x1, obj.x2)), (y0 = Math.min(obj.y1, obj.y2));
        (x1 = Math.max(obj.x1, obj.x2)), (y1 = Math.max(obj.y1, obj.y2));
        // 端点ハンドル
        g.circle(obj.x1, obj.y1, 7).stroke({ width: 2, color: 0xffe14d });
        g.circle(obj.x2, obj.y2, 7).stroke({ width: 2, color: 0xffe14d });
        break;
    }
    g.rect(x0 - 8, y0 - 8, x1 - x0 + 16, y1 - y0 + 16).stroke({
      width: 2,
      color: 0xffe14d,
      alpha: 0.9,
    });
  }

  /** 風車の回転を物理に同期(プレイ中のみ呼ぶ) */
  updateWindmills(physics: PhysicsWorld): void {
    physics.forEachWindmill((id, angle) => {
      const wm = this.windmillG.get(id);
      if (wm) wm.rotation = angle;
    });
  }
}
