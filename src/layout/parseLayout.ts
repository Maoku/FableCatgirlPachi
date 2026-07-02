import type { Layout, LayoutObject } from '../types';

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

/** 未知のデータを Layout として検証する。壊れていれば null。不正なオブジェクトは除外する */
export function parseLayoutData(data: unknown): Layout | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.version !== 1) return null;
  const board = d.board as Record<string, unknown> | undefined;
  if (!board || !isFiniteNum(board.width) || !isFiniteNum(board.height)) return null;
  if (!Array.isArray(d.objects)) return null;
  const objects = d.objects.filter(validateObject);
  return {
    version: 1,
    board: { width: board.width, height: board.height },
    objects,
  };
}

/** JSON 文字列版 */
export function parseLayout(json: string): Layout | null {
  try {
    return parseLayoutData(JSON.parse(json));
  } catch {
    return null;
  }
}
