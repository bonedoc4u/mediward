/**
 * Guards audit finding DATA-09.
 *
 * Production's rounds table has a BEFORE UPDATE trigger that sets
 * NEW.updated_at, but the table had no updated_at column, so every UPDATE was
 * rejected (42703) and a round could be saved only once per patient per day.
 *
 * CI has no database. This keeps the fixing migration in place; the live
 * check is scripts/check-rounds-save-twice.mjs (dev project only).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { migrationFiles, migrationPath } from './helpers/migrations';

const sql = migrationFiles()
  .map(f => fs.readFileSync(migrationPath(f), 'utf-8').replace(/--.*$/gm, '')).join('\n');

describe('rounds.updated_at', () => {
  it('a migration adds the column that the rounds_updated_at trigger writes to', () => {
    expect(sql).toMatch(/ALTER TABLE public\.rounds\s+ADD COLUMN IF NOT EXISTS updated_at\s+timestamptz/i);
  });

  it('no migration drops it again', () => {
    expect(sql).not.toMatch(/ALTER TABLE public\.rounds[\s\S]{0,80}DROP COLUMN (IF EXISTS )?updated_at/i);
  });
});
