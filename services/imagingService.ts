import { supabase } from '../lib/supabase';
import { Investigation } from '../types';

/** Insert a new imaging row into the normalized imaging table. */
export async function insertImaging(patientIpNo: string, inv: Investigation, hospitalId?: string): Promise<void> {
  const { error } = await supabase.from('imaging').insert({
    id:            inv.id,
    patient_ip_no: patientIpNo,
    date:          inv.date,
    type:          inv.type,
    findings:      inv.findings,
    image_url:     inv.imageUrl || null,
    ...(inv.phase  ? { phase: inv.phase }        : {}),
    ...(hospitalId ? { hospital_id: hospitalId } : {}),
  });
  if (error) throw new Error(`insertImaging: ${error.message}`);
}

/** Delete an imaging row by its UUID. */
export async function deleteImaging(imagingId: string): Promise<void> {
  const { error } = await supabase.from('imaging').delete().eq('id', imagingId);
  if (error) throw new Error(`deleteImaging: ${error.message}`);
}
