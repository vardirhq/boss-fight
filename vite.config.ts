import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // The sqlite-wasm ESM entry ships its own worker/wasm; let Vite serve it as-is.
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
});
