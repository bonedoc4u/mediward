/**
 * Erase and export of one patient's data (audit DATA-07).
 *
 * The old erase sent an update naming columns that do not exist, so it always
 * failed. These tests pin the new shape: the app never writes patient columns
 * itself, the database is asked first, files go before records, and a
 * refusal at any step stops everything after it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  removePatientFiles: vi.fn(),
  order: [] as string[],
}));

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: h.rpc, from: h.from } }));
vi.mock('../../services/storageService', () => ({ removePatientFiles: h.removePatientFiles }));

import {
  fetchErasePreview, erasePatientData, eraseErrorMessage, buildPatientExport, PATIENT_LINKED_TABLES,
} from '../../services/patientDataRights';

const DRY = {
  dry_run: true, ip_no: 'IP/1', hospital_id: 'hosp-1', name: 'Test Patient', age: 61, gender: 'Male',
  ward: 'Male Ward', bed: '4', unit: 'OR1', patient_status: 'Discharged', rows_to_remove: 7,
  image_urls: ['hosp-1/IP/1/a.jpg'],
};

/** rpc answers: dry run first, then the real call. */
function answers(dry: unknown, real?: unknown) {
  h.rpc.mockImplementation(async (_fn: string, args: { p_dry_run?: boolean }) => {
    h.order.push(args.p_dry_run ? 'dry-run' : 'erase');
    return (args.p_dry_run ? dry : real) ?? { data: null, error: { message: 'unexpected call' } };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.order.length = 0;
  h.removePatientFiles.mockImplementation(async () => { h.order.push('files'); return { removed: 1, skipped: 0 }; });
});

describe('fetchErasePreview', () => {
  it('asks the database with a dry run and returns who the patient is', async () => {
    answers({ data: DRY, error: null });
    const p = await fetchErasePreview('  IP/1 ');
    expect(h.rpc).toHaveBeenCalledWith('erase_patient_data', { p_ip_no: 'IP/1', p_dry_run: true });
    expect(p).toMatchObject({
      ipNo: 'IP/1', hospitalId: 'hosp-1', name: 'Test Patient', age: 61, status: 'Discharged',
      rowsToRemove: 7, imagePaths: ['hosp-1/IP/1/a.jpg'], alreadyErased: false,
    });
  });

  it('marks a record that was erased before', async () => {
    answers({ data: { ...DRY, name: '[REDACTED]' }, error: null });
    expect((await fetchErasePreview('IP/1')).alreadyErased).toBe(true);
  });

  it.each([
    ['ROLE_FORBIDDEN: only an admin can erase patient data', /Only an admin/],
    ['PATIENT_NOT_FOUND: no patient with IP number IP/9 in this hospital', /No patient with IP number IP\/9/],
    ['PATIENT_STILL_ADMITTED: IP/9 is a current inpatient', /still admitted.*Nothing was erased/],
    ['Could not find the function public.erase_patient_data(p_ip_no) in the schema cache', /not switched on.*Nothing was erased/],
    ['Failed to fetch', /Nothing was erased\. Check the connection/],
  ])('turns "%s" into a sentence the admin can act on', async (dbMessage, expected) => {
    answers({ data: null, error: { message: dbMessage } });
    await expect(fetchErasePreview('IP/9')).rejects.toThrow(expected);
    expect(eraseErrorMessage(dbMessage, 'IP/9')).toMatch(expected);
  });
});

describe('erasePatientData', () => {
  it('asks first, removes the files, then erases the records — in that order', async () => {
    answers({ data: DRY, error: null }, { data: { ip_no: 'IP/1', rows_removed: 7 }, error: null });
    const done = await erasePatientData('IP/1');
    expect(h.order).toEqual(['dry-run', 'files', 'erase']);
    expect(h.removePatientFiles).toHaveBeenCalledWith('hosp-1', 'IP/1', ['hosp-1/IP/1/a.jpg']);
    expect(h.rpc).toHaveBeenLastCalledWith('erase_patient_data', { p_ip_no: 'IP/1' });
    expect(done).toEqual({ ipNo: 'IP/1', rowsRemoved: 7, filesRemoved: 1, filesSkipped: 0 });
  });

  it('never writes patient columns from the app (the old, broken way)', async () => {
    answers({ data: DRY, error: null }, { data: { rows_removed: 0 }, error: null });
    await erasePatientData('IP/1');
    expect(h.from).not.toHaveBeenCalled();
  });

  it('touches nothing when the database refuses the dry run', async () => {
    answers({ data: null, error: { message: 'PATIENT_STILL_ADMITTED: IP/1 is a current inpatient' } });
    await expect(erasePatientData('IP/1')).rejects.toThrow(/still admitted/);
    expect(h.order).toEqual(['dry-run']);
    expect(h.removePatientFiles).not.toHaveBeenCalled();
  });

  it('does not erase the records when the files could not be removed', async () => {
    answers({ data: DRY, error: null }, { data: { rows_removed: 7 }, error: null });
    h.removePatientFiles.mockRejectedValueOnce(new Error('1 of 1 image file(s) could not be removed.'));
    await expect(erasePatientData('IP/1')).rejects.toThrow(/could not be removed/);
    expect(h.order).toEqual(['dry-run']);
  });

  it('says to run it again when the records fail after the files are gone', async () => {
    answers({ data: DRY, error: null }, { data: null, error: { message: 'Failed to fetch' } });
    await expect(erasePatientData('IP/1')).rejects.toThrow(/files were removed.*NOT erased.*again/);
  });

  it('says nothing was erased when the records fail and no file had been removed', async () => {
    answers({ data: DRY, error: null }, { data: null, error: { message: 'Failed to fetch' } });
    h.removePatientFiles.mockResolvedValueOnce({ removed: 0, skipped: 0 });
    await expect(erasePatientData('IP/1')).rejects.toThrow(/^Nothing was erased/);
  });
});

describe('buildPatientExport', () => {
  type Res = { data: unknown; error: { message: string; code?: string } | null };
  let results: Record<string, Res>;
  let filters: Record<string, [string, unknown][]>;

  beforeEach(() => {
    results = { patients: { data: { ip_no: 'IP/1', name: 'Test Patient' }, error: null } };
    filters = {};
    h.from.mockImplementation((table: string) => {
      const res = () => Promise.resolve(results[table] ?? { data: [{ table }], error: null });
      filters[table] = [];
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => { filters[table].push([col, val]); return q; },
        maybeSingle: res,
        then: (ok: (r: Res) => unknown, fail: (e: unknown) => unknown) => res().then(ok, fail),
      };
      return q;
    });
  });

  it('includes every table that holds rows of the patient', async () => {
    const bundle = await buildPatientExport('IP/1', 'hosp-1');
    for (const [table, section] of Object.entries(PATIENT_LINKED_TABLES)) {
      expect(bundle[section], `${table} → ${section}`).toEqual([{ table }]);
    }
    expect(Object.keys(PATIENT_LINKED_TABLES)).toEqual(expect.arrayContaining([
      'labs', 'imaging', 'rounds', 'nursing_notes', 'patient_vitals', 'medications_prescribed', 'med_administrations',
      'wound_care', 'intake_output', 'blood_transfusion', 'ot_list_entries', 'consult_requests', 'handovers',
    ]));
    expect(bundle.notAvailable).toEqual([]);
  });

  it('only exports a patient of the user\'s own hospital', async () => {
    await buildPatientExport('IP/1', 'hosp-1');
    expect(filters.patients).toEqual([['ip_no', 'IP/1'], ['hospital_id', 'hosp-1']]);
    expect(filters.ot_list_entries).toEqual([['patient_ip_no', 'IP/1'], ['hospital_id', 'hosp-1']]);
    expect(filters.labs).toEqual([['patient_ip_no', 'IP/1']]);
  });

  it('refuses to export when the patient is not found', async () => {
    results.patients = { data: null, error: null };
    await expect(buildPatientExport('IP/1', 'hosp-1')).rejects.toThrow(/No patient with IP number IP\/1/);
  });

  it('refuses to hand over an export with a silent gap', async () => {
    results.patient_vitals = { data: null, error: { message: 'Failed to fetch' } };
    await expect(buildPatientExport('IP/1', 'hosp-1')).rejects.toThrow(/incomplete.*patient_vitals/);
  });

  it('names a table this database does not have instead of failing', async () => {
    results.wound_care = { data: null, error: { message: 'Could not find the table', code: 'PGRST205' } };
    const bundle = await buildPatientExport('IP/1', 'hosp-1');
    expect(bundle.notAvailable).toEqual(['wound_care']);
    expect(bundle.woundCare).toBeUndefined();
  });
});
