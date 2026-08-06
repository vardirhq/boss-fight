import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The installed build needs to know its own version to recognise a newer release.
// Taken from package.json, which the release tooling already keeps in step with the
// git tag and the Android version name.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  optimizeDeps: {
    // The sqlite-wasm ESM entry ships its own worker/wasm; let Vite serve it as-is.
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react-vendor';
          if (id.includes('node_modules/@sqlite.org')) return 'sqlite-runtime';
        },
      },
    },
  },
});
