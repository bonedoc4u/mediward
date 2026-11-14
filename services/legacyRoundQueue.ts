/**
 * legacyRoundQueue.ts (page side)
 * Moves round saves left in the service worker's old BackgroundSync queue
 * into the app's own offline queue. See utils/legacyRoundQueue.ts for why.
 *
 * Order matters and is deliberate:
 *   1. ask the service worker what it holds (read-only),
 *   2. put each readable entry into the app queue (persisted synchronously),
 *   3. only then tell the service worker to delete those entries.
 * If the page dies between 2 and 3 the entry is offered again next time; the
 * duplicate check below makes that harmless. An entry is never deleted first.
 */

import { enqueue, getQueue } from './syncQueue';
import {
  MSG_GET_LEGACY_ROUNDS, MSG_LEGACY_ROUNDS_TAKEN,
  parseLegacyRoundRequest, type LegacyRoundRequest, type RoundQueuePayload,
} from '../utils/legacyRoundQueue';

const REPLY_TIMEOUT_MS = 3_000;

/** The two things we need from a service worker. Injectable for tests. */
export interface LegacyQueueChannel {
  /** Resolves with the stored entries, or null if the worker did not answer. */
  ask(): Promise<LegacyRoundRequest[] | null>;
  tellTaken(ids: string[]): void;
}

function isAlreadyQueued(payload: RoundQueuePayload): boolean {
  const wanted = JSON.stringify(payload);
  return getQueue().some(op => op.type === 'upsert_round' && JSON.stringify(op.payload) === wanted);
}

/**
 * Take over whatever the old queue holds. Returns the number of round saves
 * newly added to the app queue. Never throws.
 */
export async function takeOverLegacyRounds(channel: LegacyQueueChannel): Promise<number> {
  let entries: LegacyRoundRequest[] | null;
  try { entries = await channel.ask(); } catch { return 0; }
  if (!entries || entries.length === 0) return 0;

  const takenIds: string[] = [];
  let added = 0;

  for (const entry of entries) {
    const payloads = parseLegacyRoundRequest(entry);
    if (!payloads) {
      // Not a round save we can read with certainty. Leave it in the old
      // queue untouched rather than guess at clinical data.
      console.error('[LegacyRounds] unreadable entry left in place:', entry.method, entry.url);
      continue;
    }
    for (const payload of payloads) {
      if (isAlreadyQueued(payload)) continue;   // another tab, or a repeat offer
      enqueue('upsert_round', payload);
      added += 1;
    }
    takenIds.push(entry.id);
  }

  if (takenIds.length > 0) channel.tellTaken(takenIds);
  return added;
}

/** Real channel: talks to the service worker that controls this page. */
function controllerChannel(sw: ServiceWorker): LegacyQueueChannel {
  return {
    ask: () => new Promise(resolve => {
      const { port1, port2 } = new MessageChannel();
      // An older service worker does not know this message and never answers.
      const timer = setTimeout(() => { port1.close(); resolve(null); }, REPLY_TIMEOUT_MS);
      port1.onmessage = (e: MessageEvent) => {
        clearTimeout(timer);
        port1.close();
        const entries = (e.data as { entries?: unknown } | null)?.entries;
        resolve(Array.isArray(entries) ? entries as LegacyRoundRequest[] : null);
      };
      sw.postMessage({ type: MSG_GET_LEGACY_ROUNDS }, [port2]);
    }),
    tellTaken: ids => sw.postMessage({ type: MSG_LEGACY_ROUNDS_TAKEN, ids }),
  };
}

/**
 * Call once at startup, after initSyncQueue(). Runs in the background — it
 * must never delay the first paint. Runs again when a new service worker
 * takes control (that is the moment right after "Update now").
 */
export function startLegacyRoundHandover(): void {
  if (!('serviceWorker' in navigator)) return;

  const run = async () => {
    const sw = navigator.serviceWorker.controller;
    if (!sw) return;
    const added = await takeOverLegacyRounds(controllerChannel(sw));
    // PatientContext replays the app queue on the window 'online' event.
    if (added > 0) window.dispatchEvent(new Event('online'));
  };

  void run();
  navigator.serviceWorker.addEventListener('controllerchange', () => { void run(); });
}
