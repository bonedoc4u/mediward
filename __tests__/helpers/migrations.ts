/**
 * Where the SQL migrations live, for tests that read them.
 *
 * Since the production baseline (14 Nov 2026) the older files sit in
 * supabase/migrations_archive/ (history only, never applied) and
 * supabase/migrations/ holds the baseline plus everything after it.
 * Tests that check what a change did read both folders, in date order.
 */
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(__dirname, '..', '..');
export const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
export const ARCHIVE_DIR = path.join(ROOT, 'supabase', 'migrations_archive');
export const BASELINE_FILE = '20261115000000_baseline_production.sql';

const MIGRATION_NAME = /^\d{14}_.*\.sql$/;

const list = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => MIGRATION_NAME.test(f)) : [];

/** Every migration file name, archived and active, oldest first. */
export function migrationFiles(): string[] {
  return [...list(ARCHIVE_DIR), ...list(MIGRATIONS_DIR)].sort();
}

/** Active migrations only (the baseline and later): what the CLI applies. */
export function activeMigrationFiles(): string[] {
  return list(MIGRATIONS_DIR).sort();
}

/** Full path of a migration, whichever folder it is in. */
export function migrationPath(file: string): string {
  const active = path.join(MIGRATIONS_DIR, file);
  return fs.existsSync(active) ? active : path.join(ARCHIVE_DIR, file);
}

export function readMigration(file: string): string {
  return fs.readFileSync(migrationPath(file), 'utf-8');
}

/**
 * Migrations dated after `file`, leaving out the baseline: the baseline only
 * restates production as it was, so it is not a later change to `file`.
 */
export function migrationsAfter(file: string): string[] {
  return migrationFiles().filter(f => f > file && f !== BASELINE_FILE);
}
