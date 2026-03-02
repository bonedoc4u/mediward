import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Supabase mock (must be before any import that uses it) ───────────────────
//
// vi.hoisted() creates values that are available inside the vi.mock() factory,
// which is hoisted to the top of the file before any imports are evaluated.

const mockState = vi.hoisted(() => ({
  result: { data: [] as any[], error: null as any },
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
    for (const m of ['select', 'neq', 'order', 'limit', 'eq', 'upsert', 'delete', 'insert']) {
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
    for (const m of ['select', 'neq', 'order', 'limit', 'eq', 'upsert', 'delete', 'insert']) {
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
    const builder = { select: vi.fn(), neq: vi.fn(), order: vi.fn(), limit: vi.fn(), eq: vi.fn(), then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn) };
    builder.select.mockReturnValue(builder);
    builder.neq.mockReturnValue(builder);
    builder.order.mockReturnValue(builder);
    builder.limit.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
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
      eq: eqSpy,
      then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
    };
    vi.mocked(supabase.from).mockReturnValue(builder);

    await fetchActivePatients();
    expect(eqSpy).not.toHaveBeenCalledWith('unit', expect.anything());
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

  it('resolves without throwing on success', async () => {
    mockState.result = { data: null, error: null };
    await expect(upsertPatient(makePatient())).resolves.toBeUndefined();
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
