import './style.css';
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { initRapier } from './core/PhysicsWorld';
import { Game, type GameMode, type LayoutRef } from './core/Game';
import { BoardRenderer } from './core/BoardRenderer';
import { Hud } from './ui/Hud';
import { EditorMode } from './editor/EditorMode';
import { LayoutStore } from './editor/LayoutStore';
import { EffectsLayer } from './fx/EffectsLayer';
import { LightsLayer } from './fx/LightsLayer';
import { AutoPlayer } from './game/AutoPlayer';
import { BOARD_W, BOARD_H, BALL_R } from './core/constants';

function createBallTexture(app: Application): Texture {
  const g = new Graphics()
    .circle(BALL_R, BALL_R, BALL_R)
    .fill(0xe9e9f2)
    .stroke({ width: 1.5, color: 0x8f8fa8 })
    .circle(BALL_R - 3, BALL_R - 3, BALL_R / 3)
    .fill({ color: 0xffffff, alpha: 0.9 });
  return app.renderer.generateTexture(g);
}

async function boot(): Promise<void> {
  await initRapier();

  const app = new Application();
  await app.init({
    width: BOARD_W,
    height: BOARD_H,
    background: '#0a0308',
    antialias: true,
  });
  document.getElementById('board')!.appendChild(app.canvas);
  app.stage.eventMode = 'static';
  app.stage.hitArea = new Rectangle(0, 0, BOARD_W, BOARD_H);

  // 背景(パチンコ台の画像)とキャラクター(大当り演出用)
  const [bgTexture, charTexture] = await Promise.all([
    Assets.load<Texture>('assets/pachi.png'),
    Assets.load<Texture>('assets/character.png'),
  ]);
  const bg = new Sprite(bgTexture);
  bg.width = BOARD_W;
  bg.height = BOARD_H;
  app.stage.addChild(bg);

  // レイヤ構成: 背景 → LED → オーバーレイ(釘等) → 玉 → 演出
  const lights = new LightsLayer();
  app.stage.addChild(lights.container);
  const boardRenderer = new BoardRenderer();
  app.stage.addChild(boardRenderer.container);
  const ballLayer = new Container();
  app.stage.addChild(ballLayer);
  const fx = new EffectsLayer(charTexture);
  app.stage.addChild(fx.container);

  const store = new LayoutStore();
  const layoutRef: LayoutRef = { current: store.load() };
  const game = new Game(layoutRef, ballLayer, createBallTexture(app), fx);
  const auto = new AutoPlayer(game);

  const redraw = () =>
    boardRenderer.redraw(layoutRef.current, {
      editMode: game.mode === 'edit',
      selectedId: editor.selected?.id ?? null,
      attackerOpen: game.attackerOpen,
    });
  game.onVisualChange = () => redraw();

  // エディタ。変更のたびに保存(debounce)と再描画を行う
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const editor = new EditorMode(layoutRef, () => {
    redraw();
    hud.showSelected(editor.selected);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.save(layoutRef.current), 400);
  });
  editor.attach(app.stage);

  // エディット中の背景の明るさ(%)。編集対象を見やすくするため暗くできる
  let editBrightness = Number(localStorage.getItem('fcp-edit-brightness') ?? '50');
  if (!Number.isFinite(editBrightness) || editBrightness < 10 || editBrightness > 100) {
    editBrightness = 50;
  }
  const applyBgBrightness = () => {
    const p = game.mode === 'edit' ? editBrightness : 100;
    const gray = Math.round((255 * p) / 100);
    bg.tint = (gray << 16) | (gray << 8) | gray;
  };
  const setEditBrightness = (percent: number) => {
    editBrightness = Math.min(100, Math.max(10, percent));
    localStorage.setItem('fcp-edit-brightness', String(editBrightness));
    applyBgBrightness();
  };

  const setMode = (mode: GameMode) => {
    if (mode === 'edit') auto.stop('エディットモードへ切替');
    game.setMode(mode);
    editor.active = mode === 'edit';
    if (mode === 'play') store.save(layoutRef.current);
    hud.applyMode(mode);
    applyBgBrightness();
    redraw();
  };

  const replaceLayout = async (src: 'reset' | File) => {
    if (src === 'reset') {
      layoutRef.current = store.reset();
    } else {
      const imported = await store.importFile(src);
      if (!imported) {
        alert('レイアウトファイルを読み込めませんでした(形式が不正です)');
        return;
      }
      layoutRef.current = imported;
      store.save(imported);
    }
    editor.selected = null;
    hud.showSelected(null);
    if (game.mode === 'play') game.rebuildPhysics();
    redraw();
  };

  const hud = new Hud({
    game,
    auto,
    editor,
    store,
    layoutRef,
    setMode,
    replaceLayout,
    editBrightness,
    setEditBrightness,
  });
  redraw();

  app.ticker.add((ticker) => {
    auto.update(ticker.deltaMS);
    game.update(ticker.deltaMS);
    // LED はプレイ中のみ(エディット時は盤面を見やすく保つ)
    lights.container.visible = game.mode === 'play';
    lights.setExcited(game.bonus !== null);
    lights.update(ticker.deltaMS);
    if (game.mode === 'play') boardRenderer.updateWindmills(game.physics);
  });

  // デバッグ・動作検証用
  (window as unknown as Record<string, unknown>).__fcp = {
    app,
    game,
    auto,
    lights,
    layoutRef,
    redraw,
    editor,
    store,
    setMode,
  };
}

boot();
