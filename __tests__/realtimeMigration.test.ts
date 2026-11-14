/**
 * OPS-03: the tables switched on for live updates must be exactly the
 * tables the app listens to, and deletion events must stay off (Supabase
 * cannot apply access rules to them; on dev they leaked other hospitals'
 * IP numbers).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, activeMigrationFiles, readMigration } from './helpers/migrations';

const FILE = '20261115100000_realtime_live_updates.sql';
const sql = readMigration(FILE).replace(/--.*$/gm, '');

const published = (() => {
  const list = sql.match(/live_tables constant text\[\] := ARRAY\[([\s\S]*?)\]/);
  return [...(list?.[1] ?? '').matchAll(/'(\w+)'/g)].map(m => m[1]).sort();
})();

/** Every table named in a postgres_changes subscription in the app. */
const listenedTo = (() => {
  const found = new Set<string>();
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.tsx?$/.test(e.name)) {
        const code = fs.readFileSync(f, 'utf-8');
        for (const m of code.matchAll(/'postgres_changes',\s*\{[^}]*?table:\s*'(\w+)'/g)) found.add(m[1]);
      }
    }
  };
  ['contexts', 'components', 'hooks', 'services', 'src'].forEach(d => walk(path.join(ROOT, d)));
  return [...found].sort();
})();

describe('live updates (supabase_realtime)', () => {
  it('switches on exactly the tables the app listens to', () => {
    expect(listenedTo.length).toBeGreaterThan(0);
    expect(published).toEqual(listenedTo);
  });

  it('turns deletion and truncate events off', () => {
    expect(sql).toMatch(/ALTER PUBLICATION supabase_realtime SET \(publish = 'insert, update'\)/);
  });

  it('is not undone by a later migration', () => {
    for (const f of activeMigrationFiles().filter(m => m > FILE)) {
      const later = readMigration(f).replace(/--.*$/gm, '');
      expect(later, f).not.toMatch(/publish\s*=\s*'[^']*\b(delete|truncate)\b/i);
      expect(later, f).not.toMatch(/ALTER PUBLICATION supabase_realtime\s+SET\s+TABLE/i);
    }
  });
});
