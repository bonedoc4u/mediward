import { describe, it, expect, vi, beforeEach } from 'vitest';

// Table-aware mock: unlike a single shared result, this service queries two
// different tables (ot_lists, ot_list_entries) in the same function
// (fetchOTList), so the mock needs to return a different canned result per
// table rather than one result for every call.
const mockState = vi.hoisted(() => ({
  results: {} as Record<string, { data: any; error: any }>,
  builders: {} as Record<string, Record<string, any>>,
}));

vi.mock('../../lib/supabase', () => {
  const createBuilder = (table: string) => {
    const b: Record<string, any> = {
      then(onFulfilled: (v: any) => any) {
        return Promise.resolve(mockState.results[table] ?? { data: null, error: null }).then(onFulfilled);
      },
    };
    for (const m of ['select', 'eq', 'order', 'upsert', 'insert', 'update', 'delete', 'maybeSingle', 'single']) {
      b[m] = vi.fn().mockReturnValue(b);
    }
    mockState.builders[table] = b;
    return b;
  };
  return {
    supabase: {
      from: vi.fn().mockImplementation((table: string) => createBuilder(table)),
    },
  };
});

import {
  fetchOTList, upsertOTListMeta, insertOTListEntry, updateOTListEntry,
  deleteOTListEntry, reorderOTListEntries,
} from '../../services/otListService';

beforeEach(() => {
  mockState.results = {};
  mockState.builders = {};
});

describe('fetchOTList', () => {
  it('returns null list and empty entries when no list exists yet', async () => {
    mockState.results['ot_lists'] = { data: null, error: null };
    const result = await fetchOTList('hosp-1', 'OR1', 'Major', '2026-08-06');
    expect(result.list).toBeNull();
    expect(result.entries).toEqual([]);
  });

  it('returns the list metadata and its entries when they exist', async () => {
    mockState.results['ot_lists'] = {
      data: { id: 'list-1', surgeon: 'Dr. Rao', surgeon_unit: 'OR1', ot_time: '8.00AM', version: 2 },
      error: null,
    };
    mockState.results['ot_list_entries'] = {
      data: [{
        id: 'entry-1', ot_list_id: 'list-1', sequence: 1, category: 'TABLE 1',
        patient_ip_no: 'IP001', name: 'Ravi Kumar', age: '52', gender: 'M',
        ward: '22', unit: 'OR1', diagnosis: 'Fracture femur', procedure: '',
        side: '', anesthesia: '', c_arm: 'No', implants: '', remarks: '', version: 1,
      }],
      error: null,
    };
    const result = await fetchOTList('hosp-1', 'OR1', 'Major', '2026-08-06');
    expect(result.list).toEqual({ id: 'list-1', surgeon: 'Dr. Rao', surgeonUnit: 'OR1', otTime: '8.00AM', version: 2 });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ id: 'entry-1', otListId: 'list-1', version: 1, ipNo: 'IP001', cArm: 'No' });
    expect(mockState.builders['ot_lists'].eq).toHaveBeenCalledWith('hospital_id', 'hosp-1');
    expect(mockState.builders['ot_list_entries'].eq).toHaveBeenCalledWith('ot_list_id', 'list-1');
  });

  it('throws with a descriptive message when the list query errors', async () => {
    mockState.results['ot_lists'] = { data: null, error: { message: 'network down' } };
    await expect(fetchOTList('hosp-1', 'OR1', 'Major', '2026-08-06')).rejects.toThrow(/network down/);
  });
});

describe('upsertOTListMeta', () => {
  it('returns the upserted list metadata', async () => {
    mockState.results['ot_lists'] = {
      data: { id: 'list-1', surgeon: 'Dr. Rao', surgeon_unit: 'OR1', ot_time: '8.00AM', version: 1 },
      error: null,
    };
    const result = await upsertOTListMeta('hosp-1', 'OR1', 'Major', '2026-08-06', { surgeon: 'Dr. Rao', surgeonUnit: 'OR1', otTime: '8.00AM' });
    expect(result).toEqual({ id: 'list-1', surgeon: 'Dr. Rao', surgeonUnit: 'OR1', otTime: '8.00AM', version: 1 });
    expect(mockState.builders['ot_lists'].upsert).toHaveBeenCalledWith(
      expect.objectContaining({ hospital_id: 'hosp-1' }),
      expect.anything(),
    );
  });
});

describe('insertOTListEntry', () => {
  it('returns the inserted entry with its real id/version', async () => {
    mockState.results['ot_list_entries'] = {
      data: {
        id: 'entry-1', ot_list_id: 'list-1', sequence: 1, category: 'TABLE 1',
        patient_ip_no: 'IP001', name: 'Ravi Kumar', age: '52', gender: 'M',
        ward: '22', unit: 'OR1', diagnosis: 'Fracture femur', procedure: '',
        side: '', anesthesia: '', c_arm: 'No', implants: '', remarks: '', version: 1,
      },
      error: null,
    };
    const result = await insertOTListEntry('list-1', 'hosp-1', {
      sequence: 1, ipNo: 'IP001', name: 'Ravi Kumar', age: '52', gender: 'M',
      ward: '22', unit: 'OR1', diagnosis: 'Fracture femur', procedure: '',
      side: '', anesthesia: '', cArm: 'No', implants: '', remarks: '',
      category: 'TABLE 1', otType: 'Major',
    });
    expect(result.id).toBe('entry-1');
    expect(result.otListId).toBe('list-1');
    expect(result.version).toBe(1);
    expect(mockState.builders['ot_list_entries'].insert).toHaveBeenCalledWith(
      expect.objectContaining({ hospital_id: 'hosp-1' }),
    );
  });
});

describe('updateOTListEntry', () => {
  it('returns the updated entry on success', async () => {
    mockState.results['ot_list_entries'] = {
      data: [{
        id: 'entry-1', ot_list_id: 'list-1', sequence: 1, category: 'TABLE 1',
        patient_ip_no: 'IP001', name: 'Ravi Kumar', age: '52', gender: 'M',
        ward: '22', unit: 'OR1', diagnosis: 'Fracture femur', procedure: '',
        side: '', anesthesia: 'GA', c_arm: 'No', implants: '', remarks: '', version: 2,
      }],
      error: null,
    };
    const result = await updateOTListEntry('entry-1', 1, { anesthesia: 'GA' });
    expect(result.anesthesia).toBe('GA');
    expect(result.version).toBe(2);
    expect(mockState.builders['ot_list_entries'].eq).toHaveBeenCalledWith('id', 'entry-1');
    expect(mockState.builders['ot_list_entries'].eq).toHaveBeenCalledWith('version', 1);
  });

  it('throws a CONCURRENT_EDIT error when the version check matches zero rows', async () => {
    mockState.results['ot_list_entries'] = { data: [], error: null };
    await expect(updateOTListEntry('entry-1', 1, { anesthesia: 'GA' }))
      .rejects.toThrow('CONCURRENT_EDIT:entry-1');
  });
});

describe('deleteOTListEntry', () => {
  it('resolves with no error on success', async () => {
    mockState.results['ot_list_entries'] = { data: null, error: null };
    await expect(deleteOTListEntry('entry-1')).resolves.toBeUndefined();
  });
});

describe('reorderOTListEntries', () => {
  it('resolves with the updated id/version pairs when all updates succeed', async () => {
    mockState.results['ot_list_entries'] = { data: [{ id: 'entry-1', version: 3 }], error: null };
    const result = await reorderOTListEntries([{ id: 'entry-1', sequence: 1, category: 'TABLE 1' }]);
    expect(result).toEqual([{ id: 'entry-1', version: 3 }]);
    expect(mockState.builders['ot_list_entries'].eq).not.toHaveBeenCalledWith('version', expect.anything());
  });

  it('throws if any update fails', async () => {
    mockState.results['ot_list_entries'] = { data: null, error: { message: 'row locked' } };
    await expect(reorderOTListEntries([{ id: 'entry-1', sequence: 1, category: 'TABLE 1' }]))
      .rejects.toThrow(/row locked/);
  });
});
