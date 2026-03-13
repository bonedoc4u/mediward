/**
 * intakeOutputService.ts
 * CRUD for the intake_output table.
 */

import { supabase } from '../lib/supabase';
import { IntakeOutputEntry, IOType } from '../types';

function rowToEntry(row: Record<string, unknown>): IntakeOutputEntry {
  return {
    id:           String(row.id),
    patientIpNo:  String(row.patient_ip_no),
    recordedAt:   String(row.recorded_at),
    recordedBy:   row.recorded_by ? String(row.recorded_by) : undefined,
    type:         String(row.type) as IOType,
    category:     String(row.category),
    amountMl:     Number(row.amount_ml),
    notes:        row.notes ? String(row.notes) : undefined,
    createdAt:    String(row.created_at),
  };
}

export async function fetchIntakeOutput(patientIpNo: string): Promise<IntakeOutputEntry[]> {
  const { data, error } = await supabase
    .from('intake_output')
    .select('*')
    .eq('patient_ip_no', patientIpNo)
    .order('recorded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToEntry);
}

export async function addIntakeOutputEntry(
  patientIpNo: string,
  entry: Omit<IntakeOutputEntry, 'id' | 'patientIpNo' | 'createdAt'>,
): Promise<IntakeOutputEntry> {
  const { data, error } = await supabase
    .from('intake_output')
    .insert({
      patient_ip_no: patientIpNo,
      recorded_at:   entry.recordedAt,
      recorded_by:   entry.recordedBy ?? null,
      type:          entry.type,
      category:      entry.category,
      amount_ml:     entry.amountMl,
      notes:         entry.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToEntry(data as Record<string, unknown>);
}

export async function deleteIntakeOutputEntry(id: string): Promise<void> {
  const { error } = await supabase.from('intake_output').delete().eq('id', id);
  if (error) throw error;
}
