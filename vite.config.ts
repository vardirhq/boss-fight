import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-64.png', 'icons/icon-180.png'],
      manifest: {
        name: 'Boss Kamp',
        short_name: 'Boss Kamp',
        description:
          'Gjør husarbeid til episke kamper — en arkade-RPG for hele familien.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#090b10',
        theme_color: '#090b10',
        categories: ['games', 'lifestyle', 'productivity'],
        lang: 'no',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell + wasm, but keep the heavy boss art out of the
        // precache manifest (it is runtime-cached on demand instead).
        globPatterns: ['**/*.{js,css,html,wasm,woff2}', 'icons/*.png'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Boss sprites + fighter art — large, cache-first, filled on demand.
            urlPattern: /\/(uploads|sprites)\/[^/]+\.(png|webp|jpe?g)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'boss-art',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  optimizeDeps: {
    // The sqlite-wasm ESM entry ships its own worker/wasm; let Vite serve it as-is.
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
});
