/**
 * Guards the role rules on the patients table (audit 2026-11-12, SEC-06 step 2).
 *
 * Before: every rule on `patients` checked the hospital only, so a view-only
 * login could discharge, remove or hard-delete a patient through the API.
 *
 * CI has no database, so this reads the migration files and checks two things:
 *  1. the database's role table (role_has_permission) says exactly what the
 *     app's role table (utils/permissions.ts) says — for every role and every
 *     permission. Change one without the other and this fails.
 *  2. the patients table keeps its trigger and its role-checking policies.
 * The live check is scripts/check-patient-role-rules.mjs (dev project only).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { ROLE_PERMISSIONS, ORDER_COLUMNS, type Permission } from '../utils/permissions';
import type { UserRole } from '../types';
import { migrationFiles, migrationPath } from './helpers/migrations';

const files = migrationFiles();
const stripComments = (sql: string) => sql.replace(/--.*$/gm, '');
const allSql = files.map(f => stripComments(fs.readFileSync(migrationPath(f), 'utf-8')));

/** Body of the LAST definition of a function across all migrations (later ones replace earlier ones). */
function lastFunctionBody(name: string): string {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([^)]*\\)[\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$`, 'gi');
  let body = '';
  for (const sql of allSql) for (const m of sql.matchAll(re)) body = m[1];
  return body;
}

/** Final policies on `patients` after replaying every migration in order. */
function finalPatientPolicies(): Map<string, string> {
  const policies = new Map<string, string>();
  for (const sql of allSql) {
    for (const st of sql.split(';').map(s => s.trim()).filter(Boolean)) {
      const drop = st.match(/^DROP POLICY (?:IF EXISTS )?"?(\w+)"?\s+ON (?:public\.)?"?patients"?$/i);
      if (drop) { policies.delete(drop[1]); continue; }
      const create = st.match(/^CREATE POLICY "?(\w+)"?\s+ON (?:public\.)?"?patients"?\s/i);
      if (create) policies.set(create[1], st.replace(/\s+/g, ' '));
    }
  }
  return policies;
}

const ROLES = Object.keys(ROLE_PERMISSIONS) as UserRole[];
const APP_PERMISSIONS = [...new Set(ROLES.flatMap(r => ROLE_PERMISSIONS[r]))].sort() as Permission[];

/** permission → roles, parsed from the database's role table. */
function databaseRoleTable(): Map<string, string[]> {
  const table = new Map<string, string[]>();
  const body = lastFunctionBody('role_has_permission');
  for (const m of body.matchAll(/WHEN '([^']+)'\s+THEN p_role IN \(([^)]*)\)/g)) {
    table.set(m[1], [...m[2].matchAll(/'([^']+)'/g)].map(r => r[1]).sort());
  }
  return table;
}

describe('database role table = app role table', () => {
  const db = databaseRoleTable();

  it('the database knows every permission the app has, and no others', () => {
    expect([...db.keys()].sort()).toEqual(APP_PERMISSIONS);
  });

  it.each(APP_PERMISSIONS)('%s: same roles in the database as in the app', (permission) => {
    const appRoles = ROLES.filter(r => ROLE_PERMISSIONS[r].includes(permission)).sort();
    expect(db.get(permission)).toEqual(appRoles);
  });

  it('an unknown role or permission gets nothing', () => {
    expect(lastFunctionBody('role_has_permission')).toMatch(/COALESCE\(CASE p_permission[\s\S]*END, false\)/);
  });

  it('current_user_can() reads the role of the signed-in user only', () => {
    expect(lastFunctionBody('current_user_can').replace(/\s+/g, ' '))
      .toContain('SELECT role FROM public.app_users WHERE id = auth.uid()');
  });
});

describe('patients trigger', () => {
  const body = lastFunctionBody('enforce_patient_role_rules');
  const joined = allSql.join('\n');

  it('runs before every insert and update of a patient', () => {
    expect(joined).toMatch(
      /CREATE TRIGGER "a_patients_role_rules"\s+BEFORE INSERT OR UPDATE ON public\.patients\s+FOR EACH ROW EXECUTE FUNCTION public\.enforce_patient_role_rules\(\)/);
  });

  // BEFORE triggers run in name order. patients_auto_hospital_id fills in
  // defaults; if it ran first, its change would be blamed on the user.
  it('is named so that it runs before the triggers that fill in defaults', () => {
    expect('a_patients_role_rules' < 'patients_auto_hospital_id').toBe(true);
  });

  it.each(['patient:add', 'patient:edit', 'patient:discharge', 'patient:delete', 'rounds:write'])(
    'checks %s', (permission) => {
      expect(body).toContain(`current_user_can('${permission}')`);
    });

  it('every refusal starts with ROLE_FORBIDDEN (the app keys on that text)', () => {
    const raises = [...body.matchAll(/RAISE EXCEPTION '([^']*(?:''[^']*)*)'/g)].map(m => m[1]);
    expect(raises.length).toBeGreaterThanOrEqual(6);
    raises.forEach(text => expect(text.startsWith('ROLE_FORBIDDEN: ')).toBe(true));
  });

  it('the columns an orders-only role may change are the app\'s ORDER_COLUMNS', () => {
    const m = body.match(/c_order_columns constant text\[\] := ARRAY\[([^\]]*)\]/);
    const columns = [...(m?.[1] ?? '').matchAll(/'([^']+)'/g)].map(r => r[1]);
    expect(columns).toEqual([...ORDER_COLUMNS]);
  });

  it('compares the whole row, so a column added later is locked by default', () => {
    expect(body).toMatch(/to_jsonb\(NEW\) - c_bookkeeping - c_order_columns/);
    expect(body).toMatch(/to_jsonb\(OLD\) - c_bookkeeping - c_order_columns/);
  });

  it('watches discharge and removal', () => {
    expect(body).toMatch(/NEW\.patient_status IS DISTINCT FROM OLD\.patient_status/);
    expect(body).toMatch(/NEW\.deleted_at IS DISTINCT FROM OLD\.deleted_at/);
  });
});

describe('patients policies in migrations', () => {
  const policies = finalPatientPolicies();
  const command = (sql: string) => sql.match(/FOR (SELECT|INSERT|UPDATE|DELETE|ALL)/i)?.[1].toUpperCase() ?? 'ALL';

  it('the hospital-only insert, delete and catch-all policies are gone', () => {
    expect(policies.has('patients_tenant_insert')).toBe(false);
    expect(policies.has('patients_tenant_delete')).toBe(false);
    expect(policies.has('patients_hospital_scope')).toBe(false);
  });

  it('has exactly one policy each for read, insert, update and delete', () => {
    expect([...policies.values()].map(command).sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
  });

  it('insert needs the hospital and patient:add', () => {
    const sql = [...policies.values()].find(p => command(p) === 'INSERT') ?? '';
    expect(sql).toContain('hospital_id = public.get_my_hospital_id()');
    expect(sql).toContain("AND public.current_user_can('patient:add')");
  });

  it('hard delete needs the hospital and patient:delete', () => {
    const sql = [...policies.values()].find(p => command(p) === 'DELETE') ?? '';
    expect(sql).toContain('hospital_id = public.get_my_hospital_id()');
    expect(sql).toContain("AND public.current_user_can('patient:delete')");
  });

  it('every policy is tenant-scoped', () => {
    for (const sql of policies.values()) expect(sql).toContain('hospital_id = public.get_my_hospital_id()');
  });
});
