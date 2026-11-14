/**
 * Guards audit finding DATA-08.
 *
 * Production had two CHECK constraints on patients.pac_status. The older,
 * auto-named one (patients_pac_status_check) did not allow 'PAC Review', so
 * every save with that status was rejected by the database although the app
 * offers it. CI has no database, so this checks the two things that must stay
 * true: the app's statuses match what the remaining constraint allows, and the
 * stale constraint is dropped and never re-added by a migration.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { PacStatus } from '../types';
import { migrationFiles, migrationPath } from './helpers/migrations';

// Mirrors production's chk_pac_status CHECK constraint exactly.
const DB_ALLOWED_PAC_STATUS = ['PAC Fit', 'PAC Pending', 'PAC Unfit', 'PAC Review'];

const migrations = migrationFiles()
  .map(f => ({ file: f, sql: fs.readFileSync(migrationPath(f), 'utf-8').replace(/--.*$/gm, '') }));

describe('patients.pac_status: app values vs database rules', () => {
  it('every PAC status the app can save is accepted by the database', () => {
    expect(Object.values(PacStatus).sort()).toEqual([...DB_ALLOWED_PAC_STATUS].sort());
  });

  it('the stale duplicate constraint is dropped by a migration', () => {
    const dropped = migrations.some(m => /DROP CONSTRAINT IF EXISTS patients_pac_status_check/i.test(m.sql));
    expect(dropped).toBe(true);
  });

  it('no migration adds a pac_status rule that leaves out a status the app uses', () => {
    const offenders: string[] = [];
    for (const { file, sql } of migrations) {
      const adds = sql.match(/ADD\s+CONSTRAINT\s+\w*pac_status\w*\s+CHECK\s*\(([\s\S]*?)\)\s*[,;]/gi) ?? [];
      for (const add of adds) {
        const missing = Object.values(PacStatus).filter(v => !add.includes(`'${v}'`));
        if (missing.length) offenders.push(`${file}: missing ${missing.join(', ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
