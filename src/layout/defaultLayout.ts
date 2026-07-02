import type { Layout } from '../types';
import { parseLayoutData } from './parseLayout';
import defaultJson from './default.json';

/**
 * 初期盤面。エディットモードで調整して「エクスポート」した
 * レイアウト JSON(default.json)をそのまま初期配置として使う。
 * 差し替えたいときは default.json を新しいエクスポートで上書きする。
 */
export function createDefaultLayout(): Layout {
  // モジュールとして import した JSON は共有インスタンスなので、
  // エディタによる書き換えが初期配置に染みないよう毎回ディープコピーする
  const layout = parseLayoutData(structuredClone(defaultJson));
  if (!layout) throw new Error('src/layout/default.json が Layout として不正です');
  return layout;
}
