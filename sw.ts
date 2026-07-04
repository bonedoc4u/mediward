/**
 * sw.ts — Custom Workbox service worker (Task 3)
 *
 * Bundled by vite-plugin-pwa in injectManifest mode.
 * Responsibilities:
 *   1. Precache all app assets (manifest injected by workbox-build).
 *   2. NetworkFirst strategy for Supabase REST + Realtime calls.
 *   3. BackgroundSync queue for round note POST/PATCH mutations.
 *      Flush is sequential (FIFO) to preserve causality.
 *      On completion, posts a ROUNDS_SYNCED message to all open windows.
 *
 * iOS note: the Background Sync API is Chrome/Android only. On iOS Safari
 * the queue will not replay via BackgroundSync, but the app-layer syncQueue
 * (syncQueue.ts) handles the same offline replay so rounds are never lost.
 */

/// <reference lib="webworker" />
/// <reference types="vite-plugin-pwa/vanillajs" />

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { Queue } from 'workbox-background-sync';

declare const self: ServiceWorkerGlobalScope;

// Prompt-based update flow: the waiting worker activates only when the user
// accepts the SwUpdateBanner ("Update now" posts SKIP_WAITING via
// vite-plugin-pwa's updateServiceWorker). Without this listener the new
// version waited forever on machines where a tab was never fully closed.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Once activated, take control of open clients immediately.
clientsClaim();

// Inject the pre-computed precache manifest from workbox-build.
// vite-plugin-pwa replaces `self.__WB_MANIFEST` with the actual asset list.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ─── SPA fallback: all navigation requests serve index.html ───
// This makes client-side routing work when the user loads a deep link.
registerRoute(new NavigationRoute(new NetworkFirst({
  networkTimeoutSeconds: 3,
  cacheName: 'shell-cache',
})));

// ─── Supabase API: NetworkFirst with 60s max age ───
// Clinical data (vitals, labs) must not be served stale for more than 60s.
// NetworkFirst tries the network first; falls back to cache after 5s.
registerRoute(
  ({ url }) => url.hostname.endsWith('.supabase.co'),
  new NetworkFirst({
    networkTimeoutSeconds: 5,
    cacheName: 'supabase-api-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 150,
        maxAgeSeconds: 60,
      }),
    ],
  }),
);

// ─── Offline round note queue (BackgroundSync) ───
//
// When a POST/PATCH to /rest/v1/rounds fails because the device is offline,
// we push the request to a persistent queue (stored in IndexedDB by Workbox).
// On reconnect, the Background Sync API triggers `onSync`, which replays the
// queue SEQUENTIALLY (not in parallel) to preserve the order of round updates.
const roundsQueue = new Queue('mediward-rounds-bgsync', {
  maxRetentionTime: 60 * 24, // discard after 24 h — stale round notes are misleading
  onSync: async ({ queue: q }) => {
    let entry;
    let synced = 0;

    // Shift-and-retry loop: sequential flush, stop on first network failure
    // so we don't skip entries or create out-of-order writes.
    while ((entry = await q.shiftRequest())) {
      try {
        await fetch(entry.request.clone());
        synced++;
      } catch {
        // Network still unavailable — put the entry back at the front and abort.
        await q.unshiftRequest(entry);
        throw new Error('BackgroundSync: network still unavailable');
      }
    }

    if (synced > 0) {
      // Notify all open tabs so they can show a "X notes synced" toast.
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(c => c.postMessage({ type: 'ROUNDS_SYNCED', count: synced }));
    }
  },
});

// Intercept POST and PATCH requests to the rounds table.
// On network failure → push to BackgroundSync queue and return 202.
const roundsPattern = ({ url, request }: { url: URL; request: Request }) =>
  url.href.includes('/rest/v1/rounds') &&
  (request.method === 'POST' || request.method === 'PATCH');

registerRoute(roundsPattern, async ({ event }) => {
  const req = (event as FetchEvent).request;
  try {
    const response = await fetch(req.clone());
    return response;
  } catch {
    await roundsQueue.pushRequest({ request: req });
    // Return 202 Accepted so the app layer knows it was queued, not failed.
    return new Response(
      JSON.stringify({ queued: true, message: 'Offline — queued for sync' }),
      { status: 202, headers: { 'Content-Type': 'application/json' } },
    );
  }
}, 'POST');

// Also register for PATCH (Workbox registerRoute only registers one method per call)
registerRoute(roundsPattern, async ({ event }) => {
  const req = (event as FetchEvent).request;
  try {
    return await fetch(req.clone());
  } catch {
    await roundsQueue.pushRequest({ request: req });
    return new Response(
      JSON.stringify({ queued: true, message: 'Offline — queued for sync' }),
      { status: 202, headers: { 'Content-Type': 'application/json' } },
    );
  }
}, 'PATCH');
