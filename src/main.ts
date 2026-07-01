import './style.css';
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { initRapier, PhysicsWorld } from './core/PhysicsWorld';
import { BOARD_W, BOARD_H, BALL_R, BALL_KILL_Y } from './core/constants';

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

  // 背景(パチンコ台の画像)
  const bgTexture = await Assets.load<Texture>('assets/pachi.png');
  const bg = new Sprite(bgTexture);
  bg.width = BOARD_W;
  bg.height = BOARD_H;
  app.stage.addChild(bg);

  const ballLayer = new Container();
  app.stage.addChild(ballLayer);

  const physics = new PhysicsWorld();
  const ballTexture = createBallTexture(app);
  const ballSprites = new Map<number, Sprite>();

  // Phase 0 テスト: クリックした場所に玉を落とす
  app.stage.eventMode = 'static';
  app.stage.hitArea = new Rectangle(0, 0, BOARD_W, BOARD_H);
  app.stage.on('pointerdown', (e) => {
    physics.spawnBall(e.global.x, e.global.y, 0, 0);
  });

  app.ticker.add((ticker) => {
    physics.step(ticker.deltaMS);

    // 物理→描画の同期。消えた玉のスプライトも回収する
    const seen = new Set<number>();
    const dead: number[] = [];
    physics.forEachBall((id, x, y) => {
      if (y > BALL_KILL_Y) {
        dead.push(id);
        return;
      }
      seen.add(id);
      let sprite = ballSprites.get(id);
      if (!sprite) {
        sprite = new Sprite(ballTexture);
        sprite.anchor.set(0.5);
        ballSprites.set(id, sprite);
        ballLayer.addChild(sprite);
      }
      sprite.position.set(x, y);
    });
    for (const id of dead) physics.removeBall(id);
    for (const [id, sprite] of ballSprites) {
      if (!seen.has(id)) {
        sprite.destroy();
        ballSprites.delete(id);
      }
    }
  });
}

boot();
