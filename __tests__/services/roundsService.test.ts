import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockState = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as { message: string } | null },
  upserts: [] as unknown[],
  rpcResult: { data: null as unknown, error: null as { code?: string; message: string } | null },
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      mockState.rpcCalls.push({ name, args });
      return Promise.resolve(mockState.rpcResult);
    },
    from: () => ({
      upsert: (payload: unknown) => {
        mockState.upserts.push(payload);
        const chain = { select: () => chain, single: () => Promise.resolve(mockState.result) };
        return chain;
      },
    }),
  },
}));

import { upsertRound, roundToRow, toColumns, saveRoundChecked } from '../../services/roundsService';
import { getQueue, clearMainQueue, clearDeadLetterQueue } from '../../services/syncQueue';

const ROUND = { date: '2026-11-12', note: '# NOF', todos: [] };

beforeEach(() => {
  mockState.result = { data: { round_note: '', round_note_by_name: null, round_note_at: null }, error: null };
  mockState.upserts = [];
  mockState.rpcResult = { data: [{ conflict: false, server_note: '', server_note_by: null, server_note_at: null }], error: null };
  mockState.rpcCalls = [];
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

describe('queue-only keys', () => {
  it('roundToRow carries the base version only together with a note', () => {
    expect(roundToRow('TEST-001', 'h-1', { ...ROUND, roundNote: 'x' }, '2026-11-13T04:00:00Z').base_note_at).toBe('2026-11-13T04:00:00Z');
    expect(roundToRow('TEST-001', 'h-1', { ...ROUND, roundNote: 'x' }, null).base_note_at).toBeNull();
    expect('base_note_at' in roundToRow('TEST-001', 'h-1', ROUND, '2026-11-13T04:00:00Z')).toBe(false);
  });

  it('toColumns removes it, so it is never sent as a table column', () => {
    const row = roundToRow('TEST-001', 'h-1', { ...ROUND, roundNote: 'x' }, null);
    expect('base_note_at' in toColumns(row)).toBe(false);
    expect(toColumns(row).round_note).toBe('x');
  });
});

// Audit DATA-04: a note must not silently overwrite a colleague's newer note.
describe('saveRoundChecked', () => {
  const BASE = '2026-11-13T04:00:00.123456+00:00';

  it('sends the note together with the version the writer started from', async () => {
    await saveRoundChecked('TEST-001', 'h-1', { ...ROUND, roundNote: 'Wound dry.' }, BASE);
    expect(mockState.rpcCalls).toEqual([{
      name: 'save_round',
      args: {
        p_patient_ip_no: 'TEST-001', p_date: '2026-11-12', p_note: '# NOF', p_todos: [],
        p_round_note: 'Wound dry.', p_base_note_at: BASE,
      },
    }]);
  });

  it('an orders-only save sends no note and no base version', async () => {
    await saveRoundChecked('TEST-001', 'h-1', ROUND, BASE);
    expect(mockState.rpcCalls[0].args.p_round_note).toBeNull();
    expect(mockState.rpcCalls[0].args.p_base_note_at).toBeNull();
  });

  it("returns 'saved' with the stamp the database recorded", async () => {
    mockState.rpcResult = { data: [{ conflict: false, server_note: 'Wound dry.', server_note_by: 'Test Resident', server_note_at: BASE }], error: null };
    await expect(saveRoundChecked('TEST-001', 'h-1', { ...ROUND, roundNote: 'Wound dry.' }))
      .resolves.toEqual({ status: 'saved', stamp: { roundNote: 'Wound dry.', roundNoteBy: 'Test Resident', roundNoteAt: BASE } });
  });

  it("returns 'conflict' with the colleague's note when the database refused the write", async () => {
    mockState.rpcResult = { data: [{ conflict: true, server_note: 'Drain removed.', server_note_by: 'Dr R', server_note_at: BASE }], error: null };
    await expect(saveRoundChecked('TEST-001', 'h-1', { ...ROUND, roundNote: 'Wound dry.' }, null))
      .resolves.toEqual({ status: 'conflict', server: { roundNote: 'Drain removed.', roundNoteBy: 'Dr R', roundNoteAt: BASE } });
    expect(mockState.upserts).toHaveLength(0);
  });

  it('throws when the server refuses or cannot be reached, so the caller queues it', async () => {
    mockState.rpcResult = { data: null, error: { message: 'TypeError: Failed to fetch' } };
    await expect(saveRoundChecked('TEST-001', 'h-1', ROUND)).rejects.toThrow('Failed to fetch');
  });

  // Deploy-order safety: the app may go live before the migration is applied.
  it('falls back to the plain save when the database function does not exist yet', async () => {
    mockState.rpcResult = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.save_round(...) in the schema cache' } };
    mockState.result = { data: { round_note: 'Wound dry.', round_note_by_name: 'Test Resident', round_note_at: BASE }, error: null };
    await expect(saveRoundChecked('TEST-001', 'h-1', { ...ROUND, roundNote: 'Wound dry.' }))
      .resolves.toEqual({ status: 'saved', stamp: { roundNote: 'Wound dry.', roundNoteBy: 'Test Resident', roundNoteAt: BASE } });
    expect(mockState.upserts).toHaveLength(1);
  });
});
