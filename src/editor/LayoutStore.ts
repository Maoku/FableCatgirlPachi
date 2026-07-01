import type { Layout, LayoutObject } from '../types';
import { createDefaultLayout } from '../layout/defaultLayout';

const STORAGE_KEY = 'fcp-layout-v1';

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateObject(o: unknown): o is LayoutObject {
  if (typeof o !== 'object' || o === null) return false;
  const obj = o as Record<string, unknown>;
  if (typeof obj.id !== 'string') return false;
  switch (obj.type) {
    case 'nail':
      return isFiniteNum(obj.x) && isFiniteNum(obj.y) && isFiniteNum(obj.radius);
    case 'wall':
      return (
        isFiniteNum(obj.x1) && isFiniteNum(obj.y1) && isFiniteNum(obj.x2) && isFiniteNum(obj.y2)
      );
    case 'windmill':
      return (
        isFiniteNum(obj.x) && isFiniteNum(obj.y) && isFiniteNum(obj.radius) && isFiniteNum(obj.speed)
      );
    case 'pocket':
      return (
        isFiniteNum(obj.x) &&
        isFiniteNum(obj.y) &&
        isFiniteNum(obj.width) &&
        ['start', 'attacker', 'out'].includes(obj.role as string)
      );
    default:
      return false;
  }
}

/** 未知データを Layout として検証する。壊れていれば null */
export function parseLayout(json: string): Layout | null {
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    if (data.version !== 1) return null;
    const board = data.board as Record<string, unknown> | undefined;
    if (!board || !isFiniteNum(board.width) || !isFiniteNum(board.height)) return null;
    if (!Array.isArray(data.objects)) return null;
    const objects = data.objects.filter(validateObject);
    return {
      version: 1,
      board: { width: board.width, height: board.height },
      objects,
    };
  } catch {
    return null;
  }
}

/** レイアウトの永続化(localStorage)と JSON ファイル入出力 */
export class LayoutStore {
  /** 保存済みレイアウトを読む。なければ初期盤面 */
  load(): Layout {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const layout = parseLayout(saved);
      if (layout) return layout;
    }
    return createDefaultLayout();
  }

  save(layout: Layout): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }

  /** 保存を消して初期盤面に戻す */
  reset(): Layout {
    localStorage.removeItem(STORAGE_KEY);
    return createDefaultLayout();
  }

  /** レイアウトを JSON ファイルとしてダウンロード */
  exportFile(layout: Layout): void {
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pachi-layout.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  /** JSON ファイルからレイアウトを読み込む */
  async importFile(file: File): Promise<Layout | null> {
    return parseLayout(await file.text());
  }
}
