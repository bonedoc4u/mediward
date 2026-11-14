/**
 * Guards the role rules on the settings tables (audit 2026-11-12, SEC-06 step 4).
 *
 * Before: any signed-in user of a hospital could rename it, switch modules
 * off, change the vital-sign alert thresholds, and add or delete wards and
 * unit chiefs through the API. On hospital_config a catch-all policy sat next
 * to the admin-only ones and cancelled them.
 *
 * CI has no database, so this reads the migration file. The live check is
 * scripts/check-settings-role-rules.mjs (dev project only).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { ROLE_PERMISSIONS, type Permission } from '../utils/permissions';
import type { UserRole } from '../types';
import { migrationPath } from './helpers/migrations';

const FILE = '20261114150000_settings_tables_role_rules.sql';
const stripComments = (text: string) => text.replace(/--.*$/gm, '');
const sql = stripComments(fs.readFileSync(migrationPath(FILE), 'utf-8'));

interface Rule { permission: string; updateAlso: string | null }
/** table → rule, from the VALUES list in the migration. */
const rules = new Map<string, Rule>(
  [...sql.matchAll(/\('(\w+)',\s+c_\w+,\s+c_\w+,\s+'([a-z]+:[a-z]+)',\s+(NULL|'[a-z]+:[a-z]+')\)/g)]
    .map(m => [m[1], { permission: m[2], updateAlso: m[3] === 'NULL' ? null : m[3].slice(1, -1) }]),
);

const rolesWith = (permission: string) =>
  (Object.keys(ROLE_PERMISSIONS) as UserRole[]).filter(r => ROLE_PERMISSIONS[r].includes(permission as Permission)).sort();

describe('settings tables: who may write', () => {
  it('covers hospital settings, wards and unit chiefs', () => {
    expect([...rules.keys()].sort()).toEqual(['hospital_config', 'unit_chiefs', 'ward_config']);
  });

  it.each([...rules])('%s: every write needs the admin permission', (_table, rule) => {
    expect(rule.permission).toBe('team:manage');
  });

  it('the admin permission means admin and superadmin, nobody else', () => {
    expect(rolesWith('team:manage')).toEqual(['admin', 'superadmin']);
  });

  // Decided with the department on 14 Nov 2026: the Add patient form edits the
  // shared comorbidity preset list, so whoever may add patients may change it.
  it('only hospital_config has an exception, and it is for roles that may add patients', () => {
    expect(rules.get('hospital_config')?.updateAlso).toBe('patient:add');
    expect(rules.get('ward_config')?.updateAlso).toBeNull();
    expect(rules.get('unit_chiefs')?.updateAlso).toBeNull();
  });

  it('an attending gets no write on any settings table', () => {
    for (const rule of rules.values()) {
      expect(ROLE_PERMISSIONS.attending).not.toContain(rule.permission);
      if (rule.updateAlso) expect(ROLE_PERMISSIONS.attending).not.toContain(rule.updateAlso);
    }
  });
});

describe('hospital_config: what a non-admin may change', () => {
  const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.enforce_hospital_config_role_rules\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$/)?.[1] ?? '';

  it('an admin passes; anyone else needs patient:add', () => {
    expect(fn).toMatch(/IF auth\.uid\(\) IS NULL OR public\.current_user_can\('team:manage'\) THEN\s+RETURN NEW;/);
    expect(fn).toMatch(/IF NOT public\.current_user_can\('patient:add'\) THEN\s+RAISE EXCEPTION 'ROLE_FORBIDDEN: /);
  });

  it('the only column a non-admin may change is the comorbidity preset list', () => {
    const shared = fn.match(/c_shared_columns constant text\[\] := ARRAY\[([^\]]*)\]/)?.[1] ?? '';
    expect([...shared.matchAll(/'([^']+)'/g)].map(m => m[1])).toEqual(['comorbidity_map']);
  });

  it('compares the whole row, so a setting added later is locked by default', () => {
    expect(fn).toMatch(/to_jsonb\(NEW\) - c_bookkeeping - c_shared_columns/);
    expect(fn).toMatch(/to_jsonb\(OLD\) - c_bookkeeping - c_shared_columns/);
  });

  it('every refusal starts with ROLE_FORBIDDEN (the app keys on that text)', () => {
    const raises = [...fn.matchAll(/RAISE EXCEPTION '([^']*(?:''[^']*)*)'/g)].map(m => m[1]);
    expect(raises).toHaveLength(2);
    raises.forEach(text => expect(text.startsWith('ROLE_FORBIDDEN: ')).toBe(true));
  });

  it('runs before every update of a settings row', () => {
    expect(sql).toMatch(/CREATE TRIGGER a_hospital_config_role_rules\s+BEFORE UPDATE ON public\.hospital_config\s+FOR EACH ROW EXECUTE FUNCTION public\.enforce_hospital_config_role_rules\(\)/);
  });
});

describe('settings tables: policies and statement triggers', () => {
  it('every old policy is dropped first, whatever its name (the catch-all cancelled the admin check)', () => {
    expect(sql).toMatch(/FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = r\.tbl LOOP\s+EXECUTE format\('DROP POLICY %I ON public\.%I', p\.policyname, r\.tbl\);/);
  });

  it('policies are for signed-in users only', () => {
    const creates = [...sql.matchAll(/CREATE POLICY %I ON public\.%I FOR (\w+) (TO \w+)?/g)];
    expect(creates.map(m => m[1]).sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    creates.forEach(m => expect(m[2]).toBe('TO authenticated'));
  });

  it('insert and delete need the admin permission; update may also take the exception', () => {
    const policy = (command: string) =>
      sql.match(new RegExp(`CREATE POLICY %I ON public\\.%I FOR ${command} TO authenticated[\\s\\S]*?;`))?.[0] ?? '';
    expect(policy('INSERT')).toMatch(/r\.write_tenant, v_can\)/);
    expect(policy('DELETE')).toMatch(/r\.write_tenant, v_can\)/);
    expect(policy('UPDATE')).toMatch(/r\.write_tenant, v_can_update, r\.write_tenant, v_can_update\)/);
    expect(policy('SELECT')).toMatch(/r\.read_tenant\)/);
    expect(policy('SELECT')).not.toContain('v_can');
  });

  it('the exception is added to update only when the table has one', () => {
    expect(sql).toMatch(/v_can_update := CASE WHEN r\.update_also IS NULL THEN v_can/);
  });

  it('statement triggers turn a refusal into an error for insert, delete and update', () => {
    expect(sql).toMatch(/CREATE TRIGGER a_role_check BEFORE INSERT OR DELETE ON public\.%I '\s*\|\| 'FOR EACH STATEMENT EXECUTE FUNCTION public\.enforce_role_permission\(%L\)'/);
    expect(sql).toMatch(/CREATE TRIGGER a_role_check_update BEFORE UPDATE ON public\.%I '\s*\|\| 'FOR EACH STATEMENT EXECUTE FUNCTION public\.enforce_role_permission\(%s\)'/);
  });

  it('both hospital checks are tenant-scoped', () => {
    for (const name of ['c_mine', 'c_super']) {
      const def = sql.match(new RegExp(`${name}\\s+constant text :=([\\s\\S]*?);`))?.[1] ?? '';
      expect(def, name).toContain('hospital_id = public.get_my_hospital_id()');
    }
  });
});
