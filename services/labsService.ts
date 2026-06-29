import { supabase } from '../lib/supabase';
import { LabResult } from '../types';

/** Insert a new lab result row into the normalized labs table.
 *  Uses upsert with ignoreDuplicates so replaying an offline-queue item is idempotent. */
export async function insertLab(patientIpNo: string, result: LabResult, hospitalId?: string): Promise<void> {
  if (!hospitalId) throw new Error('insertLab: hospitalId is required');
  const { error } = await supabase.from('labs').upsert({
    id:            result.id,
    patient_ip_no: patientIpNo,
    date:          result.date,
    type:          result.type,
    value:         result.value,
    hospital_id:   hospitalId,
  }, { ignoreDuplicates: true });
  if (error) throw new Error(`insertLab: ${error.message}`);
}

/** Delete a lab result row by its UUID. */
export async function deleteLab(labId: string): Promise<void> {
  const { error } = await supabase.from('labs').delete().eq('id', labId);
  if (error) throw new Error(`deleteLab: ${error.message}`);
}
