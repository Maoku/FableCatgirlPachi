import { Container, Graphics, Sprite, Texture, VideoSource } from 'pixi.js';

// 液晶エリアに重ねる表示枠(中心はリールに合わせる)。
// 素材は 1920×1080 だが実コンテンツは中央の縦長 854×1080(左右は黒帯)のため、
// 黒帯を切り出した縦長で表示する
const CONTENT_W = 854;
const CONTENT_H = 1080;
const VIEW_W = 460;
const VIEW_H = 580;
const CORNER = 18;

const SOURCES = {
  loco: ['assets/movie/loco00.mp4', 'assets/movie/loco01.mp4'],
  atari: ['assets/movie/atari00.mp4', 'assets/movie/atari01.mp4'],
} as const;

export type MovieKind = keyof typeof SOURCES;

interface Clip {
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
  /** EffectsLayer が最背面に addChild する表示ノード */
  readonly view = new Container();
  private sprite = new Sprite();
  private clips = new Map<string, Clip>();
  private current: Clip | null = null;
  private muted = true;

  constructor(centerX: number, centerY: number) {
    const x = centerX - VIEW_W / 2;
    const y = centerY - VIEW_H / 2;
    this.view.position.set(x, y);

    const mask = new Graphics().roundRect(0, 0, VIEW_W, VIEW_H, CORNER).fill(0xffffff);
    this.view.addChild(mask);
    this.sprite.mask = mask;
    this.view.addChild(this.sprite);

    // リール枠と揃えた枠線
    const frame = new Graphics()
      .roundRect(0, 0, VIEW_W, VIEW_H, CORNER)
      .stroke({ width: 3, color: 0xff5fa2, alpha: 0.9 });
    this.view.addChild(frame);

    this.view.visible = false;
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

  /** 2 本からランダムに選んで先頭から再生・表示。loco はループ、atari は 1 回のみ */
  play(kind: MovieKind): void {
    const srcs = SOURCES[kind];
    const clip = this.ensureClip(srcs[Math.floor(Math.random() * srcs.length)], kind);
    if (clip.failed || !clip.texture) {
      this.stop();
      return;
    }
    this.current = clip;
    this.fit(clip);
    clip.video.currentTime = 0;
    clip.video.muted = this.muted;
    // 自動再生ブロックや非表示タブで再生できない場合は静止フレームのまま表示を続け、
    // タブ復帰時(visibilitychange)に再開を試みる
    clip.video.play().catch(() => {});
    this.view.visible = true;
  }

  /** 一時停止して非表示(テクスチャ更新も止まり描画負荷を抑える) */
  stop(): void {
    if (this.current) {
      this.current.video.pause();
      this.current.video.currentTime = 0;
    }
    this.current = null;
    this.view.visible = false;
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

    clip = { video, texture, failed: texture === null };
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
