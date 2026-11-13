/**
 * Guards the app_users access rules (audit 2026-11-12, SEC-01).
 *
 * The old policy "app_users_auth_write" let every signed-in user write any
 * app_users row of their hospital — including their own `role`. One request
 * made a resident a super-admin with access to every hospital.
 *
 * CI has no database, so this reads the migration files: the blanket policy
 * must stay dropped, and every write policy on app_users must check the
 * caller's role and refuse to write a 'superadmin' row. The live check is
 * scripts/check-app-users-rls.mjs (dev project only).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const files = fs.readdirSync(DIR).filter(f => /^\d{14}_.*\.sql$/.test(f)).sort();
const stripComments = (sql: string) => sql.replace(/--.*$/gm, '');

/** Final state of app_users policies after replaying every migration in order. */
function finalAppUsersPolicies(): Map<string, string> {
  const policies = new Map<string, string>();
  for (const file of files) {
    const sql = stripComments(fs.readFileSync(path.join(DIR, file), 'utf-8'));
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const st of statements) {
      const drop = st.match(/^DROP POLICY (?:IF EXISTS )?"?(\w+)"?\s+ON (?:public\.)?"?app_users"?/i);
      if (drop) { policies.delete(drop[1]); continue; }
      const create = st.match(/^CREATE POLICY "?(\w+)"?\s+ON (?:public\.)?"?app_users"?/i);
      if (create) policies.set(create[1], st.replace(/\s+/g, ' '));
    }
  }
  return policies;
}

describe('app_users access rules in migrations', () => {
  const policies = finalAppUsersPolicies();
  const writePolicies = [...policies.entries()].filter(([, sql]) => !/FOR SELECT/i.test(sql));

  it('the blanket write policy is gone', () => {
    expect(policies.has('app_users_auth_write')).toBe(false);
  });

  it('has separate insert, update and delete policies', () => {
    const commands = writePolicies.map(([, sql]) => sql.match(/FOR (INSERT|UPDATE|DELETE|ALL)/i)?.[1].toUpperCase());
    expect(commands.sort()).toEqual(['DELETE', 'INSERT', 'UPDATE']);
  });

  it.each(writePolicies)('%s requires an admin and never accepts a superadmin row', (_name, sql) => {
    expect(sql).toMatch(/is_admin\(\)/);
    expect(sql).toMatch(/hospital_id = public\.get_my_hospital_id\(\)/);
    expect(sql).toMatch(/role <> 'superadmin'/);
  });

  it('no write policy is open to every role in the hospital', () => {
    for (const [, sql] of writePolicies) {
      // Every OR-branch that is not the superadmin escape hatch must mention is_admin().
      const withoutSuper = sql.replace(/public\.is_superadmin\(\)\s+OR/gi, '');
      expect(withoutSuper).not.toMatch(/(USING|CHECK)\s*\(\s*\(?\s*hospital_id = public\.get_my_hospital_id\(\)\s*\)?\s*\)/i);
    }
  });
});
