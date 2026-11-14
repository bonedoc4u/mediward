import { describe, it, expect, vi, beforeEach } from 'vitest';

// supabase-js never throws on a failed request — it resolves with { error }.
// The mock reproduces exactly that: every call resolves, and `mockState.result`
// decides whether the server "accepted" or "refused" it.
const mockState = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as { message: string } | null },
  calls: [] as Array<{ table: string; method: string; payload: unknown }>,
  rpcResults: [] as Array<{ data: unknown; error: { code?: string; message: string } | null }>,
  rpcCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (_name: string, args: Record<string, unknown>) => {
      mockState.rpcCalls.push(args);
      return Promise.resolve(mockState.rpcResults.shift() ?? { data: null, error: { message: 'no rpc result queued' } });
    },
    from: (table: string) => {
      const run = (method: string) => (payload: unknown) => {
        mockState.calls.push({ table, method, payload });
        return Promise.resolve(mockState.result);
      };
      return { upsert: run('upsert'), insert: run('insert') };
    },
  },
}));

import {
  enqueue, getQueue, getDeadLetterQueue, clearMainQueue, clearDeadLetterQueue,
  type QueuedOp, type QueuedOpType,
} from '../../services/syncQueue';
import {
  replaySimpleOp, drainQueue, isSimpleOp, isAuthError, isNetworkError, isRoleRefusal,
} from '../../services/syncReplay';

const ROUND = {
  patient_ip_no: 'TEST-001', hospital_id: 'h-1', date: '2026-11-12',
  note: 'Wound dry. Mobilise with walker.', todos: [],
};

const op = (type: QueuedOpType, payload: unknown): QueuedOp => ({
  id: 'op-1', seq: 1, type, payload, queuedAt: new Date().toISOString(), attempts: 0,
});

beforeEach(() => {
  mockState.result = { data: null, error: null };
  mockState.calls = [];
  mockState.rpcResults = [];
  mockState.rpcCalls = [];
  clearMainQueue();
  clearDeadLetterQueue();
  localStorage.removeItem('mediward_sync_queue');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('replaySimpleOp', () => {
  const cases: Array<[QueuedOpType, string, string]> = [
    ['upsert_round',              'rounds',                     'upsert'],
    ['insert_vital',              'patient_vitals',             'insert'],
    ['insert_nursing_note',       'nursing_notes',              'insert'],
    ['record_med_administration', 'med_administrations', 'insert'],
  ];

  it.each(cases)('%s resolves when the server accepts the write', async (type, table, method) => {
    await expect(replaySimpleOp(op(type, ROUND))).resolves.toBeUndefined();
    expect(mockState.calls).toEqual([{ table, method, payload: ROUND }]);
  });

  // Regression: these four writes were awaited without looking at `error`,
  // so a refused write was indistinguishable from a saved one.
  it.each(cases)('%s throws when the server refuses the write', async (type) => {
    mockState.result = { data: null, error: { message: 'new row violates row-level security policy' } };
    await expect(replaySimpleOp(op(type, ROUND))).rejects.toThrow('row-level security');
  });

  it('throws when the request never reached the server', async () => {
    // This is what supabase-js resolves with when fetch itself fails.
    mockState.result = { data: null, error: { message: 'TypeError: Failed to fetch' } };
    await expect(replaySimpleOp(op('upsert_round', ROUND))).rejects.toThrow('Failed to fetch');
  });

  it('refuses op types it does not handle instead of reporting success', async () => {
    await expect(replaySimpleOp(op('upsert_patient', {}))).rejects.toThrow('unsupported op type');
    expect(mockState.calls).toHaveLength(0);
  });
});

describe('isSimpleOp', () => {
  it('covers round notes, vitals, nursing notes and medication records only', () => {
    expect(isSimpleOp('upsert_round')).toBe(true);
    expect(isSimpleOp('insert_vital')).toBe(true);
    expect(isSimpleOp('insert_nursing_note')).toBe(true);
    expect(isSimpleOp('record_med_administration')).toBe(true);
    expect(isSimpleOp('upsert_patient')).toBe(false);
    expect(isSimpleOp('insert_lab')).toBe(false);
  });
});

describe('error classification', () => {
  it('recognises an expired sign-in', () => {
    expect(isAuthError(new Error('upsert_round: JWT expired'))).toBe(true);
    expect(isAuthError(new Error('permission denied'))).toBe(false);
  });

  it('recognises an unreachable network in every browser engine', () => {
    expect(isNetworkError(new Error('upsert_round: TypeError: Failed to fetch'))).toBe(true);          // Chrome / Android
    expect(isNetworkError(new Error('upsert_round: TypeError: Load failed'))).toBe(true);              // Safari / iOS
    expect(isNetworkError(new Error('TypeError: NetworkError when attempting to fetch resource.'))).toBe(true); // Firefox
    expect(isNetworkError(new Error('permission denied'))).toBe(false);
  });
});

describe('drainQueue — a change leaves the phone only after the server confirms it', () => {
  it('removes a round note from the queue once the server accepts it', async () => {
    enqueue('upsert_round', ROUND);

    const result = await drainQueue(replaySimpleOp);

    expect(result).toEqual({ synced: 1, stoppedBy: null, dropped: [] });
    expect(getQueue()).toHaveLength(0);
  });

  // The bug: the note was deleted here and the user saw "All offline changes synced".
  it('KEEPS a round note the server refused', async () => {
    enqueue('upsert_round', ROUND);
    mockState.result = { data: null, error: { message: 'new row violates row-level security policy' } };

    const result = await drainQueue(replaySimpleOp);

    expect(result.synced).toBe(0);
    const queue = getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].payload).toEqual(ROUND);
    expect(queue[0].attempts).toBe(1);          // counted as a refusal, retried with backoff
  });

  it('KEEPS a round note when the network is unreachable, without using up a retry', async () => {
    enqueue('upsert_round', ROUND);
    enqueue('insert_vital', { patient_ip_no: 'TEST-002' });
    mockState.result = { data: null, error: { message: 'TypeError: Failed to fetch' } };

    const result = await drainQueue(replaySimpleOp);

    expect(result).toEqual({ synced: 0, stoppedBy: 'network', dropped: [] });
    const queue = getQueue();
    expect(queue).toHaveLength(2);
    expect(queue.map(o => o.attempts)).toEqual([0, 0]);   // a dead connection is not the change's fault
    expect(mockState.calls).toHaveLength(1);              // stopped after the first failure
  });

  it('never moves a change to the dead-letter queue because of a bad connection', async () => {
    enqueue('upsert_round', ROUND);
    mockState.result = { data: null, error: { message: 'TypeError: Failed to fetch' } };

    for (let i = 0; i < 10; i++) await drainQueue(replaySimpleOp);

    expect(getQueue()).toHaveLength(1);
    expect(getDeadLetterQueue()).toHaveLength(0);
  });

  it('KEEPS everything and stops when the sign-in has expired', async () => {
    enqueue('upsert_round', ROUND);
    enqueue('insert_nursing_note', { patient_ip_no: 'TEST-002' });
    mockState.result = { data: null, error: { message: 'JWT expired' } };

    const result = await drainQueue(replaySimpleOp);

    expect(result).toEqual({ synced: 0, stoppedBy: 'auth', dropped: [] });
    expect(getQueue()).toHaveLength(2);
    expect(getQueue().map(o => o.attempts)).toEqual([0, 0]);
  });

  it('carries on past one refused change and sends the rest in order', async () => {
    enqueue('upsert_round', ROUND);
    enqueue('insert_vital', { patient_ip_no: 'TEST-002' });

    const result = await drainQueue(async (queued) => {
      if (queued.type === 'upsert_round') throw new Error('upsert_round: check constraint violated');
      await replaySimpleOp(queued);
    });

    expect(result.synced).toBe(1);
    expect(getQueue().map(o => o.type)).toEqual(['upsert_round']);
  });

  it('reports a change that the server keeps refusing, and keeps it in the dead-letter queue', async () => {
    enqueue('upsert_round', ROUND);
    mockState.result = { data: null, error: { message: 'check constraint violated' } };

    // Fake only the clock, so each attempt's backoff wait has already passed.
    vi.useFakeTimers({ toFake: ['Date'] });
    let dropped: unknown[] = [];
    for (let i = 0; i < 6 && dropped.length === 0; i++) {
      const stored = JSON.parse(localStorage.getItem('mediward_sync_queue') ?? '[]') as QueuedOp[];
      expect(stored).toHaveLength(1);
      vi.setSystemTime(new Date(Date.now() + 120_000));
      dropped = (await drainQueue(replaySimpleOp)).dropped;
    }
    vi.useRealTimers();

    expect(dropped).toEqual([{ opType: 'upsert_round', label: undefined }]);
    expect(getQueue()).toHaveLength(0);
    const dlq = getDeadLetterQueue();
    expect(dlq).toHaveLength(1);                 // not deleted — still on the phone, reviewable
    expect(dlq[0].payload).toEqual(ROUND);
    expect(dlq[0].reason).toContain('check constraint violated');
  });
});

// Audit DATA-04: a note written offline is sent later. If a colleague wrote a
// note in the meantime, nobody is watching the screen — both must be kept.
describe('replaying a queued round note', () => {
  const NOTE = { ...ROUND, round_note: 'Mine: wound dry.', base_note_at: null };
  const rpcRow = (conflict: boolean, note: string, at = '2026-11-12T05:00:00.5+00:00') =>
    ({ data: [{ conflict, server_note: note, server_note_by: 'Dr R', server_note_at: at }], error: null });

  it('sends it through the conflict check, with the version it was written against', async () => {
    enqueue('upsert_round', { ...NOTE, base_note_at: '2026-11-12T03:00:00Z' });
    mockState.rpcResults = [rpcRow(false, 'Mine: wound dry.')];

    const result = await drainQueue(replaySimpleOp);

    expect(result.synced).toBe(1);
    expect(getQueue()).toHaveLength(0);
    expect(mockState.rpcCalls).toHaveLength(1);
    expect(mockState.rpcCalls[0].p_round_note).toBe('Mine: wound dry.');
    expect(mockState.rpcCalls[0].p_base_note_at).toBe('2026-11-12T03:00:00Z');
    expect(mockState.calls).toHaveLength(0);   // never the unchecked table upsert
  });

  it("keeps BOTH notes when a colleague wrote one in the meantime — theirs first, saved against their version", async () => {
    enqueue('upsert_round', NOTE);
    mockState.rpcResults = [
      rpcRow(true, 'Theirs: drain removed.', '2026-11-12T05:00:00.5+00:00'),
      rpcRow(false, 'Theirs: drain removed.\n\nMine: wound dry.'),
    ];

    const result = await drainQueue(replaySimpleOp);

    expect(result.synced).toBe(1);
    expect(mockState.rpcCalls).toHaveLength(2);
    expect(mockState.rpcCalls[1].p_round_note).toBe('Theirs: drain removed.\n\nMine: wound dry.');
    expect(mockState.rpcCalls[1].p_base_note_at).toBe('2026-11-12T05:00:00.5+00:00');
    expect(getQueue()).toHaveLength(0);
  });

  it('stays queued if the note changes yet again while merging', async () => {
    enqueue('upsert_round', NOTE);
    mockState.rpcResults = [rpcRow(true, 'Theirs.'), rpcRow(true, 'A third note.')];

    const result = await drainQueue(replaySimpleOp);

    expect(result.synced).toBe(0);
    expect(getQueue()).toHaveLength(1);
    expect(getQueue()[0].payload).toEqual(NOTE);
  });

  it('stays queued, without using a retry, when the network is still down', async () => {
    enqueue('upsert_round', NOTE);
    mockState.rpcResults = [{ data: null, error: { message: 'TypeError: Failed to fetch' } }];

    const result = await drainQueue(replaySimpleOp);

    expect(result.stoppedBy).toBe('network');
    expect(getQueue()[0].attempts).toBe(0);
  });

  it('an orders-only queued round is still a plain upsert and never carries queue-only keys', async () => {
    enqueue('upsert_round', ROUND);
    await drainQueue(replaySimpleOp);
    expect(mockState.rpcCalls).toHaveLength(0);
    expect(mockState.calls).toEqual([{ table: 'rounds', method: 'upsert', payload: ROUND }]);
  });
});

// Audit SEC-06: a change the database refuses because of the user's role gets
// the same answer every time. It must not use five retries, and it must not
// vanish: it goes to the dead-letter queue at once, where it is shown.
describe('drainQueue — refused because of the role', () => {
  const ROLE = 'ROLE_FORBIDDEN: role attending may not write to patient_vitals';

  it('recognises the database\'s role error', () => {
    expect(isRoleRefusal(new Error(`insert_vital: ${ROLE}`))).toBe(true);
    expect(isRoleRefusal({ code: '42501', message: ROLE })).toBe(true);
  });

  // A plain row-level-security refusal also happens with a stale session (no
  // hospital resolved). A new sign-in cures that, so it must keep its retries.
  it.each([
    ['new row violates row-level security policy for table "labs"'],
    ['Failed to fetch'], ['JWT expired'], ['duplicate key value violates unique constraint'],
  ])('does not mistake "%s" for a role refusal', message => {
    expect(isRoleRefusal(new Error(message))).toBe(false);
  });

  it('moves the change to the dead-letter queue on the first refusal and goes on with the rest', async () => {
    enqueue('insert_vital', { patient_ip_no: 'TEST-001' });
    enqueue('upsert_round', ROUND);
    const tried: string[] = [];

    const result = await drainQueue(async op => {
      tried.push(op.type);
      if (op.type === 'insert_vital') throw new Error(`insert_vital: ${ROLE}`);
    });

    expect(tried).toEqual(['insert_vital', 'upsert_round']);          // the refusal did not stop the queue
    expect(result.synced).toBe(1);
    expect(result.stoppedBy).toBeNull();
    expect(result.dropped).toEqual([{ opType: 'insert_vital', label: undefined, reason: 'role' }]);
    expect(getQueue()).toHaveLength(0);                               // not left to retry five times
    const dead = getDeadLetterQueue();
    expect(dead).toHaveLength(1);                                     // and not lost
    expect(dead[0]).toMatchObject({ type: 'insert_vital', attempts: 0 });
    expect(dead[0].reason).toContain('role_forbidden');
  });
});
