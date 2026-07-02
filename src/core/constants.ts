// 盤面の論理座標系は pachi.png のピクセル座標(1123x1401)に一致させる
export const BOARD_W = 1123;
export const BOARD_H = 1401;

// 物理エンジンはメートル系。100px = 1m
export const PPM = 100;

export const BALL_R = 9; // px
export const FIXED_DT = 1 / 120; // 物理の固定タイムステップ(秒)

// 盤面(遊技領域)の外周楕円
export const FIELD_CX = 562;
export const FIELD_CY = 690;
export const FIELD_RX = 445;
export const FIELD_RY = 540;

// 発射レール(外周の内側の円弧)。玉はレールと外周の間の溝を左側から上っていく
export const RAIL_RX = 415;
export const RAIL_RY = 510;
export const RAIL_FROM_DEG = 96; // レール下端(左下)
export const RAIL_TO_DEG = 245; // 玉の放出口(左上)

// 中央液晶(玉が流れない島)の輪郭
export const DISPLAY_POLY: number[][] = [
  [330, 750],
  [330, 335],
  [562, 285],
  [794, 335],
  [794, 750],
  [330, 750],
];

// 発射位置(レール溝の左下部)と発射方向(溝に沿って左上へ)
export const LAUNCH_POS = { x: 473, y: 1204 };
export const LAUNCH_DIR = { x: -0.968, y: -0.251 };
// レール溝の摩擦・コーナー衝突による減速を織り込んだ実測ベースの値。
// 強度 0.45 前後で盤面に届き、1.0 で左端までオーバーシュートする
export const LAUNCH_MIN_V = 13; // m/s
export const LAUNCH_MAX_V = 23;

// この y(px)を超えた玉は消滅(フェイルセーフ)
export const BALL_KILL_Y = 1330;
