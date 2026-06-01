/// <reference types="vitest" />
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// @ts-ignore -- install with: npm install
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        tailwindcss(),
        VitePWA({
          registerType: 'prompt',
          includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
          manifest: {
            name: 'MediWard',
            short_name: 'MediWard',
            description: 'Digital ward management for clinical teams',
            theme_color: '#1e293b',
            background_color: '#f8fafc',
            display: 'standalone',
            scope: '/',
            start_url: '/',
            orientation: 'portrait',
            categories: ['medical', 'health', 'productivity'],
            icons: [
              { src: 'icon-72.png',  sizes: '72x72',   type: 'image/png', purpose: 'any' },
              { src: 'icon-96.png',  sizes: '96x96',   type: 'image/png', purpose: 'any' },
              { src: 'icon-128.png', sizes: '128x128', type: 'image/png', purpose: 'any' },
              { src: 'icon-144.png', sizes: '144x144', type: 'image/png', purpose: 'any' },
              { src: 'icon-152.png', sizes: '152x152', type: 'image/png', purpose: 'any' },
              { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
              { src: 'icon-384.png', sizes: '384x384', type: 'image/png', purpose: 'any' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            runtimeCaching: [
              {
                // NetworkFirst: always try the network first, fall back to cache
                // after 5s (slow ward Wi-Fi). StaleWhileRevalidate was unsafe —
                // it could serve 2-hour-old vitals or lab results as current data
                // after a period of connectivity loss.
                urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'supabase-api-cache',
                  networkTimeoutSeconds: 5,
                  expiration: {
                    maxEntries: 100,
                    // 5-minute cap: cached clinical data is only served as fallback
                    // for up to 5 minutes before it must be re-fetched
                    maxAgeSeconds: 5 * 60,
                  },
                },
              },
            ],
          },
        }),
      ],
      define: {
        // GEMINI_API_KEY intentionally excluded — must live in Edge Function server env only
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
        'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
      },
      build: {
        // xlsx-js-style is inherently large (~870 kB) but lazy-loaded; raise threshold to suppress noise.
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-pdf':  ['jspdf', 'jspdf-autotable'],
              'vendor-xlsx': ['xlsx-js-style'],
              'vendor-dnd':  ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
            },
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./__tests__/setup.ts'],
      },
    };
});
