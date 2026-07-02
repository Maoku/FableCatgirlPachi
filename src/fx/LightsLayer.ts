import { Container, Sprite, Texture } from 'pixi.js';
import { FIELD_CX, FIELD_CY, FIELD_RX, FIELD_RY } from '../core/constants';

/** 放射状グラデーションのグローテクスチャを生成する */
function createGlowTexture(): Texture {
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

interface Light {
  sprite: Sprite;
  /** 累積位相。速度が変わっても連続に保つ(切替時のアルファ飛びを防ぐ) */
  acc: number;
  /** 明滅の角速度 rad/s。ゆっくりした「呼吸」にする */
  speed: number;
  baseAlpha: number;
  amp: number;
}

/**
 * 台枠・役物の LED 風グロー演出。
 * 正弦波の緩やかな明滅のみで、急峻な点滅(ストロボ)は使わない。
 * 大当り中は少しだけ速く・明るくなるが、それでも約 0.5Hz 以下に抑える。
 */
export class LightsLayer {
  readonly container = new Container();
  private lights: Light[] = [];
  /** 興奮度 0..1。setExcited の目標値へ滑らかに遷移する */
  private excitement = 0;
  private excitementTarget = 0;

  constructor() {
    this.container.eventMode = 'none';
    const tex = createGlowTexture();

    // 外周フレームのリング LED(位相をずらして光が流れて見えるように)
    const ringPalette = [0xff5fa2, 0xc16fff, 0xffd166];
    const N = 30;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const x = FIELD_CX + (FIELD_RX + 38) * Math.cos(a);
      const y = FIELD_CY + (FIELD_RY + 45) * Math.sin(a);
      this.add(tex, x, y, 0.55, ringPalette[i % 3], i * 0.55, 1.1 + (i % 4) * 0.12, 0.05, 0.15);
    }

    // 役物(肉球・ハート・パネル・ボタンなど画像上の LED 部)
    const features: [number, number, number, number][] = [
      [562, 58, 1.5, 0xff8ec1], // 上部の肉球
      [160, 695, 1.1, 0xffd166], // 大当り確率バッジ
      [885, 495, 1.0, 0xff8ec1], // 右上キャラパネル
      [905, 645, 1.3, 0xff5fa2], // ハート役物
      [880, 835, 1.0, 0xff8ec1], // 右下キャラパネル
      [855, 1010, 0.9, 0xffd166], // LUCKY
      [550, 1245, 1.0, 0xc16fff], // 中央ボタン
      [890, 1290, 1.4, 0xff5fa2], // ピンクの大ボタン
    ];
    features.forEach(([x, y, scale, tint], i) => {
      this.add(tex, x, y, scale, tint, i * 1.3, 0.8 + (i % 3) * 0.15, 0.06, 0.2);
    });
  }

  private add(
    tex: Texture,
    x: number,
    y: number,
    scale: number,
    tint: number,
    phase: number,
    speed: number,
    baseAlpha: number,
    amp: number,
  ): void {
    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.scale.set(scale);
    sprite.tint = tint;
    sprite.alpha = baseAlpha;
    sprite.blendMode = 'add';
    this.container.addChild(sprite);
    this.lights.push({ sprite, acc: phase, speed, baseAlpha, amp });
  }

  /** 大当り中などに少しだけ明滅を強める(遷移は update 内でイージング) */
  setExcited(on: boolean): void {
    this.excitementTarget = on ? 1 : 0;
  }

  update(dtMs: number): void {
    if (!this.container.visible) return;
    const dt = dtMs / 1000;
    // 興奮度は約0.5秒かけて滑らかに遷移(急な明るさ変化を避ける)
    this.excitement += (this.excitementTarget - this.excitement) * Math.min(1, dt * 4);
    // 通常: 周期 4〜8 秒程度 / 大当り中: 約2倍だがそれでも 0.5Hz 以下
    const speedMul = 1 + 0.9 * this.excitement;
    const ampMul = 1 + 0.7 * this.excitement;
    for (const l of this.lights) {
      l.acc += dt * l.speed * speedMul;
      const wave = 0.5 + 0.5 * Math.sin(l.acc);
      l.sprite.alpha = Math.min(0.5, l.baseAlpha + l.amp * ampMul * wave);
    }
  }
}
