/**
 * SEC-03 / OPS-01: the repo must be able to rebuild production.
 *
 * supabase/migrations/ starts with one baseline made from production's
 * structure (14 Nov 2026). These checks keep it honest: it comes first,
 * nothing new is dated before it, it holds no rows or private data, and
 * every table in it has row-level security switched on.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  ARCHIVE_DIR, BASELINE_FILE, activeMigrationFiles, readMigration,
} from './helpers/migrations';

const baseline = readMigration(BASELINE_FILE);
const tables = [...baseline.matchAll(/^CREATE TABLE IF NOT EXISTS "public"\."(\w+)"/gm)].map(m => m[1]);

describe('production baseline migration', () => {
  it('is the first active migration, and nothing new is dated before it', () => {
    expect(activeMigrationFiles()[0]).toBe(BASELINE_FILE);
  });

  it('leaves nothing in the archive dated on or after it', () => {
    const late = fs.readdirSync(ARCHIVE_DIR).filter(f => /^\d{14}_/.test(f) && f >= BASELINE_FILE);
    expect(late).toEqual([]);
  });

  it('describes all 27 production tables', () => {
    expect(tables.length).toBe(27);
    for (const t of ['patients', 'app_users', 'rounds', 'audit_log', 'hospital_config']) {
      expect(tables).toContain(t);
    }
  });

  it('switches on row-level security for every table', () => {
    const missing = tables.filter(t =>
      !baseline.includes(`ALTER TABLE "public"."${t}" ENABLE ROW LEVEL SECURITY;`));
    expect(missing).toEqual([]);
  });

  it('holds no rows: the only insert is the radiology storage bucket', () => {
    expect(baseline).not.toMatch(/^COPY /m);
    const inserts = baseline.match(/^INSERT INTO .*/gm) ?? [];
    expect(inserts).toEqual(['INSERT INTO "storage"."buckets" ("id", "name", "public")']);
    expect(baseline).toMatch(/VALUES \('radiology', 'radiology', false\)/);
  });

  it('holds no email addresses, keys or hard-coded ids (the repo is public)', () => {
    expect(baseline).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/);
    expect(baseline).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}/);
    expect(baseline).not.toMatch(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/);
  });

  it('keeps scan files private to each hospital', () => {
    for (const cmd of ['select', 'insert', 'update', 'delete']) {
      const rule = baseline.match(new RegExp(`CREATE POLICY "radiology_hospital_${cmd}" ON "storage"\\."objects"[\\s\\S]*?;\\n`));
      expect(rule, cmd).not.toBeNull();
      expect(rule![0]).toMatch(/TO "authenticated"/);
      expect(rule![0]).toMatch(/"storage"\."foldername"\("name"\)\)\[1\]/);
      expect(rule![0]).toMatch(/"hospital_id"/);
    }
  });

  it('includes the changes from production steps 1 to 10', () => {
    expect(baseline).toMatch(/"round_note"/);                                      // step 4
    expect(baseline).toMatch(/FUNCTION "public"\."save_round"/);                    // step 5
    expect(baseline).toMatch(/TRIGGER "a_patients_role_rules"/);                    // step 6
    expect(baseline).toMatch(/TRIGGER "a_role_check" .* ON "public"\."labs"/);      // step 7
    expect(baseline).toMatch(/TRIGGER "a_hospital_config_role_rules"/);             // step 8
    expect(baseline).toMatch(/FUNCTION "public"\."erase_patient_data"/);            // step 9
    expect(baseline).not.toMatch(/CREATE POLICY "[^"]+" ON "public"\."audit_log" FOR (INSERT|ALL)/); // step 10
    expect(baseline).not.toMatch(/patients_pac_status_check/);                      // step 3
  });
});
