/**
 * Guards the role rules on the clinical tables (audit 2026-11-12, SEC-06 step 3).
 *
 * Before: rounds, labs, imaging, bedside charting and OT lists checked the
 * hospital only. A login that may only write round notes could add or delete
 * lab results, vitals, medication records… through the API.
 *
 * CI has no database, so this reads the migration files and the app's code:
 *  1. each clinical table needs the permission agreed for it, and that
 *     permission exists in the app's role table;
 *  2. every table the app writes to is covered by a role rule somewhere —
 *     a new table cannot be added and forgotten;
 *  3. the trigger and the policies keep their shape, and no later migration
 *     adds a hospital-only write policy back.
 * The live check is scripts/check-clinical-role-rules.mjs (dev project only).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ROLE_PERMISSIONS, type Permission } from '../utils/permissions';
import type { UserRole } from '../types';

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'supabase', 'migrations');
const FILE = '20261114120000_clinical_tables_role_rules.sql';
const stripComments = (sql: string) => sql.replace(/--.*$/gm, '');
const sql = stripComments(fs.readFileSync(path.join(DIR, FILE), 'utf-8'));

/** table → permission, from the VALUES list in the migration. */
const rules = new Map<string, string>(
  [...sql.matchAll(/\('(\w+)',\s+'([a-z]+:[a-z]+)',\s+c_\w+,\s+(?:NULL|c_\w+)\)/g)].map(m => [m[1], m[2]]),
);

// Agreed on 13 Nov 2026. Bedside charting is one permission in the app
// ('charting:write'), so it is one permission here.
const EXPECTED: Record<string, Permission> = {
  rounds: 'rounds:write',
  labs: 'labs:write',
  imaging: 'investigations:write',
  patient_vitals: 'charting:write',
  nursing_notes: 'charting:write',
  medications_prescribed: 'charting:write',
  med_administrations: 'charting:write',
  wound_care: 'charting:write',
  intake_output: 'charting:write',
  blood_transfusion: 'charting:write',
  ot_lists: 'otlist:write',
  ot_list_entries: 'otlist:write',
};

/**
 * Tables the app writes to whose role rule lives somewhere else. Adding a
 * table here needs a reason; "nobody decided" is not one.
 */
const RULED_ELSEWHERE: Record<string, string> = {
  patients: 'step 2: 20261114090000_patients_role_rules.sql',
  app_users: 'SEC-01: 20261112190000_app_users_role_scoped_write_policies.sql (admins only)',
  hospitals: 'superadmin only (hospitals_update_super)',
  invites: 'superadmin only (invites_superadmin_all)',
  status_incidents: 'superadmin only (status_incidents_superadmin_write)',
  lab_type_config: 'admins only (lab_type_config_write)',
  medication_config: 'admins only (medication_config_write)',
  department_templates: 'admins only (dept_templates_write)',
  compliance_acceptances: 'each user records only their own acceptance (user_id = auth.uid())',
  hospital_config: 'step 4: 20261114150000_settings_tables_role_rules.sql (admins; preset list also patient:add)',
  ward_config: 'step 4: 20261114150000_settings_tables_role_rules.sql (admins only)',
  unit_chiefs: 'step 4: 20261114150000_settings_tables_role_rules.sql (admins only)',
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '__tests__', 'dist', 'android'].includes(entry.name)) sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** Every table name the app sends an insert / update / upsert / delete to. */
function tablesTheAppWrites(): string[] {
  const tables = new Set<string>();
  for (const dir of ['services', 'src', 'contexts', 'components', 'hooks', 'lib', 'utils']) {
    for (const file of sourceFiles(path.join(ROOT, dir))) {
      const code = fs.readFileSync(file, 'utf-8');
      for (const m of code.matchAll(/from\('(\w+)'\)[^;]*?\.(?:insert|upsert|update|delete)\(/g)) tables.add(m[1]);
    }
  }
  return [...tables].sort();
}

describe('clinical tables: which permission each one needs', () => {
  it('matches the agreed table', () => {
    expect(Object.fromEntries(rules)).toEqual(EXPECTED);
  });

  it('uses only permissions that exist in the app role table', () => {
    const appPermissions = new Set((Object.keys(ROLE_PERMISSIONS) as UserRole[]).flatMap(r => ROLE_PERMISSIONS[r]));
    for (const permission of rules.values()) expect(appPermissions.has(permission as Permission), permission).toBe(true);
  });

  // The point of the decision on 13 Nov: the consultant keeps writing round
  // notes; everything else on these tables is closed to that role.
  it('an attending can write rounds and no other clinical table', () => {
    const open = [...rules].filter(([, p]) => ROLE_PERMISSIONS.attending.includes(p as Permission)).map(([t]) => t);
    expect(open).toEqual(['rounds']);
  });

  it.each(['admin', 'resident', 'house_surgeon', 'superadmin'] as UserRole[])(
    '%s can still write every clinical table', (role) => {
      for (const [table, permission] of rules) {
        expect(ROLE_PERMISSIONS[role].includes(permission as Permission), `${role} → ${table}`).toBe(true);
      }
    });
});

describe('no table the app writes to is left without a role rule', () => {
  const written = tablesTheAppWrites();

  it('finds the tables (the scan itself works)', () => {
    expect(written).toEqual(expect.arrayContaining(['patients', 'rounds', 'labs', 'patient_vitals', 'ot_list_entries']));
  });

  it.each(written)('%s', (table) => {
    const covered = rules.has(table) || table in RULED_ELSEWHERE;
    expect(covered, `"${table}" is written by the app but has no role rule: add it to a migration like ${FILE}`).toBe(true);
  });
});

describe('clinical tables: trigger and policies', () => {
  // The function as the database ends up with it: a later migration (step 4)
  // replaced it with a version that takes several permissions.
  const fn = (() => {
    let body = '';
    for (const file of fs.readdirSync(DIR).filter(f => /^\d{14}_.*\.sql$/.test(f)).sort()) {
      const text = stripComments(fs.readFileSync(path.join(DIR, file), 'utf-8'));
      for (const m of text.matchAll(/CREATE OR REPLACE FUNCTION public\.enforce_role_permission\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$/g)) body = m[1];
    }
    return body;
  })();

  it('the trigger function asks the role table for the permissions it was given', () => {
    expect(fn).toMatch(/FOR i IN 0 \.\. TG_NARGS - 1 LOOP\s+v_allowed := v_allowed OR public\.current_user_can\(TG_ARGV\[i\]\);/);
    expect(fn).toMatch(/v_allowed boolean := false;/);
  });

  it('a refusal starts with ROLE_FORBIDDEN (the app keys on that text)', () => {
    expect(fn).toMatch(/IF NOT v_allowed THEN\s+RAISE EXCEPTION 'ROLE_FORBIDDEN: /);
    expect(fn).toMatch(/ERRCODE = '42501'/);
  });

  it('service-role calls and cascades are let through, nothing else', () => {
    expect(fn).toMatch(/IF auth\.uid\(\) IS NULL OR pg_trigger_depth\(\) > 1 THEN\s+RETURN NULL;/);
    expect(fn.match(/RETURN NULL;/g)?.length).toBe(2); // the line above, and the normal end
  });

  it('the trigger fires once per statement, before every insert, update and delete', () => {
    expect(sql).toMatch(/CREATE TRIGGER a_role_check BEFORE INSERT OR UPDATE OR DELETE ON public\.%I '\s*\|\| 'FOR EACH STATEMENT EXECUTE FUNCTION public\.enforce_role_permission\(%L\)'/);
  });

  it('every old policy on the table is dropped first, whatever its name', () => {
    expect(sql).toMatch(/FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = r\.tbl LOOP\s+EXECUTE format\('DROP POLICY %I ON public\.%I', p\.policyname, r\.tbl\);/);
  });

  it('every write policy needs the hospital AND the permission', () => {
    expect(sql).toMatch(/v_can\s+:= format\('\(SELECT public\.current_user_can\(%L\)\)', r\.permission\);/);
    expect(sql).toMatch(/v_write\s+:= format\('\(%s\) AND %s', v_tenant, v_can\);/);
    for (const command of ['INSERT', 'UPDATE', 'DELETE']) {
      const create = sql.match(new RegExp(`CREATE POLICY %I ON public\\.%I FOR ${command} TO authenticated[\\s\\S]*?;`))?.[0] ?? '';
      expect(create, command).toContain('v_write');
      expect(create, command).not.toMatch(/,\s*v_tenant\s*\)/);
    }
  });

  it('reading stays open to the whole hospital (no role check)', () => {
    const read = sql.match(/CREATE POLICY %I ON public\.%I FOR SELECT TO authenticated[\s\S]*?;/)?.[0] ?? '';
    expect(read).toContain("r.tbl || '_read', r.tbl, v_tenant");
    expect(read).not.toContain('v_write');
  });

  it('every hospital check is tenant-scoped', () => {
    for (const name of ['c_mine', 'c_super', 'c_via_patient', 'c_patient_only']) {
      const def = sql.match(new RegExp(`${name}\\s+constant text :=([\\s\\S]*?);`))?.[1] ?? '';
      expect(def, name).toContain('hospital_id = public.get_my_hospital_id()');
    }
  });

  it('no later migration adds a write policy without the role check to these tables', () => {
    const later = fs.readdirSync(DIR).filter(f => /^\d{14}_.*\.sql$/.test(f) && f > FILE);
    for (const file of later) {
      const text = stripComments(fs.readFileSync(path.join(DIR, file), 'utf-8'));
      for (const st of text.split(';')) {
        const m = st.match(/CREATE POLICY\s+"?\w+"?\s+ON (?:public\.)?"?(\w+)"?/i);
        if (!m || !rules.has(m[1]) || /FOR SELECT/i.test(st)) continue;
        expect(st, `${file}: write policy on ${m[1]} without current_user_can()`).toContain('current_user_can(');
      }
    }
  });
});
