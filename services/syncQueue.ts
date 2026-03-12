/**
 * syncQueue.ts
 * Write-ahead queue for offline-first operation.
 *
 * Guarantees:
 *  - Operations replay in insertion order (seq field).
 *  - upsert_patient is deduplicated per ipNo — only the latest payload is kept.
 *  - Failed ops are retried with exponential backoff (2^attempt seconds).
 *  - After MAX_ATTEMPTS, the op is dropped and incrementAttempts() returns
 *    { dropped: true } so the caller can surface a user-facing error.
 *
 * Storage strategy (iOS WKWebView fix):
 *  - @capacitor/preferences (UserDefaults on iOS) is the durable store.
 *    Unlike WKWebView localStorage, UserDefaults is NOT evicted under OS
 *    memory pressure — offline writes survive app backgrounding on iOS.
 *  - localStorage is kept as a synchronous read-cache and web fallback.
 *  - On startup, `initSyncQueue()` loads from Preferences if available,
 *    seeds localStorage, then all subsequent reads use the in-memory cache.
 *  - All writes go to both stores (Preferences async, localStorage sync).
 */

import { Preferences } from '@capacitor/preferences';

export type QueuedOpType =
  | 'upsert_patient'
  | 'insert_lab'
  | 'insert_imaging'
  | 'delete_imaging'
  | 'upsert_round'
  | 'insert_vital'
  | 'insert_nursing_note'
  | 'record_med_administration';

export interface QueuedOp {
  id: string;
  seq: number;
  type: QueuedOpType;
  payload: unknown;
  queuedAt: string;
  attempts: number;
  nextRetryAt?: string;
}

const QUEUE_KEY = 'mediward_sync_queue';
const SEQ_KEY   = 'mediward_sync_seq';
const MAX_ATTEMPTS = 5;

// ─── In-memory cache (authoritative for synchronous reads) ───────────────────
let _cache: QueuedOp[] = [];
let _seq = 0;
let _initialized = false;

// ─── Async initialisation — call once at app startup ─────────────────────────
/**
 * Loads the queue from @capacitor/preferences (durable on iOS) if available,
 * falling back to localStorage. Call this before the first enqueue/getQueue.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initSyncQueue(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  try {
    // Try Capacitor Preferences first (survives iOS memory pressure)
    const { value: qRaw } = await Preferences.get({ key: QUEUE_KEY });
    const { value: sRaw } = await Preferences.get({ key: SEQ_KEY });

    if (qRaw) {
      _cache = (JSON.parse(qRaw) as QueuedOp[]).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
      _seq = sRaw ? parseInt(sRaw, 10) : (_cache[_cache.length - 1]?.seq ?? 0);
      // Mirror into localStorage for synchronous read-cache
      _lsSet(QUEUE_KEY, qRaw);
      _lsSet(SEQ_KEY, String(_seq));
      return;
    }
  } catch { /* Capacitor not available on web — fall through */ }

  // localStorage fallback (web / Capacitor not present)
  try {
    const qRaw = localStorage.getItem(QUEUE_KEY) || '[]';
    _cache = (JSON.parse(qRaw) as QueuedOp[]).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    const sRaw = localStorage.getItem(SEQ_KEY);
    _seq = sRaw ? parseInt(sRaw, 10) : (_cache[_cache.length - 1]?.seq ?? 0);
  } catch {
    _cache = [];
    _seq = 0;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
function _lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* quota exceeded */ }
}

function _nextSeq(): number {
  _seq += 1;
  _lsSet(SEQ_KEY, String(_seq));
  Preferences.set({ key: SEQ_KEY, value: String(_seq) }).catch(() => {});
  return _seq;
}

function _persist(queue: QueuedOp[]): void {
  _cache = queue;
  const serialized = JSON.stringify(queue);
  _lsSet(QUEUE_KEY, serialized);
  Preferences.set({ key: QUEUE_KEY, value: serialized }).catch(() => {});
}

// ─── Public API (synchronous — uses in-memory cache) ─────────────────────────

export function enqueue(type: QueuedOpType, payload: unknown): void {
  const queue = [..._cache];

  // Deduplication: for upsert_patient, replace existing queued op for same patient
  if (type === 'upsert_patient' && payload && typeof payload === 'object') {
    const ipNo = (payload as Record<string, unknown>).ipNo as string | undefined;
    if (ipNo) {
      const idx = queue.findIndex(
        op => op.type === 'upsert_patient' &&
              (op.payload as Record<string, unknown>)?.ipNo === ipNo,
      );
      if (idx !== -1) {
        queue[idx] = { ...queue[idx], payload, attempts: 0, nextRetryAt: undefined };
        _persist(queue);
        return;
      }
    }
  }

  queue.push({
    id:       crypto.randomUUID(),
    seq:      _nextSeq(),
    type,
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });
  _persist(queue);
}

/** Returns ops sorted by seq, filtered to those due for retry. */
export function getRetryableQueue(): QueuedOp[] {
  const now = Date.now();
  return [..._cache]
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .filter(op => !op.nextRetryAt || new Date(op.nextRetryAt).getTime() <= now);
}

export function getQueue(): QueuedOp[] {
  return [..._cache].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

export function dequeue(id: string): void {
  _persist(_cache.filter(op => op.id !== id));
}

export function incrementAttempts(id: string): { dropped: boolean; opType?: QueuedOpType; label?: string } {
  const q = [..._cache];
  const op = q.find(o => o.id === id);
  if (!op) return { dropped: false };

  const newAttempts = op.attempts + 1;

  if (newAttempts > MAX_ATTEMPTS) {
    let label: string | undefined;
    if (op.type === 'upsert_patient') {
      const p = op.payload as Record<string, unknown> | undefined;
      label = (p?.name as string) ?? (p?.ipNo as string);
    }
    _persist(q.filter(o => o.id !== id));
    return { dropped: true, opType: op.type, label };
  }

  const backoffMs = Math.pow(2, newAttempts) * 1000;
  const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

  _persist(q.map(o =>
    o.id === id ? { ...o, attempts: newAttempts, nextRetryAt } : o
  ));
  return { dropped: false };
}

export function getQueueSize(): number {
  return _cache.length;
}
