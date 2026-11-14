/**
 * updateComorbidityMap() — the save behind "add a comorbidity preset"
 * (audit SEC-06 step 4).
 *
 * A doctor who is not an admin may change the preset list and nothing else in
 * the hospital settings row; the database compares every column that is sent.
 * So this save must send the preset list only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  results: [] as Array<{ data: unknown; error: { message: string } | null }>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../lib/supabase', () => {
  const createBuilder = () => {
    const b: Record<string, unknown> = {
      then(onFulfilled: (v: unknown) => unknown) {
        return Promise.resolve(db.results.shift() ?? { data: null, error: null }).then(onFulfilled);
      },
    };
    for (const m of ['select', 'eq', 'limit', 'maybeSingle']) b[m] = vi.fn().mockReturnValue(b);
    b.update = vi.fn((row: Record<string, unknown>) => { db.updates.push(row); return b; });
    return b;
  };
  return { supabase: { from: vi.fn().mockImplementation(createBuilder) } };
});

import { updateComorbidityMap } from '../../services/configService';

const MAP = [{ short: 'HTN', full: 'Hypertension' }];

beforeEach(() => {
  db.results = [];
  db.updates = [];
});

describe('updateComorbidityMap', () => {
  it('sends the preset list and the save time, and no other setting', async () => {
    db.results = [{ data: { id: 'cfg-1' }, error: null }, { data: [{ id: 'cfg-1' }], error: null }];

    await expect(updateComorbidityMap(MAP)).resolves.toBe(true);

    expect(db.updates).toHaveLength(1);
    expect(Object.keys(db.updates[0]).sort()).toEqual(['comorbidity_map', 'updated_at']);
    expect(db.updates[0].comorbidity_map).toEqual(MAP);
  });

  it('returns false, and writes nothing, when the hospital has no settings row yet', async () => {
    db.results = [{ data: null, error: null }];

    await expect(updateComorbidityMap(MAP)).resolves.toBe(false);
    expect(db.updates).toHaveLength(0);
  });

  it('throws the server\'s refusal so the caller can tell the user', async () => {
    db.results = [
      { data: { id: 'cfg-1' }, error: null },
      { data: null, error: { message: 'ROLE_FORBIDDEN: your role cannot change hospital settings' } },
    ];

    await expect(updateComorbidityMap(MAP)).rejects.toThrow(/ROLE_FORBIDDEN/);
  });

  it('throws when the server changed no row (never a silent success)', async () => {
    db.results = [{ data: { id: 'cfg-1' }, error: null }, { data: [], error: null }];

    await expect(updateComorbidityMap(MAP)).rejects.toThrow(/not saved/);
  });
});
