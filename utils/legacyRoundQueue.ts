/**
 * legacyRoundQueue.ts — shared by the service worker (sw.ts) and the page.
 *
 * Background: until Nov 2026 the service worker kept its own queue of failed
 * round saves (Workbox BackgroundSync, IndexedDB). It resent them later and
 * counted ANY server reply as "synced" — including "sign-in expired" and
 * "refused" — so a note could be dropped while the app said it was saved.
 *
 * That queue is gone. The app's own queue (services/syncQueue.ts) is now the
 * only one. But a phone that updates may still hold round saves in the old
 * queue, so for a transition period the service worker hands them to the page,
 * which puts them into the app queue. Nothing here sends a request itself.
 *
 * This file must stay free of `window` / `document` — it runs in both worlds.
 */

export const LEGACY_ROUNDS_QUEUE_NAME = 'mediward-rounds-bgsync';

/** page → service worker: "send me what is in the old queue" (reply on the MessagePort). */
export const MSG_GET_LEGACY_ROUNDS = 'GET_LEGACY_ROUNDS';
/** page → service worker: "these are safely in the app queue now, delete them". */
export const MSG_LEGACY_ROUNDS_TAKEN = 'LEGACY_ROUNDS_TAKEN';

/** One stored request from the old queue, in a form that can cross postMessage. */
export interface LegacyRoundRequest {
  /** Stable for the lifetime of the entry: its timestamp plus its body. */
  id: string;
  method: string;
  url: string;
  body: string;
}

/** Payload of an `upsert_round` op in services/syncQueue.ts. */
export interface RoundQueuePayload {
  patient_ip_no: string;
  hospital_id: string | null;
  date: string;
  note: string;
  todos: unknown[];
}

function toRoundPayload(value: unknown): RoundQueuePayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.patient_ip_no !== 'string' || !row.patient_ip_no) return null;
  if (typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return null;
  return {
    patient_ip_no: row.patient_ip_no,
    hospital_id:   typeof row.hospital_id === 'string' ? row.hospital_id : null,
    date:          row.date,
    note:          typeof row.note === 'string' ? row.note : '',
    todos:         Array.isArray(row.todos) ? row.todos : [],
  };
}

/**
 * Turn one stored request into app-queue payloads.
 * Returns null when it is not a round upsert we can read with certainty —
 * the caller must then leave that entry where it is, never guess.
 */
export function parseLegacyRoundRequest(req: LegacyRoundRequest): RoundQueuePayload[] | null {
  if (req.method !== 'POST') return null;
  let pathname: string;
  try { pathname = new URL(req.url).pathname; } catch { return null; }
  if (pathname !== '/rest/v1/rounds') return null;

  let parsed: unknown;
  try { parsed = JSON.parse(req.body); } catch { return null; }

  const rows = Array.isArray(parsed) ? parsed : [parsed];
  if (rows.length === 0) return null;
  const payloads = rows.map(toRoundPayload);
  if (payloads.some(p => p === null)) return null;
  return payloads as RoundQueuePayload[];
}

// ─── Service-worker side ─────────────────────────────────────────────────────
// Structural types so this file does not depend on workbox.

interface LegacyEntry { request: Request; timestamp?: number; metadata?: object }
interface LegacyQueue {
  getAll(): Promise<LegacyEntry[]>;
  shiftRequest(): Promise<LegacyEntry | undefined>;
  pushRequest(entry: LegacyEntry): Promise<void>;
}

async function describeEntry(entry: LegacyEntry): Promise<LegacyRoundRequest> {
  const body = await entry.request.clone().text();
  return {
    id:     `${entry.timestamp ?? 0}|${body}`,
    method: entry.request.method,
    url:    entry.request.url,
    body,
  };
}

/** Read the old queue without changing it. */
export async function readLegacyEntries(queue: LegacyQueue): Promise<LegacyRoundRequest[]> {
  const entries = await queue.getAll();
  return Promise.all(entries.map(describeEntry));
}

/**
 * Delete exactly the entries the page confirmed it has taken; keep the rest
 * in their original order. Returns how many were deleted.
 */
export async function dropTakenEntries(queue: LegacyQueue, takenIds: readonly string[]): Promise<number> {
  const taken = new Set(takenIds);
  if (taken.size === 0) return 0;

  const all: LegacyEntry[] = [];
  let entry: LegacyEntry | undefined;
  while ((entry = await queue.shiftRequest())) all.push(entry);

  let dropped = 0;
  for (const e of all) {
    const { id } = await describeEntry(e);
    if (taken.has(id)) dropped += 1;
    else await queue.pushRequest(e);
  }
  return dropped;
}
