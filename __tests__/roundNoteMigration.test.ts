/**
 * Keeps the round-note migration honest (CI has no database).
 * The live behaviour was checked on the dev project: a client that sends its
 * own round_note_by_name / round_note_at gets them overwritten by the trigger.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { ROUND_NOTE_MAX_LENGTH } from '../src/features/rounds/roundNotes';
import { migrationFiles, migrationPath } from './helpers/migrations';

const sql = migrationFiles()
  .map(f => fs.readFileSync(migrationPath(f), 'utf-8').replace(/--.*$/gm, '')).join('\n');

describe('rounds.round_note migration', () => {
  it('adds the note and its author/time columns', () => {
    for (const col of ['round_note', 'round_note_by', 'round_note_by_name', 'round_note_at']) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\s`));
    }
  });

  it('stamps author and time in the database, from the session', () => {
    expect(sql).toMatch(/CREATE TRIGGER t_rounds_stamp_round_note\s+BEFORE INSERT OR UPDATE ON public\.rounds/);
    expect(sql).toMatch(/NEW\.round_note_by\s*:=\s*auth\.uid\(\)/);
    expect(sql).toMatch(/NEW\.round_note_at\s*:=\s*now\(\)/);
  });

  it('the length limit in the database matches the limit in the app', () => {
    const limit = sql.match(/chk_round_note_len CHECK \(char_length\(round_note\) <= (\d+)\)/)?.[1];
    expect(Number(limit)).toBe(ROUND_NOTE_MAX_LENGTH);
  });
});

describe('save_round() migration', () => {
  it('runs with the caller\'s own access rules, not elevated ones', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.save_round\([\s\S]*?LANGUAGE plpgsql SECURITY INVOKER/);
  });

  it('refuses a stale note write instead of overwriting', () => {
    expect(sql).toMatch(/v_row\.round_note_at IS DISTINCT FROM p_base_note_at/);
    expect(sql).toMatch(/RETURN QUERY SELECT true, v_row\.round_note/);
  });

  it('is not callable while signed out', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.save_round\([^)]*\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.save_round\([^)]*\) TO authenticated/);
  });
});
