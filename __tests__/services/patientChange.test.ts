import { describe, it, expect, vi, beforeEach } from 'vitest';

// Captures what each save sends to the `patients` table.
const db = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<Record<string, unknown>>,
  result: { data: [{ version: 2 }] as unknown[] | null, error: null as { message: string } | null },
}));

vi.mock('../../lib/supabase', () => {
  const builder = () => {
    const b: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown) => Promise.resolve(db.result).then(ok),
    };
    b.update = (row: Record<string, unknown>) => { db.updates.push(row); return b; };
    b.insert = (row: Record<string, unknown>) => { db.inserts.push(row); return b; };
    for (const m of ['select', 'eq']) b[m] = () => b;
    return b;
  };
  return { supabase: { from: () => builder() } };
});

import { describePatientChange, upsertPatient, patientToRow } from '../../services/patientService';
import { ORDER_COLUMNS } from '../../utils/permissions';
import { Patient, PatientStatus, PacStatus, Gender } from '../../types';

const base: Patient = {
  ipNo: 'TEST-0001', name: 'Patient A', mobile: '', age: 60, gender: Gender.Male, ward: 'Male Ward', bed: '1',
  diagnosis: '# NOF right', comorbidities: ['DM'], drugAllergies: ['Penicillin'], doa: '2026-11-10',
  hospitalId: 'h-1', version: 1, pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [],
  todos: [{ id: 't1', task: 'Check Hb', isDone: false }],
} as Patient;

beforeEach(() => {
  db.updates = [];
  db.inserts = [];
  db.result = { data: [{ version: 2 }], error: null };
});

// Audit SEC-06: role rules are decided per stored column, because orders live
// inside the patient record.
describe('describePatientChange', () => {
  it('ticking an order changes the todos column and nothing else', () => {
    const after = { ...base, todos: [{ ...base.todos[0], isDone: true }] };
    expect(describePatientChange(base, after)?.columns).toEqual(['todos']);
  });

  it('a new round note is not a change to the patient record (rounds have their own table)', () => {
    const after = { ...base, dailyRounds: [{ date: '2026-11-13', note: 'Wound dry.', todos: [] }] } as Patient;
    expect(describePatientChange(base, after)?.columns).toEqual([]);
  });

  it('names every changed column, and the status before and after', () => {
    const after = { ...base, patientStatus: PatientStatus.Discharged, dod: '2026-11-13' } as Patient;
    const change = describePatientChange(base, after);
    expect([...(change?.columns ?? [])].sort()).toEqual(['dod', 'patient_status']);
    expect(change).toMatchObject({ statusBefore: 'Fit', statusAfter: 'Discharged' });
  });

  it('an unchanged patient gives no columns', () => {
    expect(describePatientChange(base, { ...base })?.columns).toEqual([]);
  });

  it('gives null when there is nothing to compare with', () => {
    expect(describePatientChange(undefined, base)).toBeNull();
  });
});

describe('upsertPatient — orders-only save', () => {
  const ticked = { ...base, todos: [{ ...base.todos[0], isDone: true }] };

  it('sends only the orders column', async () => {
    await upsertPatient(ticked, false, ORDER_COLUMNS);
    expect(db.updates).toEqual([{ todos: ticked.todos }]);
  });

  it('never sends the diagnosis, allergies or status with it', async () => {
    await upsertPatient(ticked, false, ORDER_COLUMNS);
    const sent = Object.keys(db.updates[0]);
    for (const column of ['diagnosis', 'drug_allergies', 'patient_status', 'pac_flow', 'hospital_id']) {
      expect(sent).not.toContain(column);
    }
  });

  it('a normal save still sends the whole record', async () => {
    await upsertPatient(ticked);
    expect(db.updates).toEqual([patientToRow(ticked)]);
  });

  it('still detects a concurrent edit (0 rows updated)', async () => {
    db.result = { data: [], error: null };
    await expect(upsertPatient(ticked, false, ORDER_COLUMNS)).rejects.toThrow('CONCURRENT_EDIT:TEST-0001');
  });

  it('a new patient is inserted whole, whatever the column limit says', async () => {
    const fresh = { ...base, version: undefined, updatedAt: undefined } as Patient;
    await upsertPatient(fresh, false, ORDER_COLUMNS);
    expect(db.inserts).toEqual([patientToRow(fresh)]);
    expect(db.updates).toEqual([]);
  });
});
