import { supabase } from '../lib/supabase';
import { NursingNote, NursingShift } from '../types';

export async function fetchNursingNotes(patientIpNo: string): Promise<NursingNote[]> {
  const { data } = await supabase
    .from('nursing_notes')
    .select('*')
    .eq('patient_ip_no', patientIpNo)
    .order('created_at', { ascending: false })
    .limit(30);
  if (!data) return [];
  return data.map(r => ({
    id: r.id, hospitalId: r.hospital_id, patientIpNo: r.patient_ip_no,
    shift: r.shift as NursingShift, note: r.note, createdAt: r.created_at,
    createdBy: r.created_by ?? undefined,
  }));
}

export async function addNursingNote(note: Omit<NursingNote, 'id' | 'createdAt'>): Promise<void> {
  await supabase.from('nursing_notes').insert({
    hospital_id: note.hospitalId,
    patient_ip_no: note.patientIpNo,
    shift: note.shift,
    note: note.note,
    created_by: note.createdBy ?? null,
  });
}
