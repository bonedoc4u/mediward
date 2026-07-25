import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Supabase mock (must be before any import that uses it) ───────────────────
//
// vi.hoisted() creates values that are available inside the vi.mock() factory,
// which is hoisted to the top of the file before any imports are evaluated.

const mockState = vi.hoisted(() => ({
  result: { data: [] as any[] | null, error: null as any },
}));

vi.mock('../../lib/supabase', () => {
  // Chainable + thenable query builder.
  // Every method returns `this`, making the whole chain awaitable at any point.
  const createBuilder = () => {
    const b: Record<string, any> = {
      then(onFulfilled: (v: any) => any) {
        return Promise.resolve(mockState.result).then(onFulfilled);
      },
    };
    for (const m of ['select', 'neq', 'order', 'limit', 'eq', 'upsert', 'delete', 'insert', 'update', 'is', 'not', 'maybeSingle', 'range']) {
      b[m] = vi.fn().mockReturnValue(b);
    }
    return b;
  };

  return {
    supabase: { from: vi.fn().mockImplementation(createBuilder) },
  };
});

import { supabase } from '../../lib/supabase';
import {
  fetchActivePatients,
  fetchAllPatients,
  upsertPatient,
  removePatient,
} from '../../services/patientService';
import { Patient, PatientStatus, PacStatus, Gender } from '../../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeRow = (overrides: Record<string, any> = {}) => ({
  ip_no: 'IP001',
  name: 'Ravi Kumar',
  mobile: '9876543210',
  age: 52,
  gender: 'Male',
  ward: 'Ortho A',
  bed: '5',
  unit: null,
  diagnosis: 'Intertrochanteric fracture',
  procedure: null,
  comorbidities: [],
  doa: '2024-01-15',
  dos: null,
  planned_dos: null,
  dod: null,
  pod: null,
  pac_status: 'PAC Fit',
  patient_status: 'Fit',
  daily_rounds: [],
  todos: [],
  pac_checklist: null,
  prior_surgeries: null,
  fractures: null,
  pre_op_checklist: null,
  discharge_summary: null,
  created_at: '2024-01-15T08:00:00Z',
  updated_at: '2024-01-15T08:00:00Z',
  labs: [],
  imaging: [],
  ...overrides,
});

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  ipNo: 'IP001',
  name: 'Ravi Kumar',
  mobile: '9876543210',
  age: 52,
  gender: Gender.Male,
  ward: 'Ortho A',
  bed: '5',
  diagnosis: 'Intertrochanteric fracture',
  comorbidities: [],
  doa: '2024-01-15',
  pacStatus: PacStatus.Fit,
  patientStatus: PatientStatus.Fit,
  dailyRounds: [],
  investigations: [],
  labResults: [],
  todos: [],
  ...overrides,
});

beforeEach(() => {
  mockState.result = { data: [], error: null };
  vi.clearAllMocks();
  // Re-apply the chainable mock after clearAllMocks resets spies
  const createBuilder = () => {
    const b: Record<string, any> = {
      then(onFulfilled: (v: any) => any) {
        return Promise.resolve(mockState.result).then(onFulfilled);
      },
    };
    for (const m of ['select', 'neq', 'order', 'limit', 'eq', 'upsert', 'delete', 'insert', 'update', 'is', 'not', 'maybeSingle', 'range']) {
      b[m] = vi.fn().mockReturnValue(b);
    }
    return b;
  };
  vi.mocked(supabase.from).mockImplementation(createBuilder as any);
});

// ─── fetchActivePatients ──────────────────────────────────────────────────────

describe('fetchActivePatients', () => {
  it('queries the patients table', async () => {
    await fetchActivePatients();
    expect(supabase.from).toHaveBeenCalledWith('patients');
  });

  it('returns an empty array when no rows exist', async () => {
    mockState.result = { data: [], error: null };
    const patients = await fetchActivePatients();
    expect(patients).toEqual([]);
  });

  it('maps a DB row to a Patient object correctly', async () => {
    mockState.result = { data: [makeRow()], error: null };
    const patients = await fetchActivePatients();
    expect(patients).toHaveLength(1);
    const p = patients[0];
    expect(p.ipNo).toBe('IP001');
    expect(p.name).toBe('Ravi Kumar');
    expect(p.age).toBe(52);
    expect(p.gender).toBe('Male');
    expect(p.ward).toBe('Ortho A');
    expect(p.bed).toBe('5');
    expect(p.pacStatus).toBe('PAC Fit');
    expect(p.patientStatus).toBe('Fit');
  });

  it('maps nested labs rows to labResults', async () => {
    mockState.result = {
      data: [makeRow({
        labs: [{ id: 'l1', date: '2024-01-15', type: 'HB', value: '11.5' }],
      })],
      error: null,
    };
    const patients = await fetchActivePatients();
    expect(patients[0].labResults).toHaveLength(1);
    expect(patients[0].labResults[0].type).toBe('HB');
    expect(patients[0].labResults[0].value).toBe(11.5); // coerced to number
  });

  it('maps nested imaging rows to investigations', async () => {
    mockState.result = {
      data: [makeRow({
        imaging: [{ id: 'i1', date: '2024-01-15', type: 'X-Ray', findings: 'NOF fracture', image_url: null }],
      })],
      error: null,
    };
    const patients = await fetchActivePatients();
    expect(patients[0].investigations).toHaveLength(1);
    expect(patients[0].investigations[0].type).toBe('X-Ray');
    expect(patients[0].investigations[0].findings).toBe('NOF fracture');
    expect(patients[0].investigations[0].imageUrl).toBe('');
  });

  it('defaults labs and imaging to empty arrays when absent from row', async () => {
    mockState.result = { data: [makeRow({ labs: null, imaging: undefined })], error: null };
    const patients = await fetchActivePatients();
    expect(patients[0].labResults).toEqual([]);
    expect(patients[0].investigations).toEqual([]);
  });

  it('throws a descriptive error when Supabase returns an error', async () => {
    mockState.result = { data: null, error: { message: 'permission denied' } };
    await expect(fetchActivePatients()).rejects.toThrow('fetchActivePatients');
    await expect(fetchActivePatients()).rejects.toThrow('permission denied');
  });

  it('applies unit filter when unit is provided', async () => {
    const builder = { select: vi.fn(), neq: vi.fn(), order: vi.fn(), limit: vi.fn(), eq: vi.fn(), is: vi.fn(), then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn) };
    builder.select.mockReturnValue(builder);
    builder.neq.mockReturnValue(builder);
    builder.order.mockReturnValue(builder);
    builder.limit.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.is.mockReturnValue(builder);
    vi.mocked(supabase.from).mockReturnValue(builder as any);

    await fetchActivePatients('OR1');
    expect(builder.eq).toHaveBeenCalledWith('unit', 'OR1');
  });

  it('does NOT apply unit filter when no unit provided', async () => {
    const eqSpy = vi.fn().mockReturnValue({ then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn) });
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      eq: eqSpy,
      then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
    };
    vi.mocked(supabase.from).mockReturnValue(builder);

    await fetchActivePatients();
    expect(eqSpy).not.toHaveBeenCalledWith('unit', expect.anything());
  });
});

describe('priorSurgeries mapping', () => {
  it('maps prior_surgeries to an empty array when null', async () => {
    mockState.result = { data: [makeRow({ prior_surgeries: null })], error: null };
    const patients = await fetchActivePatients();
    expect(patients[0].priorSurgeries).toEqual([]);
  });

  it('maps prior_surgeries rows through unchanged', async () => {
    const surgeries = [{ procedure: 'DHS fixation', dos: '2026-06-01' }];
    mockState.result = { data: [makeRow({ prior_surgeries: surgeries })], error: null };
    const patients = await fetchActivePatients();
    expect(patients[0].priorSurgeries).toEqual(surgeries);
  });
});

describe('fractures mapping', () => {
  it('maps fractures to an empty array when null', async () => {
    mockState.result = { data: [makeRow({ fractures: null })], error: null };
    const patients = await fetchActivePatients();
    expect(patients[0].fractures).toEqual([]);
  });

  it('maps fractures rows through unchanged', async () => {
    const fractures = [{
      id: 'f1', region: 'nof', side: 'right',
      classifications: [{ system: 'Garden', grade: 'IV' }],
    }];
    mockState.result = { data: [makeRow({ fractures })], error: null };
    const patients = await fetchActivePatients();
    expect(patients[0].fractures).toEqual(fractures);
  });
});

// ─── fetchAllPatients ─────────────────────────────────────────────────────────

describe('fetchAllPatients', () => {
  it('queries patients without the Discharged filter', async () => {
    // fetchAllPatients should NOT call .neq('patient_status', 'Discharged')
    const neqSpy = vi.fn().mockReturnThis();
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      neq: neqSpy,
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
    };
    vi.mocked(supabase.from).mockReturnValue(builder);

    await fetchAllPatients();
    expect(neqSpy).not.toHaveBeenCalled();
  });

  it('returns all patients including discharged', async () => {
    mockState.result = {
      data: [
        makeRow({ patient_status: 'Fit' }),
        makeRow({ ip_no: 'IP002', patient_status: 'Discharged' }),
      ],
      error: null,
    };
    const patients = await fetchAllPatients();
    expect(patients).toHaveLength(2);
    expect(patients.some(p => p.patientStatus === 'Discharged')).toBe(true);
  });

  it('throws on Supabase error', async () => {
    mockState.result = { data: null, error: { message: 'table not found' } };
    await expect(fetchAllPatients()).rejects.toThrow('fetchAllPatients');
  });
});

// ─── upsertPatient ────────────────────────────────────────────────────────────

describe('upsertPatient', () => {
  it('calls supabase.from("patients")', async () => {
    mockState.result = { data: null, error: null };
    await upsertPatient(makePatient());
    expect(supabase.from).toHaveBeenCalledWith('patients');
  });

  it('throws a descriptive error when upsert fails', async () => {
    mockState.result = { data: null, error: { message: 'unique constraint' } };
    await expect(upsertPatient(makePatient())).rejects.toThrow('upsertPatient');
    await expect(upsertPatient(makePatient())).rejects.toThrow('unique constraint');
  });

  it('resolves without throwing on success (new patient insert, no version yet)', async () => {
    mockState.result = { data: null, error: null };
    await expect(upsertPatient(makePatient())).resolves.toBeUndefined();
  });

  it('throws CONCURRENT_EDIT when the conditional update matches 0 rows', async () => {
    mockState.result = { data: [], error: null };
    await expect(upsertPatient(makePatient({ updatedAt: '2024-01-15T08:00:00Z' })))
      .rejects.toThrow('CONCURRENT_EDIT:IP001');
  });

  it('force-save resolves when the unconditional update actually affects a row', async () => {
    mockState.result = { data: [{ version: 3 }], error: null };
    await expect(upsertPatient(makePatient(), true)).resolves.toBe(3);
  });

  it('force-save throws FORCE_SAVE_BLOCKED instead of reporting silent success when RLS zeroes out the write', async () => {
    // Regression: RLS (e.g. an orphaned session where get_my_hospital_id() is NULL)
    // can make an unconditional UPDATE match 0 rows without Postgres raising an
    // error. Before this fix, forceUpdate never checked `data`, so the caller
    // believed the force-save succeeded even though nothing was written.
    mockState.result = { data: [], error: null };
    await expect(upsertPatient(makePatient(), true))
      .rejects.toThrow('FORCE_SAVE_BLOCKED:IP001');
  });

  // Regression: patients.updated_at is bumped by a DB trigger on every UPDATE, but the
  // client never refreshed its cached updated_at after a successful save — so a second
  // edit in the same session always failed its optimistic-lock check against itself,
  // misreported as a peer conflict. version (also trigger-maintained) is now the lock key
  // and the caller is expected to persist the returned value after every save.
  describe('version-based optimistic lock', () => {
    it('locks on version (not updated_at) when the patient has a cached version', async () => {
      mockState.result = { data: [{ version: 6 }], error: null };
      const result = await upsertPatient(makePatient({ version: 5, updatedAt: 'stale-timestamp' }));
      expect(result).toBe(6);
      // eq() is called for ip_no then version — confirm 'version' was used, not 'updated_at'
      const builder = vi.mocked(supabase.from).mock.results[0].value;
      expect(builder.eq).toHaveBeenCalledWith('version', 5);
      expect(builder.eq).not.toHaveBeenCalledWith('updated_at', 'stale-timestamp');
    });

    it('falls back to updated_at when no version is cached (pre-migration patient)', async () => {
      mockState.result = { data: [{ version: 2 }], error: null };
      const result = await upsertPatient(makePatient({ updatedAt: '2024-01-15T08:00:00Z' }));
      expect(result).toBe(2);
      const builder = vi.mocked(supabase.from).mock.results[0].value;
      expect(builder.eq).toHaveBeenCalledWith('updated_at', '2024-01-15T08:00:00Z');
    });

    it('returns the new version on a plain insert', async () => {
      mockState.result = { data: [{ version: 1 }], error: null };
      const result = await upsertPatient(makePatient());
      expect(result).toBe(1);
    });
  });
});

// ─── removePatient ────────────────────────────────────────────────────────────

describe('removePatient', () => {
  it('calls supabase.from("patients")', async () => {
    mockState.result = { data: null, error: null };
    await removePatient('IP001');
    expect(supabase.from).toHaveBeenCalledWith('patients');
  });

  it('throws a descriptive error when delete fails', async () => {
    mockState.result = { data: null, error: { message: 'forbidden' } };
    await expect(removePatient('IP001')).rejects.toThrow('removePatient');
    await expect(removePatient('IP001')).rejects.toThrow('forbidden');
  });

  it('resolves without throwing on success', async () => {
    mockState.result = { data: null, error: null };
    await expect(removePatient('IP001')).resolves.toBeUndefined();
  });
});
