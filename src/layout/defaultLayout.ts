import type { Layout, LayoutObject } from '../types';
import { BOARD_W, BOARD_H } from '../core/constants';

/**
 * pachi.png の絵柄に合わせた初期盤面。
 * エディットモードで調整して localStorage / JSON に保存できる。
 */
export function createDefaultLayout(): Layout {
  const objects: LayoutObject[] = [];
  let n = 0;
  const nail = (x: number, y: number, radius = 4.5) =>
    objects.push({ id: `nail-${n++}`, type: 'nail', x: Math.round(x), y: Math.round(y), radius });

  // 天釘(盤面上部。左上の放出口から飛んでくる玉を散らす)
  // 液晶の屋根との隙間に玉が挟まらないよう 26px 以上離す
  for (let i = 0; i < 9; i++) nail(420 + i * 48, 215);
  for (let i = 0; i < 8; i++) nail(442 + i * 48, 252);

  // 左右サイドチャンネルの釘(液晶の脇を流れ落ちる玉を減速させる)
  // 外周壁・液晶壁との隙間は「玉が挟まらない」よう 26px 以上確保する
  for (let i = 0; i < 8; i++) {
    const y = 380 + i * 76;
    nail(265 + (i % 2) * 30, y);
    nail(855 - (i % 2) * 30, y);
  }

  // 中央の散らし釘
  nail(562, 832);
  nail(502, 895);
  nail(622, 895);
  nail(562, 950);

  // 命釘(スタートチャッカー直上の一対)
  nail(540, 1016);
  nail(584, 1016);

  // 風車
  objects.push({ id: 'wm-left', type: 'windmill', x: 240, y: 555, radius: 24, speed: 3 });
  objects.push({ id: 'wm-right', type: 'windmill', x: 884, y: 555, radius: 24, speed: -3 });
  objects.push({ id: 'wm-center', type: 'windmill', x: 562, y: 785, radius: 20, speed: 2.5 });

  // 道レーン(左右の下部を転がる玉を命釘の上へ運ぶ)。
  // 釘の列だと玉が谷間にはまるため、2D では滑らかな壁で表現する。
  // 左レーンは発射レールに接続して隙間の挟まりを防ぐ。
  // 右レーンと外周壁の間は意図的に玉1個分以上空けて「こぼれ」の抜け道にする。
  objects.push({ id: 'lane-left', type: 'wall', x1: 189, y1: 912, x2: 498, y2: 998 });
  objects.push({ id: 'lane-right', type: 'wall', x1: 934, y1: 918, x2: 626, y2: 998 });

  // 入賞口
  objects.push({ id: 'start', type: 'pocket', x: 562, y: 1020, width: 46, role: 'start' });
  objects.push({ id: 'attacker', type: 'pocket', x: 562, y: 1130, width: 120, role: 'attacker' });
  objects.push({ id: 'out-right', type: 'pocket', x: 624, y: 1210, width: 140, role: 'out' });
  // 発射位置(x=473)と重ならないように、レール溝の最下部だけを覆う
  objects.push({ id: 'out-rail', type: 'pocket', x: 529, y: 1215, width: 50, role: 'out' });

  return {
    version: 1,
    board: { width: BOARD_W, height: BOARD_H },
    objects,
  };
}
