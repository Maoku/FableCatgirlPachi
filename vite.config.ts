import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true, // LAN 内の別端末からアクセス可能にする(0.0.0.0 で listen)
    // PORT 環境変数があればそれを使う(プレビューハーネスのポート自動割当に対応)
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
  },
  preview: {
    host: true,
  },
});
