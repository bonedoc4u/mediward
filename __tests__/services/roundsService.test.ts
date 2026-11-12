import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockState = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as { message: string } | null },
  upserts: [] as unknown[],
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      upsert: (payload: unknown) => {
        mockState.upserts.push(payload);
        return Promise.resolve(mockState.result);
      },
    }),
  },
}));

import { upsertRound } from '../../services/roundsService';
import { getQueue, clearMainQueue, clearDeadLetterQueue } from '../../services/syncQueue';

const ROUND = { date: '2026-11-12', note: 'Wound dry.', todos: [] };

beforeEach(() => {
  mockState.result = { data: null, error: null };
  mockState.upserts = [];
  clearMainQueue();
  clearDeadLetterQueue();
  localStorage.removeItem('mediward_sync_queue');
});

describe('upsertRound', () => {
  it('writes one row keyed by patient and date, scoped to the hospital', async () => {
    await expect(upsertRound('TEST-001', 'h-1', ROUND)).resolves.toBeUndefined();
    expect(mockState.upserts).toEqual([{
      patient_ip_no: 'TEST-001', hospital_id: 'h-1', date: '2026-11-12', note: 'Wound dry.', todos: [],
    }]);
  });

  it('throws when the server refuses the write', async () => {
    mockState.result = { data: null, error: { message: 'permission denied' } };
    await expect(upsertRound('TEST-001', 'h-1', ROUND)).rejects.toThrow('permission denied');
  });

  // Regression: the service used to enqueue the round itself AND throw, and
  // the caller (PatientContext.saveRound) enqueued it again on that throw —
  // every failed save sat in the offline queue twice.
  it('does not queue the round itself — the caller queues it once', async () => {
    mockState.result = { data: null, error: { message: 'TypeError: Failed to fetch' } };
    await expect(upsertRound('TEST-001', 'h-1', ROUND)).rejects.toThrow();
    expect(getQueue()).toHaveLength(0);
  });
});
