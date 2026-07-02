import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true, // LAN 内の別端末からアクセス可能にする(0.0.0.0 で listen)
  },
  preview: {
    host: true,
  },
});
