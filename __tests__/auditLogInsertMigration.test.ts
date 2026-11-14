/**
 * The audit log can only be written through insert_audit_event() (audit
 * SEC-05). A rule letting signed-in users insert directly let anyone write
 * entries under a colleague's name. Live proof: scripts/check-audit-log-writes.mjs.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(__dirname, '../supabase/migrations');
const FILE = '20261114200000_audit_log_no_direct_insert.sql';
const strip = (sql: string) => sql.replace(/--.*$/gm, '');

describe('audit_log direct-insert migration', () => {
  const sql = strip(fs.readFileSync(path.join(DIR, FILE), 'utf8'));

  it('drops every insert rule on audit_log, whatever it is called', () => {
    expect(sql).toMatch(/tablename = 'audit_log' AND cmd IN \('INSERT', 'ALL'\)/);
    expect(sql).toMatch(/DROP POLICY %I ON public\.audit_log/);
  });

  it('keeps row-level security on', () => {
    expect(sql).toMatch(/ALTER TABLE public\.audit_log ENABLE ROW LEVEL SECURITY/);
  });

  it('no later migration lets a signed-in user insert into audit_log again', () => {
    const later = fs.readdirSync(DIR).filter(f => f.endsWith('.sql') && f > FILE);
    for (const f of later) {
      const body = strip(fs.readFileSync(path.join(DIR, f), 'utf8'));
      expect(body, f).not.toMatch(/CREATE POLICY[^;]*ON\s+(public\.)?"?audit_log"?[^;]*FOR\s+(INSERT|ALL)/i);
    }
  });
});

describe('app code', () => {
  it('writes the audit log only through insert_audit_event', () => {
    const roots = ['services', 'utils', 'contexts', 'components', 'hooks'].map(d => path.resolve(__dirname, '..', d));
    const files: string[] = [];
    const walk = (d: string) => fs.existsSync(d) && fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
    });
    roots.forEach(walk);
    const direct = files.filter(f => /from\(\s*['"]audit_log['"]\s*\)\s*\.\s*(insert|upsert|update|delete)/.test(
      fs.readFileSync(f, 'utf8').replace(/\s+/g, ' ')));
    expect(direct).toEqual([]);
  });
});
