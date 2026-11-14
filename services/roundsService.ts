/**
 * roundsService.ts
 * CRUD for the normalized `rounds` table.
 * One row per patient per calendar day — upsert on (patient_ip_no, date).
 */

import { supabase } from '../lib/supabase';
import { DailyRound, ToDoItem } from '../types';

/** The row sent to the `rounds` table for one save. Also the offline-queue payload. */
export interface RoundRowWrite {
  patient_ip_no: string;
  hospital_id: string | null;
  date: string;
  note: string;
  todos: ToDoItem[];
  round_note?: string;
  /**
   * Queue-only, never a column: the round_note_at the writer started from.
   * Present only together with round_note. Lets a note that is sent later
   * still be checked against what a colleague wrote in the meantime.
   */
  base_note_at?: string | null;
}

/**
 * Build the row for a save. `round_note` is included ONLY when the caller
 * set `roundNote`: an upsert changes just the columns it sends, so a save
 * that is only about orders (Daily Rounds, an older queued change) leaves
 * the doctor's note untouched. Author and time are never sent — the database
 * stamps them (trigger stamp_round_note).
 */
export function roundToRow(
  patientIpNo: string, hospitalId: string | undefined, round: DailyRound, baseNoteAt?: string | null,
): RoundRowWrite {
  const row: RoundRowWrite = {
    patient_ip_no: patientIpNo,
    hospital_id:   hospitalId ?? null,
    date:          round.date,
    note:          round.note,
    todos:         round.todos,
  };
  if (round.roundNote !== undefined) {
    row.round_note = round.roundNote;
    if (baseNoteAt !== undefined) row.base_note_at = baseNoteAt;
  }
  return row;
}

/** Strip queue-only keys: what is left are real columns of `rounds`. */
export function toColumns(row: RoundRowWrite): Omit<RoundRowWrite, 'base_note_at'> {
  const { base_note_at: _queueOnly, ...columns } = row;
  return columns;
}

/** What the database recorded about the note after a save. */
export interface RoundNoteStamp {
  roundNote: string;
  roundNoteBy?: string;
  roundNoteAt?: string;
}

/**
 * Insert or update one day's round for a patient.
 * Uses (patient_ip_no, date) as the conflict key — safe to call repeatedly.
 * Last-write-wins. Throws when the server did not accept the write — it does
 * NOT queue the round for retry itself (PatientContext.saveRound does).
 * Resolves with the note as stored, including the server-stamped author/time.
 */
export async function upsertRound(
  patientIpNo: string,
  hospitalId: string | undefined,
  round: DailyRound,
): Promise<RoundNoteStamp> {
  const { data, error } = await supabase
    .from('rounds')
    .upsert(toColumns(roundToRow(patientIpNo, hospitalId, round)), { onConflict: 'patient_ip_no,date' })
    .select('round_note, round_note_by_name, round_note_at')
    .single();
  if (error) throw new Error(`upsertRound(${patientIpNo}): ${error.message}`);
  const row = (data ?? {}) as { round_note?: string | null; round_note_by_name?: string | null; round_note_at?: string | null };
  return {
    roundNote:   row.round_note ?? '',
    roundNoteBy: row.round_note_by_name ?? undefined,
    roundNoteAt: row.round_note_at ?? undefined,
  };
}

/** Result of a checked save: stored, or refused because someone else changed the note first. */
export type RoundSaveOutcome =
  | { status: 'saved'; stamp: RoundNoteStamp }
  | { status: 'conflict'; server: RoundNoteStamp };

interface SaveRoundRpcRow {
  conflict: boolean;
  server_note: string | null;
  server_note_by: string | null;
  server_note_at: string | null;
}

/** PostgREST's "no such function" — the save_round migration is not applied yet. */
function isMissingFunction(error: { code?: string; message: string }): boolean {
  return error.code === 'PGRST202' || /could not find the function/i.test(error.message);
}

/**
 * Save a round through the database function save_round(), which refuses to
 * overwrite a note that someone else changed after `baseNoteAt` (the
 * round_note_at this writer last saw; null = there was no note). Changes to
 * orders by others are not a conflict.
 *
 * Throws when the server could not be reached or refused the write — the
 * caller queues it. If the function does not exist yet on this database the
 * save falls back to upsertRound() (last write wins), so deploying the app
 * before the migration cannot break saving.
 */
export async function saveRoundChecked(
  patientIpNo: string,
  hospitalId: string | undefined,
  round: DailyRound,
  baseNoteAt: string | null = null,
): Promise<RoundSaveOutcome> {
  const { data, error } = await supabase.rpc('save_round', {
    p_patient_ip_no: patientIpNo,
    p_date:          round.date,
    p_note:          round.note,
    p_todos:         round.todos,
    p_round_note:    round.roundNote ?? null,
    p_base_note_at:  round.roundNote === undefined ? null : baseNoteAt,
  });

  if (error) {
    if (isMissingFunction(error)) {
      return { status: 'saved', stamp: await upsertRound(patientIpNo, hospitalId, round) };
    }
    throw new Error(`saveRound(${patientIpNo}): ${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as SaveRoundRpcRow | null;
  if (!row) throw new Error(`saveRound(${patientIpNo}): the server returned no result`);
  const stamp: RoundNoteStamp = {
    roundNote:   row.server_note ?? '',
    roundNoteBy: row.server_note_by ?? undefined,
    roundNoteAt: row.server_note_at ?? undefined,
  };
  return row.conflict ? { status: 'conflict', server: stamp } : { status: 'saved', stamp };
}
