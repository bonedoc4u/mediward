/**
 * Contract test for erase_patient_data() (audit DATA-07).
 *
 * CI has no database, so this reads the migration file. The live proof is
 * scripts/check-erase-patient-data.mjs, run against the dev database.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { migrationPath, migrationsAfter } from './helpers/migrations';

const FILE = '20261114180000_erase_patient_data.sql';
const sql = fs.readFileSync(migrationPath(FILE), 'utf8');
// The function body only, without the header comment.
const body = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.erase_patient_data'));

describe('erase_patient_data migration', () => {
  it('is the last migration that defines the function', () => {
    const later = migrationsAfter(FILE)
      .filter(f => /FUNCTION\s+public\.erase_patient_data/i.test(fs.readFileSync(migrationPath(f), 'utf8')));
    expect(later, 'a later migration redefines erase_patient_data; move these checks there').toEqual([]);
  });

  it('checks the caller inside the function (it runs with owner rights)', () => {
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path = public/);
    expect(body).toMatch(/auth\.uid\(\)/);
    expect(body).toMatch(/IF NOT public\.is_admin\(\) THEN\s+RAISE EXCEPTION 'ROLE_FORBIDDEN/);
  });

  it('only finds a patient of the caller\'s own hospital', () => {
    expect(body).toMatch(/hospital_id = public\.get_my_hospital_id\(\) OR public\.is_superadmin\(\)/);
    expect(body).toMatch(/PATIENT_NOT_FOUND/);
  });

  it('refuses a current inpatient', () => {
    expect(body).toMatch(/c_inpatient constant text\[\] := ARRAY\['Fit', 'Review', 'Critical', 'Discharge Ready'\]/);
    expect(body).toMatch(/PATIENT_STILL_ADMITTED/);
  });

  it('finds the linked tables from the database, not from a list that can go stale', () => {
    expect(body).toMatch(/a\.attname = 'patient_ip_no'/);
    expect(body).toMatch(/k\.confrelid = 'public\.patients'::regclass/);
    // No hard-coded DELETE FROM a clinical table.
    expect(body).not.toMatch(/DELETE FROM public\.(rounds|labs|imaging|nursing_notes|patient_vitals)\b/);
  });

  it('wipes every patient column it does not explicitly keep (new columns included)', () => {
    expect(body).toMatch(/%I = DEFAULT/);
    expect(body).toMatch(/a\.attname <> ALL \(c_keep \|\| c_fixed\)/);
    const keep = body.match(/c_keep constant text\[\] := ARRAY\[([\s\S]*?)\];/)?.[1] ?? '';
    const kept = [...keep.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
    // Personal or clinical columns must never be on the keep list.
    for (const col of ['name', 'mobile', 'abha_id', 'age', 'diagnosis', 'procedure', 'comorbidities', 'drug_allergies',
      'daily_rounds', 'lab_results', 'investigations', 'vitals', 'todos', 'discharge_summary', 'death_summary',
      'dama_summary', 'specialty_data', 'fractures', 'prior_surgeries']) {
      expect(kept, `${col} must be erased`).not.toContain(col);
    }
  });

  it('changes nothing in a dry run', () => {
    const dry = body.indexOf('IF p_dry_run THEN\n    RETURN');
    const firstUpdate = body.indexOf('UPDATE public.patients');
    expect(dry).toBeGreaterThan(-1);
    expect(dry, 'the dry run must return before the patient row is changed').toBeLessThan(firstUpdate);
    expect(body).toMatch(/IF p_dry_run THEN\s+EXECUTE format\('SELECT count\(\*\)/);
  });

  it('records the erase in the audit log without patient details', () => {
    expect(body).toMatch(/INSERT INTO public\.audit_log/);
    const details = body.match(/format\('Personal data erased[^']*'/)?.[0] ?? '';
    expect(details).not.toMatch(/name|diagnosis/i);
  });

  it('cannot be called without signing in', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.erase_patient_data\(text, boolean\) FROM PUBLIC, anon;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.erase_patient_data\(text, boolean\) TO authenticated, service_role;/);
  });

  it('has a rollback in its header', () => {
    expect(sql).toMatch(/-- Rollback[\s\S]*DROP FUNCTION IF EXISTS public\.erase_patient_data\(text, boolean\);/);
  });
});
