/**
 * syncQueue.ts
 * Write-ahead queue for offline-first operation.
 * Failed Supabase writes are queued here and replayed when connectivity returns.
 *
 * Guarantees:
 *  - Operations replay in insertion order (seq field).
 *  - upsert_patient is deduplicated per ipNo — only the latest payload is kept.
 *  - Failed ops are retried with exponential backoff (2^attempt seconds).
 *  - After MAX_ATTEMPTS, the op is dropped and incrementAttempts() returns
 *    { dropped: true } so the caller can surface a user-facing error.
 */

export type QueuedOpType =
  | 'upsert_patient'
  | 'insert_lab'
  | 'insert_imaging'
  | 'delete_imaging'
  | 'upsert_round'
  | 'insert_vital';

export interface QueuedOp {
  id: string;
  seq: number;          // monotonic insertion counter — replay in seq order
  type: QueuedOpType;
  payload: unknown;
  queuedAt: string;
  attempts: number;
  nextRetryAt?: string; // ISO — don't retry before this time (exponential backoff)
}

const QUEUE_KEY    = 'mediward_sync_queue';
const SEQ_KEY      = 'mediward_sync_seq';
const MAX_ATTEMPTS = 5;

// ─── Monotonic sequence counter (survives page reloads) ───────────────────────
function nextSeq(): number {
  try {
    const n = parseInt(localStorage.getItem(SEQ_KEY) || '0', 10);
    const next = isNaN(n) ? 1 : n + 1;
    localStorage.setItem(SEQ_KEY, String(next));
    return next;
  } catch {
    return Date.now();
  }
}

// ─── Core queue operations ────────────────────────────────────────────────────

export function enqueue(type: QueuedOpType, payload: unknown): void {
  const queue = getQueue();

  // Deduplication: for upsert_patient, replace any existing queued op for the
  // same patient (same ipNo) — keeps the latest payload, preserves position/seq.
  if (type === 'upsert_patient' && payload && typeof payload === 'object') {
    const ipNo = (payload as Record<string, unknown>).ipNo as string | undefined;
    if (ipNo) {
      const idx = queue.findIndex(
        op => op.type === 'upsert_patient' &&
              (op.payload as Record<string, unknown>)?.ipNo === ipNo,
      );
      if (idx !== -1) {
        queue[idx] = { ...queue[idx], payload, attempts: 0, nextRetryAt: undefined };
        persist(queue);
        return;
      }
    }
  }

  queue.push({
    id:        crypto.randomUUID(),
    seq:       nextSeq(),
    type,
    payload,
    queuedAt:  new Date().toISOString(),
    attempts:  0,
  });
  persist(queue);
}

/** Returns ops sorted by seq (insertion order), filtered to those due for retry. */
export function getRetryableQueue(): QueuedOp[] {
  const now = Date.now();
  return getQueue().filter(op =>
    !op.nextRetryAt || new Date(op.nextRetryAt).getTime() <= now
  );
}

export function getQueue(): QueuedOp[] {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as QueuedOp[];
    return [...raw].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  } catch {
    return [];
  }
}

export function dequeue(id: string): void {
  persist(getQueue().filter(op => op.id !== id));
}

/**
 * Increment the attempt counter for an op.
 * Sets exponential backoff: nextRetryAt = now + 2^attempts seconds.
 * Returns { dropped: true } if the op has exceeded MAX_ATTEMPTS and was removed.
 * Returns { dropped: false, patientName?: string } otherwise.
 */
export function incrementAttempts(id: string): { dropped: boolean; opType?: QueuedOpType; label?: string } {
  const q = getQueue();
  const op = q.find(o => o.id === id);
  if (!op) return { dropped: false };

  const newAttempts = op.attempts + 1;

  if (newAttempts > MAX_ATTEMPTS) {
    // Extract a human-readable label for the caller's error notification
    let label: string | undefined;
    if (op.type === 'upsert_patient') {
      const p = op.payload as Record<string, unknown> | undefined;
      label = (p?.name as string) ?? (p?.ipNo as string);
    }
    persist(q.filter(o => o.id !== id));
    return { dropped: true, opType: op.type, label };
  }

  // Exponential backoff: 2^attempts seconds (2s, 4s, 8s, 16s, 32s)
  const backoffMs = Math.pow(2, newAttempts) * 1000;
  const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

  persist(q.map(o =>
    o.id === id ? { ...o, attempts: newAttempts, nextRetryAt } : o
  ));
  return { dropped: false };
}

export function getQueueSize(): number {
  return getQueue().length;
}

function persist(queue: QueuedOp[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch { /* storage full — cannot persist */ }
}
