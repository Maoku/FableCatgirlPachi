import type { Container, FederatedPointerEvent } from 'pixi.js';
import type { LayoutObject, PocketRole, WallObj } from '../types';
import type { LayoutRef } from '../core/Game';

export type EditorTool =
  | 'select'
  | 'nail'
  | 'wall'
  | 'windmill'
  | 'pocket-start'
  | 'pocket-attacker'
  | 'pocket-out';

interface DragState {
  obj: LayoutObject;
  /** wall のときは端点単位でドラッグできる */
  part: 'body' | 'p1' | 'p2';
  offX: number;
  offY: number;
}

/**
 * 盤面エディタ。Pixi ステージ上のポインタ操作でレイアウトを編集する。
 * 変更は layoutRef.current を直接書き換え、onChange で通知する
 * (保存・再描画・プロパティパネル更新は呼び出し側の責務)。
 */
export class EditorMode {
  active = false;
  tool: EditorTool = 'select';
  selected: LayoutObject | null = null;

  private drag: DragState | null = null;
  private wallDraft: WallObj | null = null;
  private nextId = 1;

  constructor(
    private layoutRef: LayoutRef,
    private onChange: () => void,
  ) {}

  attach(stage: Container): void {
    stage.on('pointerdown', (e) => this.onDown(e));
    stage.on('pointermove', (e) => this.onMove(e));
    stage.on('pointerup', () => this.onUp());
    stage.on('pointerupoutside', () => this.onUp());
  }

  setTool(tool: EditorTool): void {
    this.tool = tool;
    if (tool !== 'select') this.select(null);
  }

  private select(obj: LayoutObject | null): void {
    this.selected = obj;
    this.onChange();
  }

  private genId(prefix: string): string {
    const ids = new Set(this.layoutRef.current.objects.map((o) => o.id));
    let id: string;
    do {
      id = `${prefix}-e${this.nextId++}`;
    } while (ids.has(id));
    return id;
  }

  private onDown(e: FederatedPointerEvent): void {
    if (!this.active) return;
    const { x, y } = e.global;

    if (this.tool === 'select') {
      const hit = this.hitTest(x, y);
      if (hit) {
        this.selected = hit.obj;
        this.drag = this.makeDrag(hit.obj, hit.part, x, y);
      } else {
        this.selected = null;
      }
      this.onChange();
      return;
    }

    // 配置系ツール
    const objects = this.layoutRef.current.objects;
    let obj: LayoutObject;
    switch (this.tool) {
      case 'nail':
        obj = { id: this.genId('nail'), type: 'nail', x, y, radius: 4.5 };
        break;
      case 'windmill':
        obj = { id: this.genId('wm'), type: 'windmill', x, y, radius: 24, speed: 3 };
        break;
      case 'wall':
        // ドラッグで線を引く。onUp で確定
        this.wallDraft = { id: this.genId('wall'), type: 'wall', x1: x, y1: y, x2: x, y2: y };
        objects.push(this.wallDraft);
        this.selected = this.wallDraft;
        this.drag = { obj: this.wallDraft, part: 'p2', offX: 0, offY: 0 };
        this.onChange();
        return;
      case 'pocket-start':
      case 'pocket-attacker':
      case 'pocket-out': {
        const role = this.tool.slice('pocket-'.length) as PocketRole;
        obj = { id: this.genId(role), type: 'pocket', x, y, width: 60, role };
        break;
      }
      default:
        return;
    }
    objects.push(obj);
    this.selected = obj;
    this.onChange();
  }

  private makeDrag(obj: LayoutObject, part: DragState['part'], x: number, y: number): DragState {
    if (obj.type === 'wall') {
      if (part === 'p1') return { obj, part, offX: obj.x1 - x, offY: obj.y1 - y };
      if (part === 'p2') return { obj, part, offX: obj.x2 - x, offY: obj.y2 - y };
      return { obj, part: 'body', offX: obj.x1 - x, offY: obj.y1 - y };
    }
    return { obj, part: 'body', offX: obj.x - x, offY: obj.y - y };
  }

  private onMove(e: FederatedPointerEvent): void {
    if (!this.active || !this.drag) return;
    const { x, y } = e.global;
    const { obj, part, offX, offY } = this.drag;
    if (obj.type === 'wall') {
      if (part === 'p1') {
        obj.x1 = x + offX;
        obj.y1 = y + offY;
      } else if (part === 'p2') {
        obj.x2 = x + offX;
        obj.y2 = y + offY;
      } else {
        const dx = x + offX - obj.x1;
        const dy = y + offY - obj.y1;
        obj.x1 += dx;
        obj.y1 += dy;
        obj.x2 += dx;
        obj.y2 += dy;
      }
    } else {
      obj.x = x + offX;
      obj.y = y + offY;
    }
    this.onChange();
  }

  private onUp(): void {
    if (!this.active) return;
    if (this.wallDraft) {
      // 短すぎる壁(クリックだけ)は捨てる
      const w = this.wallDraft;
      if (Math.hypot(w.x2 - w.x1, w.y2 - w.y1) < 12) {
        this.removeObject(w);
        this.selected = null;
      }
      this.wallDraft = null;
      this.onChange();
    }
    this.drag = null;
  }

  deleteSelected(): void {
    if (!this.selected) return;
    this.removeObject(this.selected);
    this.selected = null;
    this.onChange();
  }

  private removeObject(obj: LayoutObject): void {
    const objects = this.layoutRef.current.objects;
    const i = objects.indexOf(obj);
    if (i >= 0) objects.splice(i, 1);
  }

  /** 選択中オブジェクトのプロパティを更新(パネルの入力から) */
  updateSelected(patch: Partial<Record<string, number | string>>): void {
    if (!this.selected) return;
    Object.assign(this.selected, patch);
    this.onChange();
  }

  private hitTest(
    x: number,
    y: number,
  ): { obj: LayoutObject; part: DragState['part'] } | null {
    const objects = this.layoutRef.current.objects;
    // 後に描かれたもの(配列の後ろ)を優先
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      switch (o.type) {
        case 'nail':
          if (Math.hypot(o.x - x, o.y - y) <= Math.max(o.radius + 6, 12)) {
            return { obj: o, part: 'body' };
          }
          break;
        case 'windmill':
          if (Math.hypot(o.x - x, o.y - y) <= o.radius + 4) return { obj: o, part: 'body' };
          break;
        case 'pocket':
          if (Math.abs(o.x - x) <= o.width / 2 + 6 && Math.abs(o.y - y) <= 18) {
            return { obj: o, part: 'body' };
          }
          break;
        case 'wall': {
          if (Math.hypot(o.x1 - x, o.y1 - y) <= 12) return { obj: o, part: 'p1' };
          if (Math.hypot(o.x2 - x, o.y2 - y) <= 12) return { obj: o, part: 'p2' };
          if (this.distToSegment(x, y, o) <= 9) return { obj: o, part: 'body' };
          break;
        }
      }
    }
    return null;
  }

  private distToSegment(px: number, py: number, w: WallObj): number {
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - w.x1) * dx + (py - w.y1) * dy) / len2));
    return Math.hypot(px - (w.x1 + t * dx), py - (w.y1 + t * dy));
  }
}
