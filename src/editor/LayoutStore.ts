import type { Layout } from '../types';
import { createDefaultLayout } from '../layout/defaultLayout';
import { parseLayout } from '../layout/parseLayout';

const STORAGE_KEY = 'fcp-layout-v1';

/** レイアウトの永続化(localStorage)と JSON ファイル入出力 */
export class LayoutStore {
  /** 保存済みレイアウトを読む。なければ初期盤面 */
  load(): Layout {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const layout = parseLayout(saved);
      if (layout) return layout;
    }
    return createDefaultLayout();
  }

  save(layout: Layout): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }

  /** 保存を消して初期盤面に戻す */
  reset(): Layout {
    localStorage.removeItem(STORAGE_KEY);
    return createDefaultLayout();
  }

  /** レイアウトを JSON ファイルとしてダウンロード */
  exportFile(layout: Layout): void {
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pachi-layout.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  /** JSON ファイルからレイアウトを読み込む */
  async importFile(file: File): Promise<Layout | null> {
    return parseLayout(await file.text());
  }
}
