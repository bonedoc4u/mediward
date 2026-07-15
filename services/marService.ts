import { supabase } from '../lib/supabase';
import { PrescribedMedication, MedAdministration, MedAdminStatus } from '../types';

export async function fetchMedications(patientIpNo: string, hospitalId?: string): Promise<PrescribedMedication[]> {
  let q = supabase
    .from('medications_prescribed')
    .select('*')
    .eq('patient_ip_no', patientIpNo)
    .eq('active', true)
    .order('prescribed_at', { ascending: false });
  if (hospitalId) q = q.eq('hospital_id', hospitalId);
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map(r => ({
    id: r.id, hospitalId: r.hospital_id, patientIpNo: r.patient_ip_no,
    drugName: r.drug_name, dose: r.dose, route: r.route, frequency: r.frequency,
    prescribedAt: r.prescribed_at, prescribedBy: r.prescribed_by ?? undefined,
    startDate: r.start_date, stopDate: r.stop_date ?? undefined,
    active: r.active, notes: r.notes ?? undefined,
  }));
}

export async function addMedicationPrescription(
  medication: Omit<PrescribedMedication, 'id' | 'prescribedAt'>
): Promise<PrescribedMedication | null> {
  const { data, error } = await supabase
    .from('medications_prescribed')
    .insert({
      hospital_id: medication.hospitalId,
      patient_ip_no: medication.patientIpNo,
      drug_name: medication.drugName,
      dose: medication.dose,
      route: medication.route,
      frequency: medication.frequency,
      prescribed_by: medication.prescribedBy ?? null,
      start_date: medication.startDate,
      stop_date: medication.stopDate ?? null,
      active: true,
      notes: medication.notes ?? null,
    })
    .select()
    .single();
  if (error || !data) return null;
  return { ...medication, id: data.id, prescribedAt: data.prescribed_at };
}

export async function stopMedication(medicationId: string): Promise<void> {
  const { error } = await supabase.from('medications_prescribed').update({ active: false }).eq('id', medicationId);
  if (error) throw new Error(`stopMedication (${medicationId}): ${error.message}`);
}

export async function recordAdministration(
  admin: Omit<MedAdministration, 'id'>
): Promise<void> {
  const { error } = await supabase.from('med_administrations').insert({
    hospital_id: admin.hospitalId,
    medication_id: admin.medicationId,
    patient_ip_no: admin.patientIpNo,
    scheduled_time: admin.scheduledTime ?? null,
    administered_at: admin.administeredAt ?? null,
    administered_by: admin.administeredBy ?? null,
    status: admin.status,
    dose_given: admin.doseGiven ?? null,
    notes: admin.notes ?? null,
  });
  if (error) throw new Error(`recordAdministration (${admin.medicationId}): ${error.message}`);
}

export async function fetchAdministrations(patientIpNo: string, date: string, hospitalId?: string): Promise<MedAdministration[]> {
  const start = `${date}T00:00:00`;
  const end = `${date}T23:59:59`;
  let q = supabase
    .from('med_administrations')
    .select('*')
    .eq('patient_ip_no', patientIpNo)
    .gte('administered_at', start)
    .lte('administered_at', end);
  if (hospitalId) q = q.eq('hospital_id', hospitalId);
  const { data } = await q;
  if (!data) return [];
  return data.map(r => ({
    id: r.id, hospitalId: r.hospital_id, medicationId: r.medication_id,
    patientIpNo: r.patient_ip_no, scheduledTime: r.scheduled_time ?? undefined,
    administeredAt: r.administered_at ?? undefined, administeredBy: r.administered_by ?? undefined,
    status: r.status as MedAdminStatus, doseGiven: r.dose_given ?? undefined, notes: r.notes ?? undefined,
  }));
}
