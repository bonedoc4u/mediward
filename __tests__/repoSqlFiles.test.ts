/**
 * Stray SQL files (SEC-03, 14 Nov 2026): thirteen old .sql files sat at the
 * repo root, one with an admin rule that skips the hospital check. Only
 * supabase/migrations/ holds SQL that may be applied, and only files the
 * Supabase CLI recognises as migrations.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

describe('SQL files in the repo', () => {
  it('none sit at the repo root', () => {
    expect(fs.readdirSync(ROOT).filter(f => f.endsWith('.sql'))).toEqual([]);
  });

  it('supabase/migrations/ holds only timestamped migration files', () => {
    const dir = path.join(ROOT, 'supabase', 'migrations');
    const odd = fs.readdirSync(dir).filter(f => !/^\d{14}_[a-z0-9_]+\.sql$/.test(f));
    expect(odd).toEqual([]);
  });
});
