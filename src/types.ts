export type PocketRole = 'start' | 'attacker' | 'out';

export interface NailObj {
  id: string;
  type: 'nail';
  x: number;
  y: number;
  radius: number;
}

export interface WallObj {
  id: string;
  type: 'wall';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface WindmillObj {
  id: string;
  type: 'windmill';
  x: number;
  y: number;
  radius: number;
  /** 回転速度 rad/s(負で逆回転) */
  speed: number;
}

export interface PocketObj {
  id: string;
  type: 'pocket';
  x: number;
  y: number;
  width: number;
  role: PocketRole;
}

export type LayoutObject = NailObj | WallObj | WindmillObj | PocketObj;

export interface Layout {
  version: 1;
  board: { width: number; height: number };
  objects: LayoutObject[];
}
