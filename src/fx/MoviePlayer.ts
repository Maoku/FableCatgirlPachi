import { Container, Sprite, Texture, VideoSource } from 'pixi.js';
import { BOARD_W, BOARD_H } from '../core/constants';

// 素材は 1920×1080 だが実コンテンツは中央の縦長領域(左右は黒帯)。
// クロップ幅は、盤面全体へ拡大したとき台の各部位が背景 pachi.png と重なるよう
// SSIM 最大化で較正した値(872×1080 中央切り出し → 1123×1401)
const CONTENT_W = 872;
const CONTENT_H = 1080;
const VIEW_W = BOARD_W;
const VIEW_H = BOARD_H;

// 表示切替はフェード(半透明)で行い、背景画像と自然につなぐ
const FADE_TIME = 0.4; // 秒
// 抽選開始(loco)の連続再生を抑制する間隔。前回の再生終了からこの時間は再生しない
const LOCO_INTERVAL_MS = 5000;

const SOURCES = {
  loco: ['assets/movie/loco00.mp4', 'assets/movie/loco01.mp4'],
  atari: ['assets/movie/atari00.mp4', 'assets/movie/atari01.mp4'],
} as const;

export type MovieKind = keyof typeof SOURCES;

interface Clip {
  kind: MovieKind;
  video: HTMLVideoElement;
  texture: Texture | null; // テクスチャ生成に失敗したら null(動画なしで進行)
  failed: boolean;
}

/**
 * 演出用動画のプレイヤー。<video> + VideoSource テクスチャを動画ごとに 1 度だけ
 * 生成して再利用する。ロード失敗・未ロードでも例外にせず、単に表示しない
 * (動画がなくても既存演出だけで成立させる)。
 */
export class MoviePlayer {
  /** 背景(pachi.png)の直上に addChild する表示ノード(玉・釘・演出の背面) */
  readonly view = new Container();
  private sprite = new Sprite();
  private clips = new Map<string, Clip>();
  private current: Clip | null = null;
  private muted = true;
  private targetAlpha = 0;
  private locoNextAt = 0; // 次に loco を再生してよい時刻(performance.now 基準)

  constructor() {
    this.view.addChild(this.sprite);
    this.view.visible = false;
    this.view.alpha = 0;
    this.view.eventMode = 'none';

    // 非表示タブではブラウザがミュート動画を省電力停止するため、復帰時に再開する
    document.addEventListener('visibilitychange', () => {
      const clip = this.current;
      if (document.visibilityState === 'visible' && clip && clip.video.paused) {
        clip.video.play().catch(() => {});
      }
    });
  }

  /** 全動画を preload='auto' で先読みする(起動はブロックしない) */
  preload(): void {
    for (const kind of Object.keys(SOURCES) as MovieKind[]) {
      for (const src of SOURCES[kind]) this.ensureClip(src, kind);
    }
  }

  /**
   * 2 本からランダムに選んで先頭から再生し、フェードインで表示する。
   * loco はループ、atari は 1 回のみ。loco は前回の再生終了から
   * LOCO_INTERVAL_MS 経つまで再生しない(連続再生の抑制)
   */
  play(kind: MovieKind): void {
    if (kind === 'loco' && performance.now() < this.locoNextAt) return;
    const srcs = SOURCES[kind];
    const clip = this.ensureClip(srcs[Math.floor(Math.random() * srcs.length)], kind);
    if (clip.failed || !clip.texture) {
      this.stop();
      return;
    }
    if (this.current && this.current !== clip) {
      this.current.video.pause();
      this.current.video.currentTime = 0;
    }
    this.current = clip;
    this.fit(clip);
    clip.video.currentTime = 0;
    clip.video.muted = this.muted;
    // 自動再生ブロックや非表示タブで再生できない場合は静止フレームのまま表示を続け、
    // タブ復帰時(visibilitychange)に再開を試みる
    clip.video.play().catch(() => {});
    this.targetAlpha = 1;
    this.view.visible = true;
  }

  /** フェードアウトを開始する。フェード完了時に実停止(pause + 巻き戻し)する */
  stop(): void {
    if (this.current?.kind === 'loco') {
      this.locoNextAt = performance.now() + LOCO_INTERVAL_MS;
    }
    this.targetAlpha = 0;
    if (this.view.alpha <= 0) this.finishStop();
  }

  /** フェードの進行。毎フレーム呼ぶ(EffectsLayer.update から) */
  update(dtMs: number): void {
    const step = dtMs / 1000 / FADE_TIME;
    const a = this.view.alpha;
    if (a < this.targetAlpha) {
      this.view.alpha = Math.min(this.targetAlpha, a + step);
    } else if (a > this.targetAlpha) {
      const next = Math.max(this.targetAlpha, a - step);
      this.view.alpha = next;
      // フェードアウト中も再生を続け、消え切ってから実停止する
      if (next <= 0) this.finishStop();
    }
  }

  private finishStop(): void {
    this.view.visible = false;
    if (!this.current) return;
    this.current.video.pause();
    this.current.video.currentTime = 0;
    this.current = null;
  }

  /** ミュート切替。再生中の動画にも即時反映する(ユーザージェスチャ内で呼ぶこと) */
  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const clip of this.clips.values()) clip.video.muted = muted;
  }

  private ensureClip(src: string, kind: MovieKind): Clip {
    let clip = this.clips.get(src);
    if (clip) return clip;

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.loop = kind === 'loco';
    video.playsInline = true;
    video.setAttribute('playsinline', ''); // 旧 iOS Safari 対策
    video.src = src;

    let texture: Texture | null = null;
    try {
      texture = new Texture({
        source: new VideoSource({ resource: video, autoPlay: false, autoLoad: true }),
        dynamic: true, // メタデータ確定後に frame(黒帯クロップ)を書き換えるため
      });
    } catch {
      texture = null;
    }

    clip = { kind, video, texture, failed: texture === null };
    this.clips.set(src, clip);

    video.addEventListener('error', () => {
      clip!.failed = true;
      if (this.current === clip) this.stop();
    });
    // メタデータ到着でテクスチャ実寸が確定するため、表示中なら枠に合わせ直す
    video.addEventListener('loadedmetadata', () => {
      if (this.current === clip) this.fit(clip!);
    });
    if (kind === 'atari') {
      video.addEventListener('ended', () => {
        if (this.current === clip) this.stop();
      });
    }
    return clip;
  }

  private fit(clip: Clip): void {
    if (!clip.texture) return;
    // メタデータ確定後(実寸が入ってから)に左右の黒帯を切り落とす
    const source = clip.texture.source;
    if (source.width > CONTENT_W && clip.texture.frame.width !== CONTENT_W) {
      clip.texture.frame.set(
        (source.width - CONTENT_W) / 2,
        Math.max(0, (source.height - CONTENT_H) / 2),
        CONTENT_W,
        CONTENT_H,
      );
      clip.texture.updateUvs();
    }
    this.sprite.texture = clip.texture;
    this.sprite.setSize(VIEW_W, VIEW_H);
  }
}
