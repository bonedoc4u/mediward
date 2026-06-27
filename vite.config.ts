/// <reference types="vitest" />
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// @ts-ignore -- install with: npm install
import { VitePWA } from 'vite-plugin-pwa';
import { envCheckPlugin } from './plugins/vite-plugin-env-check';

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
        envCheckPlugin(),   // fails CI build if env vars are missing/invalid
        VitePWA({
          // injectManifest: use our custom sw.ts instead of generateSW so we
          // can add Workbox BackgroundSync for offline round note mutations.
          strategies: 'injectManifest',
          srcDir: '.',
          filename: 'sw.ts',
          registerType: 'autoUpdate',
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
          injectManifest: {
            // Precache all static assets; runtime caching is handled in sw.ts.
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
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
        coverage: {
          provider:        'v8',
          reporter:        ['text', 'json-summary', 'html'],
          reportsDirectory: './coverage',
          // Only count real source files — not auto-generated or config files
          include: ['**/*.{ts,tsx}'],
          exclude: [
            '**/*.d.ts',
            '**/*.config.*',
            '**/node_modules/**',
            '**/dist/**',
            '**/android/**',
            '**/ios/**',
            '**/e2e/**',
            '**/__tests__/setup.ts',
          ],
        },
      },
    };
});
