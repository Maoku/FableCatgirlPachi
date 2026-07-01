import './style.css';
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { initRapier } from './core/PhysicsWorld';
import { Game, type GameMode, type LayoutRef } from './core/Game';
import { BoardRenderer } from './core/BoardRenderer';
import { Hud } from './ui/Hud';
import { EditorMode } from './editor/EditorMode';
import { LayoutStore } from './editor/LayoutStore';
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

  // 背景(パチンコ台の画像)
  const bgTexture = await Assets.load<Texture>('assets/pachi.png');
  const bg = new Sprite(bgTexture);
  bg.width = BOARD_W;
  bg.height = BOARD_H;
  app.stage.addChild(bg);

  // レイヤ構成: 背景 → オーバーレイ(釘等) → 玉
  const boardRenderer = new BoardRenderer();
  app.stage.addChild(boardRenderer.container);
  const ballLayer = new Container();
  app.stage.addChild(ballLayer);

  const store = new LayoutStore();
  const layoutRef: LayoutRef = { current: store.load() };
  const game = new Game(layoutRef, ballLayer, createBallTexture(app));

  const redraw = () =>
    boardRenderer.redraw(layoutRef.current, {
      editMode: game.mode === 'edit',
      selectedId: editor.selected?.id ?? null,
      attackerOpen: false,
    });

  // エディタ。変更のたびに保存(debounce)と再描画を行う
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const editor = new EditorMode(layoutRef, () => {
    redraw();
    hud.showSelected(editor.selected);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.save(layoutRef.current), 400);
  });
  editor.attach(app.stage);

  const setMode = (mode: GameMode) => {
    game.setMode(mode);
    editor.active = mode === 'edit';
    if (mode === 'play') store.save(layoutRef.current);
    hud.applyMode(mode);
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

  const hud = new Hud({ game, editor, store, layoutRef, setMode, replaceLayout });
  redraw();

  app.ticker.add((ticker) => {
    game.update(ticker.deltaMS);
    if (game.mode === 'play') boardRenderer.updateWindmills(game.physics);
  });

  // デバッグ・動作検証用
  (window as unknown as Record<string, unknown>).__fcp = {
    app,
    game,
    layoutRef,
    redraw,
    editor,
    store,
    setMode,
  };
}

boot();
