/**
 * Regression test for a real bug: a SQL migration called
 * insert_audit_event() with the string 'RENAME_IP_NO', which isn't in
 * audit_log's chk_audit_action CHECK constraint. insert_audit_event
 * swallows ALL exceptions (EXCEPTION WHEN OTHERS THEN NULL), so the
 * invalid action caused every call to silently log nothing — no error,
 * no audit row, no visible sign anything was wrong.
 *
 * A migration's SQL string bypasses AuditEntry['action']'s compile-time
 * check entirely (that union only guards client-side logAuditEvent()
 * calls), so this is the only guard against the same mistake recurring.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mirrors audit_log's chk_audit_action CHECK constraint exactly.
const VALID_AUDIT_ACTIONS = new Set(['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'VIEW', 'EXPORT']);

// Applied migrations must stay immutable (their file must match what
// actually ran, so replay history is trustworthy) — so a historical bug
// already fixed by a LATER migration is intentionally left in place here
// rather than rewritten. Each entry below must have a corresponding later
// migration that fixes the same function; do not add to this list without
// confirming that fix exists and is applied live.
const KNOWN_HISTORICAL_BUGS: Record<string, string> = {
  // Fixed by 20260728161758_fix_rename_patient_ip_no_audit_action_and_version_return.sql
  '20260728122118_safe_patient_ip_no_rename.sql': 'RENAME_IP_NO',
};

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

describe('audit actions referenced in SQL migrations', () => {
  it('every insert_audit_event(...) call uses a value chk_audit_action allows (or is a documented, already-superseded historical bug)', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      // Matches insert_audit_event('ACTION', ...) — the action is always the first arg.
      const matches = sql.matchAll(/insert_audit_event\(\s*'([^']+)'/g);
      for (const m of matches) {
        const action = m[1];
        if (VALID_AUDIT_ACTIONS.has(action)) continue;
        if (KNOWN_HISTORICAL_BUGS[file] === action) continue;
        offenders.push(`${file}: '${action}'`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
