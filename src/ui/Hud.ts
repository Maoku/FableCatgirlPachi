import type { Game, GameMode, LayoutRef } from '../core/Game';
import type { EditorMode, EditorTool } from '../editor/EditorMode';
import type { LayoutStore } from '../editor/LayoutStore';
import type { LayoutObject } from '../types';

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} not found`);
  return e as T;
}

export interface HudContext {
  game: Game;
  editor: EditorMode;
  store: LayoutStore;
  layoutRef: LayoutRef;
  /** モード切替の実処理(main が担当) */
  setMode: (mode: GameMode) => void;
  /** インポート/リセットでレイアウトが差し替わったとき(main が担当) */
  replaceLayout: (json: 'reset' | File) => void;
}

const OBJ_LABEL: Record<LayoutObject['type'], string> = {
  nail: '釘',
  wall: '壁',
  windmill: '風車',
  pocket: '入賞口',
};

/** DOM 側の操作パネル。ゲーム状態の表示と入力をつなぐ */
export class Hud {
  private stockEl = el<HTMLSpanElement>('stock');
  private launchedEl = el<HTMLSpanElement>('stat-launched');
  private startsEl = el<HTMLSpanElement>('stat-starts');
  private modeBtn = el<HTMLButtonElement>('mode-btn');
  private editPanel = el<HTMLElement>('edit-panel');
  private playPanel = el<HTMLElement>('play-panel');
  private props = el<HTMLDivElement>('props');

  constructor(private ctx: HudContext) {
    this.wirePlayControls();
    this.wireModeToggle();
    this.wireEditorTools();
    this.wireProps();
    this.wireFileOps();
    setInterval(() => this.refresh(), 150);
    this.refresh();
  }

  private get game(): Game {
    return this.ctx.game;
  }

  private wirePlayControls(): void {
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
      if (this.isTypingTarget(e.target)) return;
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setFiring(true);
      }
      if ((e.code === 'Delete' || e.code === 'Backspace') && this.game.mode === 'edit') {
        e.preventDefault();
        this.ctx.editor.deleteSelected();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') setFiring(false);
    });

    el<HTMLButtonElement>('refill-btn').addEventListener('click', () => {
      this.game.ballStock += 500;
    });
  }

  private wireModeToggle(): void {
    this.modeBtn.addEventListener('click', () => {
      this.ctx.setMode(this.game.mode === 'play' ? 'edit' : 'play');
    });
  }

  /** モード切替後の表示更新(main の setMode から呼ばれる) */
  applyMode(mode: GameMode): void {
    const editing = mode === 'edit';
    this.editPanel.classList.toggle('hidden', !editing);
    this.playPanel.classList.toggle('hidden', editing);
    this.modeBtn.textContent = editing ? '▶ プレイモードへ(変更を反映)' : '🔧 エディットモードへ';
    if (!editing) this.showSelected(null);
  }

  private wireEditorTools(): void {
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button.tool')];
    for (const btn of buttons) {
      btn.addEventListener('click', () => {
        this.ctx.editor.setTool(btn.dataset.tool as EditorTool);
        for (const b of buttons) b.classList.toggle('active', b === btn);
      });
    }
    el<HTMLButtonElement>('delete-btn').addEventListener('click', () => {
      this.ctx.editor.deleteSelected();
    });
  }

  private wireProps(): void {
    const radius = el<HTMLInputElement>('prop-radius');
    const speed = el<HTMLInputElement>('prop-speed');
    const width = el<HTMLInputElement>('prop-width');
    const role = el<HTMLSelectElement>('prop-role');
    radius.addEventListener('input', () => {
      const v = Number(radius.value);
      if (Number.isFinite(v) && v >= 2) this.ctx.editor.updateSelected({ radius: v });
    });
    speed.addEventListener('input', () => {
      const v = Number(speed.value);
      if (Number.isFinite(v)) this.ctx.editor.updateSelected({ speed: v });
    });
    width.addEventListener('input', () => {
      const v = Number(width.value);
      if (Number.isFinite(v) && v >= 10) this.ctx.editor.updateSelected({ width: v });
    });
    role.addEventListener('change', () => {
      this.ctx.editor.updateSelected({ role: role.value });
    });
  }

  private wireFileOps(): void {
    el<HTMLButtonElement>('export-btn').addEventListener('click', () => {
      this.ctx.store.exportFile(this.ctx.layoutRef.current);
    });
    const fileInput = el<HTMLInputElement>('import-file');
    el<HTMLButtonElement>('import-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) this.ctx.replaceLayout(file);
      fileInput.value = '';
    });
    el<HTMLButtonElement>('reset-btn').addEventListener('click', () => {
      if (confirm('保存済みのレイアウトを消して初期配置に戻します。よろしいですか?')) {
        this.ctx.replaceLayout('reset');
      }
    });
  }

  /** 選択オブジェクトのプロパティパネルを更新 */
  showSelected(obj: LayoutObject | null): void {
    this.props.classList.toggle('hidden', !obj);
    if (!obj) return;
    el<HTMLElement>('prop-title').textContent = `選択中: ${OBJ_LABEL[obj.type]} (${obj.id})`;
    const rows: Record<string, boolean> = {
      'prop-radius-row': obj.type === 'nail' || obj.type === 'windmill',
      'prop-speed-row': obj.type === 'windmill',
      'prop-width-row': obj.type === 'pocket',
      'prop-role-row': obj.type === 'pocket',
    };
    for (const [id, show] of Object.entries(rows)) {
      el<HTMLElement>(id).classList.toggle('hidden', !show);
    }
    if (obj.type === 'nail' || obj.type === 'windmill') {
      el<HTMLInputElement>('prop-radius').value = String(obj.radius);
    }
    if (obj.type === 'windmill') el<HTMLInputElement>('prop-speed').value = String(obj.speed);
    if (obj.type === 'pocket') {
      el<HTMLInputElement>('prop-width').value = String(obj.width);
      el<HTMLSelectElement>('prop-role').value = obj.role;
    }
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
