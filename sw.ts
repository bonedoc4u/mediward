/**
 * sw.ts — Custom Workbox service worker
 *
 * Bundled by vite-plugin-pwa in injectManifest mode.
 * Responsibilities:
 *   1. Precache all app assets (manifest injected by workbox-build).
 *   2. NetworkFirst strategy for Supabase REST calls.
 *   3. Hand round saves left in the OLD BackgroundSync queue to the page
 *      (transition only — see "Legacy rounds queue" below).
 *
 * What this worker deliberately does NOT do any more: queue or resend failed
 * round saves. It used to intercept them, answer "202 Accepted" so the app
 * believed the save had worked, and resend later counting any server reply
 * (including "sign-in expired") as success. Offline saves now have exactly
 * one owner: the app's queue (services/syncQueue.ts + services/syncReplay.ts),
 * which checks the server's answer and can refresh the sign-in first.
 */

/// <reference lib="webworker" />
/// <reference types="vite-plugin-pwa/vanillajs" />

import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { Queue } from 'workbox-background-sync';
import {
  LEGACY_ROUNDS_QUEUE_NAME, MSG_GET_LEGACY_ROUNDS, MSG_LEGACY_ROUNDS_TAKEN,
  readLegacyEntries, dropTakenEntries,
} from './utils/legacyRoundQueue';

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

// ─── Legacy rounds queue (transition only) ───
//
// Earlier versions stored failed round saves in a Workbox BackgroundSync queue
// with this name. This worker no longer adds to it and never resends from it.
// It only lets the page read what is left and then deletes what the page has
// confirmed it moved into the app queue.
//
// The Queue object is needed just to reach that IndexedDB store:
//   - onSync does nothing, so a pending browser "sync" event cannot resend
//     anything with the old, unchecked logic;
//   - maxRetentionTime is long because getAll() silently deletes anything
//     older than it — an old note must reach the app queue, not vanish.
//
// Remove this block (and the workbox-background-sync dependency) once every
// installed copy has updated past this version.
const legacyRoundsQueue = new Queue(LEGACY_ROUNDS_QUEUE_NAME, {
  maxRetentionTime: 60 * 24 * 90, // minutes — 90 days
  onSync: async () => { /* intentionally empty — the page drives the handover */ },
});

self.addEventListener('message', (event) => {
  const type = (event.data as { type?: string } | null)?.type;

  if (type === MSG_GET_LEGACY_ROUNDS) {
    const port = event.ports[0];
    if (!port) return;
    event.waitUntil(
      readLegacyEntries(legacyRoundsQueue)
        .then(entries => port.postMessage({ entries }))
        .catch(() => port.postMessage({ entries: [] })),
    );
  } else if (type === MSG_LEGACY_ROUNDS_TAKEN) {
    const ids = (event.data as { ids?: unknown }).ids;
    if (!Array.isArray(ids)) return;
    event.waitUntil(dropTakenEntries(legacyRoundsQueue, ids as string[]));
  }
});
