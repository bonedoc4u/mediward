/**
 * Keeps the round-note migration honest (CI has no database).
 * The live behaviour was checked on the dev project: a client that sends its
 * own round_note_by_name / round_note_at gets them overwritten by the trigger.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ROUND_NOTE_MAX_LENGTH } from '../src/features/rounds/roundNotes';

const DIR = path.join(__dirname, '..', 'supabase', 'migrations');
const sql = fs.readdirSync(DIR).filter(f => /^\d{14}_.*\.sql$/.test(f)).sort()
  .map(f => fs.readFileSync(path.join(DIR, f), 'utf-8').replace(/--.*$/gm, '')).join('\n');

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
