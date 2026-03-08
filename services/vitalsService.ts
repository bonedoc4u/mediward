/**
 * vitalsService.ts
 * CRUD for the normalized `patient_vitals` table.
 * Reads/writes strongly-typed columns instead of a JSONB blob.
 */

import { supabase } from '../lib/supabase';
import { VitalSigns } from '../types';

interface VitalRow {
  id: string;
  patient_ip_no: string;
  hospital_id: string | null;
  timestamp: string;
  recorded_by: string | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  heart_rate: number | null;
  temperature: string | null;   // Postgres NUMERIC returns as string via REST
  spo2: number | null;
  respiratory_rate: number | null;
  weight: string | null;
  pain_score: number | null;
  notes: string | null;
  created_at: string;
}

function rowToVital(r: VitalRow): VitalSigns {
  return {
    id:              r.id,
    timestamp:       r.timestamp,
    recordedBy:      r.recorded_by      ?? undefined,
    bpSystolic:      r.bp_systolic      ?? undefined,
    bpDiastolic:     r.bp_diastolic     ?? undefined,
    heartRate:       r.heart_rate       ?? undefined,
    temperature:     r.temperature != null ? Number(r.temperature) : undefined,
    spo2:            r.spo2             ?? undefined,
    respiratoryRate: r.respiratory_rate ?? undefined,
    weight:          r.weight != null   ? Number(r.weight)       : undefined,
    painScore:       r.pain_score       ?? undefined,
    notes:           r.notes            ?? undefined,
  };
}

/** Fetch recent vitals for a patient, newest-first. */
export async function fetchVitals(
  patientIpNo: string,
  limit = 50,
): Promise<VitalSigns[]> {
  const { data, error } = await supabase
    .from('patient_vitals')
    .select('*')
    .eq('patient_ip_no', patientIpNo)
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`fetchVitals(${patientIpNo}): ${error.message}`);
  return ((data ?? []) as unknown as VitalRow[]).map(rowToVital);
}

/**
 * Insert a new vital-signs observation.
 * Returns the created record with the server-generated UUID.
 */
export async function insertVital(
  patientIpNo: string,
  hospitalId: string | undefined,
  vital: Omit<VitalSigns, 'id'>,
): Promise<VitalSigns> {
  const { data, error } = await supabase
    .from('patient_vitals')
    .insert({
      patient_ip_no:    patientIpNo,
      hospital_id:      hospitalId        ?? null,
      timestamp:        vital.timestamp,
      recorded_by:      vital.recordedBy  ?? null,
      bp_systolic:      vital.bpSystolic  ?? null,
      bp_diastolic:     vital.bpDiastolic ?? null,
      heart_rate:       vital.heartRate   ?? null,
      temperature:      vital.temperature ?? null,
      spo2:             vital.spo2        ?? null,
      respiratory_rate: vital.respiratoryRate ?? null,
      weight:           vital.weight      ?? null,
      pain_score:       vital.painScore   ?? null,
      notes:            vital.notes       ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(`insertVital(${patientIpNo}): ${error.message}`);
  return rowToVital(data as unknown as VitalRow);
}

/** Delete a single vitals observation by its UUID. */
export async function deleteVital(id: string): Promise<void> {
  const { error } = await supabase
    .from('patient_vitals')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`deleteVital(${id}): ${error.message}`);
}
