/**
 * roundsService.ts
 * CRUD for the normalized `rounds` table.
 * One row per patient per calendar day — upsert on (patient_ip_no, date).
 */

import { supabase } from '../lib/supabase';
import { DailyRound, ToDoItem } from '../types';
import { enqueue } from './syncQueue';

interface RoundRow {
  id: string;
  patient_ip_no: string;
  date: string;        // 'YYYY-MM-DD'
  note: string;
  todos: ToDoItem[];
  version: number;
  created_at: string;
  updated_at: string;
}

function rowToRound(r: RoundRow): DailyRound & { version: number } {
  return {
    date:    r.date,
    note:    r.note,
    todos:   Array.isArray(r.todos) ? r.todos : [],
    version: r.version ?? 1,
  };
}

/** Fetch all rounds for a patient, newest-first (max 90 entries). */
export async function fetchRounds(patientIpNo: string): Promise<DailyRound[]> {
  const { data, error } = await supabase
    .from('rounds')
    .select('id, date, note, todos, version')
    .eq('patient_ip_no', patientIpNo)
    .order('date', { ascending: false })
    .limit(90);
  if (error) throw new Error(`fetchRounds(${patientIpNo}): ${error.message}`);
  return ((data ?? []) as unknown as RoundRow[]).map(rowToRound);
}

/** Fetch a single round for conflict resolution. Returns null if not found. */
export async function fetchCurrentRound(
  patientIpNo: string,
  date: string,
): Promise<(DailyRound & { version: number }) | null> {
  const { data, error } = await supabase
    .from('rounds')
    .select('id, date, note, todos, version')
    .eq('patient_ip_no', patientIpNo)
    .eq('date', date)
    .single();
  if (error || !data) return null;
  return rowToRound(data as unknown as RoundRow);
}

/**
 * Insert or update today's round note for a patient.
 * Uses (patient_ip_no, date) as the conflict key — safe to call repeatedly.
 * This is the simple last-write-wins version used by the offline queue replay.
 */
export async function upsertRound(
  patientIpNo: string,
  hospitalId: string | undefined,
  round: DailyRound,
): Promise<void> {
  const payload = {
    patient_ip_no: patientIpNo,
    hospital_id:   hospitalId ?? null,
    date:          round.date,
    note:          round.note,
    todos:         round.todos,
  };
  const { error } = await supabase
    .from('rounds')
    .upsert(payload, { onConflict: 'patient_ip_no,date' });
  if (error) {
    enqueue('upsert_round', payload);
    throw new Error(`upsertRound(${patientIpNo}): ${error.message}`);
  }
}

/**
 * Version-aware round save for concurrent-edit detection.
 *
 * - `currentVersion` undefined → INSERT/upsert (first save for this date).
 * - `currentVersion` defined   → UPDATE WHERE version = currentVersion.
 *   If 0 rows are updated (someone else wrote since our last read),
 *   returns `{ conflict: true }` so the caller can show a diff modal.
 */
export async function upsertRoundVersioned(
  patientIpNo: string,
  hospitalId: string | undefined,
  round: DailyRound,
  currentVersion?: number,
): Promise<{ conflict: false; version: number } | { conflict: true }> {
  if (currentVersion === undefined) {
    // First save — upsert so it's idempotent even if the row already exists.
    const { data, error } = await supabase
      .from('rounds')
      .upsert(
        {
          patient_ip_no: patientIpNo,
          hospital_id:   hospitalId ?? null,
          date:          round.date,
          note:          round.note,
          todos:         round.todos,
        },
        { onConflict: 'patient_ip_no,date' },
      )
      .select('version')
      .single();
    if (error) throw new Error(`upsertRoundVersioned(insert): ${error.message}`);
    return { conflict: false, version: (data as { version: number }).version };
  }

  // Subsequent save — only update if version hasn't changed.
  const { data, error } = await supabase
    .from('rounds')
    .update({ note: round.note, todos: round.todos })
    .eq('patient_ip_no', patientIpNo)
    .eq('date', round.date)
    .eq('version', currentVersion)
    .select('version');

  if (error) throw new Error(`upsertRoundVersioned(update): ${error.message}`);

  if (!data || data.length === 0) {
    // Zero rows matched the version predicate — conflict.
    return { conflict: true };
  }
  return { conflict: false, version: (data[0] as { version: number }).version };
}

/** Update only the todos for an existing round (e.g. check/uncheck a todo). */
export async function updateRoundTodos(
  patientIpNo: string,
  date: string,
  todos: ToDoItem[],
): Promise<void> {
  const { error } = await supabase
    .from('rounds')
    .update({ todos })
    .eq('patient_ip_no', patientIpNo)
    .eq('date', date);
  if (error) throw new Error(`updateRoundTodos(${patientIpNo}): ${error.message}`);
}
