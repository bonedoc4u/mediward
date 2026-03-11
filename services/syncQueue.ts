/**
 * syncQueue.ts
 * Write-ahead queue for offline-first operation.
 * Failed Supabase writes are queued here and replayed when connectivity returns.
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
  type: QueuedOpType;
  payload: unknown;
  queuedAt: string;
  attempts: number;
}

const QUEUE_KEY = 'mediward_sync_queue';
const MAX_ATTEMPTS = 5;

export function enqueue(type: QueuedOpType, payload: unknown): void {
  const queue = getQueue();

  // Deduplication: for upsert_patient, replace any existing queued op for the
  // same patient (same ipNo) so we never accumulate stale overwrite chains.
  if (type === 'upsert_patient' && payload && typeof payload === 'object') {
    const ipNo = (payload as Record<string, unknown>).ipNo as string | undefined;
    if (ipNo) {
      const idx = queue.findIndex(
        op => op.type === 'upsert_patient' &&
              (op.payload as Record<string, unknown>)?.ipNo === ipNo,
      );
      if (idx !== -1) {
        queue[idx] = { ...queue[idx], payload, attempts: 0 };
        persist(queue);
        return;
      }
    }
  }

  queue.push({
    id:       crypto.randomUUID(),
    type,
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });
  persist(queue);
}

export function getQueue(): QueuedOp[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function dequeue(id: string): void {
  persist(getQueue().filter(op => op.id !== id));
}

export function incrementAttempts(id: string): void {
  const q = getQueue().map(op =>
    op.id === id ? { ...op, attempts: op.attempts + 1 } : op
  );
  // Drop ops that have exceeded max attempts (don't retry forever)
  persist(q.filter(op => op.attempts <= MAX_ATTEMPTS));
}

export function getQueueSize(): number {
  return getQueue().length;
}

function persist(queue: QueuedOp[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}
