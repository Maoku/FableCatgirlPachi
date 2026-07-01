import type { Game } from '../core/Game';

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} not found`);
  return e as T;
}

/** DOM 側の操作パネル。ゲーム状態の表示と入力をつなぐ */
export class Hud {
  private stockEl = el<HTMLSpanElement>('stock');
  private launchedEl = el<HTMLSpanElement>('stat-launched');
  private startsEl = el<HTMLSpanElement>('stat-starts');

  constructor(private game: Game) {
    const power = el<HTMLInputElement>('power');
    const powerLabel = el<HTMLSpanElement>('power-label');
    power.addEventListener('input', () => {
      this.game.firePower = Number(power.value) / 100;
      powerLabel.textContent = power.value;
    });

    const fireBtn = el<HTMLButtonElement>('fire-btn');
    const setFiring = (on: boolean) => {
      if (this.game.mode === 'play') this.game.firing = on;
      fireBtn.classList.toggle('active', on && this.game.mode === 'play');
    };
    fireBtn.addEventListener('pointerdown', () => setFiring(true));
    fireBtn.addEventListener('pointerup', () => setFiring(false));
    fireBtn.addEventListener('pointerleave', () => setFiring(false));

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      if (this.isTypingTarget(e.target)) return;
      e.preventDefault();
      setFiring(true);
    });
    window.addEventListener('keyup', (e) => {
      if (e.code !== 'Space') return;
      setFiring(false);
    });

    el<HTMLButtonElement>('refill-btn').addEventListener('click', () => {
      this.game.ballStock += 500;
    });

    setInterval(() => this.refresh(), 150);
    this.refresh();
  }

  private isTypingTarget(t: EventTarget | null): boolean {
    return (
      t instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(t.tagName)
    );
  }

  refresh(): void {
    this.stockEl.textContent = String(this.game.ballStock);
    this.launchedEl.textContent = String(this.game.stats.launched);
    this.startsEl.textContent = String(this.game.stats.starts);
  }
}
