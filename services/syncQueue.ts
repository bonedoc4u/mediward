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
 *  - Every op belongs to the user who made it (userId). Replay, counts and
 *    deduplication only see the signed-in user's ops. Another user's ops stay
 *    on the phone, untouched, until that user signs in here again.
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
  /** Who made this change. Missing only on ops queued before owners existed. */
  userId?: string;
  /** That user's display name, so the next person can be told whose changes wait. */
  userName?: string;
}

export interface QueueOwner {
  id: string;
  name?: string;
}

const QUEUE_KEY = 'mediward_sync_queue';
const SEQ_KEY   = 'mediward_sync_seq';
const DLQ_KEY   = 'mediward_sync_dlq';
const MAX_ATTEMPTS = 5;
const MAX_QUEUE_SIZE = 500;

// ─── Dead-letter queue entry ─────────────────────────────────────────────────
export interface DeadLetterOp extends QueuedOp {
  failedAt: string;
  reason: string;
}

// ─── In-memory cache (authoritative for synchronous reads) ───────────────────
let _cache: QueuedOp[] = [];
let _dlq: DeadLetterOp[] = [];
let _seq = 0;
let _initialized = false;

// ─── Owner (audit DATA-05) ───────────────────────────────────────────────────
// The queue used to belong to nobody: doctor A's unsent changes were sent
// under whoever signed in next on the same phone.
let _owner: QueueOwner | null = null;
// A save that fails just after sign-out (e.g. inactivity logout mid-request)
// is still that user's change, so the last owner is remembered for stamping.
let _lastOwner: QueueOwner | null = null;

const _isMine = (op: QueuedOp): boolean => (op.userId ?? null) === (_owner?.id ?? null);

/**
 * Tell the queue who is signed in (null = nobody). Call on every sign-in and
 * sign-out, before any replay.
 *
 * Ops with no owner (queued by a version before owners existed) are adopted
 * by the first user who signs in. That is what the old code did for every op;
 * here it happens once, so no queued change is lost by the upgrade.
 */
export function setQueueOwner(owner: QueueOwner | null): void {
  _owner = owner;
  if (!owner) return;
  _lastOwner = owner;
  if (_cache.some(op => !op.userId)) {
    _persist(_cache.map(op => (op.userId ? op : { ...op, userId: owner.id, userName: owner.name })));
  }
}

/** Unsent changes on this phone that belong to someone other than the signed-in user. */
export function getOtherUsersPending(): { count: number; names: string[] } {
  if (!_owner) return { count: 0, names: [] };
  const others = _cache.filter(op => !_isMine(op));
  const names = [...new Set(others.map(op => op.userName).filter((n): n is string => !!n))];
  return { count: others.length, names };
}

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
    const { value: dRaw } = await Preferences.get({ key: DLQ_KEY });

    if (qRaw) {
      _cache = (JSON.parse(qRaw) as QueuedOp[]).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
      _seq = sRaw ? parseInt(sRaw, 10) : (_cache[_cache.length - 1]?.seq ?? 0);
      _dlq = dRaw ? (JSON.parse(dRaw) as DeadLetterOp[]) : [];
      // Mirror into localStorage for synchronous read-cache
      _lsSet(QUEUE_KEY, qRaw);
      _lsSet(SEQ_KEY, String(_seq));
      if (dRaw) _lsSet(DLQ_KEY, dRaw);
      return;
    }
  } catch { /* Capacitor not available on web — fall through */ }

  // localStorage fallback (web / Capacitor not present)
  try {
    const qRaw = localStorage.getItem(QUEUE_KEY) || '[]';
    _cache = (JSON.parse(qRaw) as QueuedOp[]).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    const sRaw = localStorage.getItem(SEQ_KEY);
    _seq = sRaw ? parseInt(sRaw, 10) : (_cache[_cache.length - 1]?.seq ?? 0);
    const dRaw = localStorage.getItem(DLQ_KEY);
    _dlq = dRaw ? (JSON.parse(dRaw) as DeadLetterOp[]) : [];
  } catch {
    _cache = [];
    _dlq = [];
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

function _persistDlq(dlq: DeadLetterOp[]): void {
  _dlq = dlq;
  const serialized = JSON.stringify(dlq);
  _lsSet(DLQ_KEY, serialized);
  Preferences.set({ key: DLQ_KEY, value: serialized }).catch(() => {});
}

// ─── Public API (synchronous — uses in-memory cache) ─────────────────────────

export function enqueue(type: QueuedOpType, payload: unknown): void {
  _enqueueFor(_owner ?? _lastOwner, type, payload);
}

function _enqueueFor(owner: QueueOwner | null, type: QueuedOpType, payload: unknown): void {
  const queue = [..._cache];
  const ownerId = owner?.id;

  // Deduplication: for upsert_patient, replace existing queued op for same patient
  if (type === 'upsert_patient' && payload && typeof payload === 'object') {
    const ipNo = (payload as Record<string, unknown>).ipNo as string | undefined;
    if (ipNo) {
      const idx = queue.findIndex(
        // Only replace this user's own queued save — never another user's.
        op => op.type === 'upsert_patient' && op.userId === ownerId &&
              (op.payload as Record<string, unknown>)?.ipNo === ipNo,
      );
      if (idx !== -1) {
        queue[idx] = { ...queue[idx], payload, attempts: 0, nextRetryAt: undefined };
        _persist(queue);
        return;
      }
    }
  }

  // Deduplication: for insert_lab, replace existing queued op for same (patientId, type, date)
  if (type === 'insert_lab' && payload && typeof payload === 'object') {
    const { patientId, result } = payload as { patientId?: string; result?: { type?: string; date?: string } };
    if (patientId && result?.type && result?.date) {
      const idx = queue.findIndex(op => {
        if (op.type !== 'insert_lab' || op.userId !== ownerId) return false;
        const p = op.payload as { patientId?: string; result?: { type?: string; date?: string } };
        return p?.patientId === patientId && p?.result?.type === result.type && p?.result?.date === result.date;
      });
      if (idx !== -1) {
        queue[idx] = { ...queue[idx], payload, attempts: 0, nextRetryAt: undefined };
        _persist(queue);
        return;
      }
    }
  }

  // Size cap: if at limit, move oldest non-upsert_patient op to DLQ to make room
  if (queue.length >= MAX_QUEUE_SIZE) {
    // Sort non-critical ops by queuedAt to evict the oldest one first
    const sorted = [...queue].sort((a, b) => new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime());
    const oldest = sorted.find(op => op.type !== 'upsert_patient') ?? queue[0];
    const evictIdx = queue.findIndex(op => op.id === oldest.id);
    const target = oldest;
    _persistDlq([..._dlq, { ...target, failedAt: new Date().toISOString(), reason: 'queue_full' }]);
    queue.splice(evictIdx !== -1 ? evictIdx : 0, 1);
  }

  queue.push({
    id:       crypto.randomUUID(),
    seq:      _nextSeq(),
    type,
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    ...(owner ? { userId: owner.id, userName: owner.name } : {}),
  });
  _persist(queue);
}

/** The signed-in user's ops, sorted by seq, filtered to those due for retry. */
export function getRetryableQueue(): QueuedOp[] {
  const now = Date.now();
  return _cache.filter(_isMine)
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .filter(op => !op.nextRetryAt || new Date(op.nextRetryAt).getTime() <= now);
}

/** The signed-in user's ops, including those still waiting for a retry. */
export function getQueue(): QueuedOp[] {
  return _cache.filter(_isMine).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

export function dequeue(id: string): void {
  _persist(_cache.filter(op => op.id !== id));
}

export function incrementAttempts(id: string, error?: unknown): { dropped: boolean; opType?: QueuedOpType; label?: string } {
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
    // Move to dead-letter queue instead of silently dropping
    const errMsg = error instanceof Error ? error.message : (error ? String(error) : '');
    const reason = errMsg ? `max_attempts_exceeded: ${errMsg}` : `max_attempts_exceeded (${MAX_ATTEMPTS})`;
    _persistDlq([..._dlq, { ...op, failedAt: new Date().toISOString(), reason }]);
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

/**
 * Move one op to the dead-letter queue now, without using up its retries.
 * For refusals that can never succeed on a retry (e.g. the user's role).
 */
export function moveToDeadLetter(id: string, reason: string): { opType: QueuedOpType; label?: string } | null {
  const op = _cache.find(o => o.id === id);
  if (!op) return null;
  let label: string | undefined;
  if (op.type === 'upsert_patient') {
    const p = op.payload as Record<string, unknown> | undefined;
    label = (p?.name as string) ?? (p?.ipNo as string);
  }
  _persistDlq([..._dlq, { ...op, failedAt: new Date().toISOString(), reason }]);
  _persist(_cache.filter(o => o.id !== id));
  return { opType: op.type, label };
}

/** How many unsent changes the signed-in user has. */
export function getQueueSize(): number {
  return _cache.filter(_isMine).length;
}

// ─── Dead-letter queue API ────────────────────────────────────────────────────

/** Returns all ops that permanently failed (max retries exceeded or queue full). */
export function getDeadLetterQueue(): DeadLetterOp[] {
  return [..._dlq];
}

/** Clears the dead-letter queue (admin "acknowledge & clear" action). */
export function clearDeadLetterQueue(): void {
  _persistDlq([]);
}

/** Remove a single entry from the dead-letter queue by id. */
export function removeFromDeadLetterQueue(id: string): void {
  _persistDlq(_dlq.filter(o => o.id !== id));
}

/** Clears all pending ops from the main queue — every user's (admin tool). */
export function clearMainQueue(): void {
  _persist([]);
}

/** Returns the number of ops on this phone — every user's (admin tool). */
export function getMainQueueSize(): number {
  return _cache.length;
}

/** Retry a single DLQ op by re-enqueuing it and removing it from the DLQ. */
export function retryDeadLetterOp(id: string): void {
  const op = _dlq.find(o => o.id === id);
  if (!op) return;
  _persistDlq(_dlq.filter(o => o.id !== id));
  // Keep the original owner: an admin pressing Retry must not become the author.
  _enqueueFor(op.userId ? { id: op.userId, name: op.userName } : (_owner ?? _lastOwner), op.type, op.payload);
}
