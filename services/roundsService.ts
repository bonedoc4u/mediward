/**
 * roundsService.ts
 * CRUD for the normalized `rounds` table.
 * One row per patient per calendar day — upsert on (patient_ip_no, date).
 */

import { supabase } from '../lib/supabase';
import { DailyRound, ToDoItem } from '../types';

interface RoundRow {
  id: string;
  patient_ip_no: string;
  date: string;        // 'YYYY-MM-DD'
  note: string;
  todos: ToDoItem[];
  created_at: string;
  updated_at: string;
}

function rowToRound(r: RoundRow): DailyRound {
  return {
    date:  r.date,
    note:  r.note,
    todos: Array.isArray(r.todos) ? r.todos : [],
  };
}

/** Fetch all rounds for a patient, newest-first (max 90 entries). */
export async function fetchRounds(patientIpNo: string): Promise<DailyRound[]> {
  const { data, error } = await supabase
    .from('rounds')
    .select('id, date, note, todos')
    .eq('patient_ip_no', patientIpNo)
    .order('date', { ascending: false })
    .limit(90);
  if (error) throw new Error(`fetchRounds(${patientIpNo}): ${error.message}`);
  return ((data ?? []) as unknown as RoundRow[]).map(rowToRound);
}

/**
 * Insert or update today's round note for a patient.
 * Uses (patient_ip_no, date) as the conflict key — safe to call repeatedly.
 */
export async function upsertRound(
  patientIpNo: string,
  hospitalId: string | undefined,
  round: DailyRound,
): Promise<void> {
  const { error } = await supabase
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
    );
  if (error) throw new Error(`upsertRound(${patientIpNo}): ${error.message}`);
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
