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
        const chain = { select: () => chain, single: () => Promise.resolve(mockState.result) };
        return chain;
      },
    }),
  },
}));

import { upsertRound, roundToRow } from '../../services/roundsService';
import { getQueue, clearMainQueue, clearDeadLetterQueue } from '../../services/syncQueue';

const ROUND = { date: '2026-11-12', note: '# NOF', todos: [] };

beforeEach(() => {
  mockState.result = { data: { round_note: '', round_note_by_name: null, round_note_at: null }, error: null };
  mockState.upserts = [];
  clearMainQueue();
  clearDeadLetterQueue();
  localStorage.removeItem('mediward_sync_queue');
});

describe('roundToRow', () => {
  // The rule that protects a colleague's note: an upsert only changes the
  // columns it sends, so an orders-only save must not send round_note at all.
  it('leaves round_note out when the save does not touch the note', () => {
    expect(roundToRow('TEST-001', 'h-1', ROUND)).toEqual({
      patient_ip_no: 'TEST-001', hospital_id: 'h-1', date: '2026-11-12', note: '# NOF', todos: [],
    });
    expect('round_note' in roundToRow('TEST-001', 'h-1', ROUND)).toBe(false);
  });

  it('sends round_note when the doctor wrote or cleared the note', () => {
    expect(roundToRow('TEST-001', 'h-1', { ...ROUND, roundNote: 'Wound dry.' }).round_note).toBe('Wound dry.');
    expect(roundToRow('TEST-001', 'h-1', { ...ROUND, roundNote: '' }).round_note).toBe('');
  });

  it('never sends author or time — the database stamps them', () => {
    const row = roundToRow('TEST-001', 'h-1', { ...ROUND, roundNote: 'x', roundNoteBy: 'Dr Forged', roundNoteAt: '2020-01-01T00:00:00Z' });
    expect(Object.keys(row).sort()).toEqual(['date', 'hospital_id', 'note', 'patient_ip_no', 'round_note', 'todos']);
  });
});

describe('upsertRound', () => {
  it('writes one row keyed by patient and date, scoped to the hospital', async () => {
    await upsertRound('TEST-001', 'h-1', ROUND);
    expect(mockState.upserts).toEqual([{
      patient_ip_no: 'TEST-001', hospital_id: 'h-1', date: '2026-11-12', note: '# NOF', todos: [],
    }]);
  });

  it('returns the note as the database stored it, with the stamped author and time', async () => {
    mockState.result = { data: { round_note: 'Wound dry.', round_note_by_name: 'Test Resident', round_note_at: '2026-11-12T03:50:00Z' }, error: null };
    await expect(upsertRound('TEST-001', 'h-1', { ...ROUND, roundNote: 'Wound dry.' }))
      .resolves.toEqual({ roundNote: 'Wound dry.', roundNoteBy: 'Test Resident', roundNoteAt: '2026-11-12T03:50:00Z' });
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
