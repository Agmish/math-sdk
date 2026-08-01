import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [svelte()],
  build: {
    assetsInlineLimit: 0,
    sourcemap: false,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
