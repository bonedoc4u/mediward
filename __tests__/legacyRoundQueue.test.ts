import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseLegacyRoundRequest, readLegacyEntries, dropTakenEntries,
  type LegacyRoundRequest,
} from '../utils/legacyRoundQueue';
import { takeOverLegacyRounds, type LegacyQueueChannel } from '../services/legacyRoundQueue';
import { enqueue, getQueue, clearMainQueue, clearDeadLetterQueue } from '../services/syncQueue';

const URL_ROUNDS = 'https://placeholder.supabase.co/rest/v1/rounds?on_conflict=patient_ip_no%2Cdate';
const ROUND = {
  patient_ip_no: 'TEST-001', hospital_id: 'h-1', date: '2026-11-12',
  note: 'Wound dry. Mobilise with walker.', todos: [{ id: 't1', task: 'Repeat Hb', isDone: false }],
};

const stored = (body: unknown, over: Partial<LegacyRoundRequest> = {}): LegacyRoundRequest => {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { id: `1000|${text}`, method: 'POST', url: URL_ROUNDS, body: text, ...over };
};

beforeEach(() => {
  clearMainQueue();
  clearDeadLetterQueue();
  localStorage.removeItem('mediward_sync_queue');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('parseLegacyRoundRequest', () => {
  it('reads a round upsert exactly as the old service worker stored it', () => {
    expect(parseLegacyRoundRequest(stored(ROUND))).toEqual([ROUND]);
  });

  it('reads a batch body', () => {
    const second = { ...ROUND, patient_ip_no: 'TEST-002' };
    expect(parseLegacyRoundRequest(stored([ROUND, second]))).toEqual([ROUND, second]);
  });

  it('fills safe defaults for optional fields only', () => {
    expect(parseLegacyRoundRequest(stored({ patient_ip_no: 'TEST-001', date: '2026-11-12' })))
      .toEqual([{ patient_ip_no: 'TEST-001', hospital_id: null, date: '2026-11-12', note: '', todos: [] }]);
  });

  // Anything we cannot read with certainty must be refused, never guessed at.
  it.each([
    ['a PATCH (partial update, not a whole round)', stored(ROUND, { method: 'PATCH' })],
    ['another table',                              stored(ROUND, { url: 'https://placeholder.supabase.co/rest/v1/patients' })],
    ['a rounds-like path on another table',        stored(ROUND, { url: 'https://placeholder.supabase.co/rest/v1/rounds_archive' })],
    ['a broken URL',                               stored(ROUND, { url: 'not a url' })],
    ['a body that is not JSON',                    stored('{"patient_ip_no": ')],
    ['a missing patient number',                   stored({ ...ROUND, patient_ip_no: undefined })],
    ['an empty patient number',                    stored({ ...ROUND, patient_ip_no: '' })],
    ['a malformed date',                           stored({ ...ROUND, date: '12/11/2026' })],
    ['an empty batch',                             stored([])],
    ['a batch with one bad row',                   stored([ROUND, { note: 'no patient' }])],
  ])('refuses %s', (_label, req) => {
    expect(parseLegacyRoundRequest(req)).toBeNull();
  });
});

// ─── Service-worker side, against a fake of the Workbox queue ────────────────
function fakeQueue(bodies: Array<{ body: string; timestamp: number; method?: string }>) {
  const entries = bodies.map(b => ({
    request: new Request(URL_ROUNDS, { method: b.method ?? 'POST', body: b.body }),
    timestamp: b.timestamp,
  }));
  return {
    entries,
    getAll: async () => [...entries],
    shiftRequest: async () => entries.shift(),
    pushRequest: async (e: (typeof entries)[number]) => { entries.push(e); },
  };
}

describe('service worker helpers', () => {
  it('readLegacyEntries describes each entry and leaves the queue untouched', async () => {
    const q = fakeQueue([{ body: JSON.stringify(ROUND), timestamp: 1000 }]);
    const out = await readLegacyEntries(q);
    expect(out).toEqual([{ id: `1000|${JSON.stringify(ROUND)}`, method: 'POST', url: URL_ROUNDS, body: JSON.stringify(ROUND) }]);
    expect(q.entries).toHaveLength(1);
    // The stored request must still be readable afterwards.
    expect(await q.entries[0].request.text()).toBe(JSON.stringify(ROUND));
  });

  it('dropTakenEntries deletes only what the page confirmed, keeping the rest in order', async () => {
    const q = fakeQueue([
      { body: '{"a":1}', timestamp: 1 },
      { body: '{"b":2}', timestamp: 2 },
      { body: '{"c":3}', timestamp: 3 },
    ]);
    const dropped = await dropTakenEntries(q, ['2|{"b":2}']);
    expect(dropped).toBe(1);
    expect(await Promise.all(q.entries.map(e => e.request.clone().text()))).toEqual(['{"a":1}', '{"c":3}']);
  });

  it('dropTakenEntries with nothing confirmed changes nothing', async () => {
    const q = fakeQueue([{ body: '{"a":1}', timestamp: 1 }]);
    expect(await dropTakenEntries(q, [])).toBe(0);
    expect(await dropTakenEntries(q, ['999|nope'])).toBe(0);
    expect(q.entries).toHaveLength(1);
  });
});

// ─── Page side ───────────────────────────────────────────────────────────────
function channel(entries: LegacyRoundRequest[] | null | 'throw'): LegacyQueueChannel & { taken: string[][] } {
  const taken: string[][] = [];
  return {
    taken,
    ask: async () => { if (entries === 'throw') throw new Error('worker gone'); return entries; },
    tellTaken: ids => { taken.push(ids); },
  };
}

describe('takeOverLegacyRounds', () => {
  it('moves a stored round save into the app queue, then confirms it', async () => {
    const entry = stored(ROUND);
    const ch = channel([entry]);

    expect(await takeOverLegacyRounds(ch)).toBe(1);

    const queue = getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('upsert_round');
    expect(queue[0].payload).toEqual(ROUND);
    expect(ch.taken).toEqual([[entry.id]]);
  });

  it('queues before it confirms — the note is on the phone before the old copy is deleted', async () => {
    const entry = stored(ROUND);
    let queuedWhenConfirmed = -1;
    await takeOverLegacyRounds({
      ask: async () => [entry],
      tellTaken: () => { queuedWhenConfirmed = getQueue().length; },
    });
    expect(queuedWhenConfirmed).toBe(1);
  });

  it('does not queue the same round twice when it is offered again (second tab, repeat offer)', async () => {
    const entry = stored(ROUND);
    await takeOverLegacyRounds(channel([entry]));
    const second = channel([entry]);

    expect(await takeOverLegacyRounds(second)).toBe(0);
    expect(getQueue()).toHaveLength(1);
    expect(second.taken).toEqual([[entry.id]]);   // still confirmed, so the old copy is cleaned up
  });

  it('does not treat a round already waiting in the app queue as new', async () => {
    enqueue('upsert_round', ROUND);
    expect(await takeOverLegacyRounds(channel([stored(ROUND)]))).toBe(0);
    expect(getQueue()).toHaveLength(1);
  });

  it('leaves an unreadable entry in the old queue: not queued, not confirmed', async () => {
    const good = stored(ROUND);
    const bad = stored(ROUND, { method: 'PATCH', id: 'bad' });
    const ch = channel([bad, good]);

    expect(await takeOverLegacyRounds(ch)).toBe(1);
    expect(getQueue()).toHaveLength(1);
    expect(ch.taken).toEqual([[good.id]]);
  });

  it('confirms nothing when nothing was readable', async () => {
    const ch = channel([stored(ROUND, { method: 'PATCH' })]);
    expect(await takeOverLegacyRounds(ch)).toBe(0);
    expect(ch.taken).toEqual([]);
  });

  it.each([
    ['the old queue is empty', [] as LegacyRoundRequest[]],
    ['the service worker does not answer (older version)', null],
    ['the service worker fails', 'throw' as const],
  ])('does nothing when %s', async (_label, entries) => {
    const ch = channel(entries);
    expect(await takeOverLegacyRounds(ch)).toBe(0);
    expect(getQueue()).toHaveLength(0);
    expect(ch.taken).toEqual([]);
  });
});
