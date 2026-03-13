/**
 * bloodTransfusionService.ts
 * CRUD for the blood_transfusion table.
 */

import { supabase } from '../lib/supabase';
import { BloodTransfusionRecord } from '../types';

function rowToRecord(row: Record<string, unknown>): BloodTransfusionRecord {
  return {
    id:               String(row.id),
    patientIpNo:      String(row.patient_ip_no),
    transfusionDate:  String(row.transfusion_date),
    bloodProduct:     String(row.blood_product),
    bloodGroup:       row.blood_group ? String(row.blood_group) : undefined,
    units:            Number(row.units),
    bagNo:            row.bag_no ? String(row.bag_no) : undefined,
    startedAt:        row.started_at ? String(row.started_at) : undefined,
    completedAt:      row.completed_at ? String(row.completed_at) : undefined,
    reaction:         row.reaction ? String(row.reaction) : undefined,
    notes:            row.notes ? String(row.notes) : undefined,
    recordedBy:       row.recorded_by ? String(row.recorded_by) : undefined,
    createdAt:        String(row.created_at),
  };
}

export async function fetchBloodTransfusions(patientIpNo: string): Promise<BloodTransfusionRecord[]> {
  const { data, error } = await supabase
    .from('blood_transfusion')
    .select('*')
    .eq('patient_ip_no', patientIpNo)
    .order('transfusion_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToRecord);
}

export async function addBloodTransfusion(
  patientIpNo: string,
  record: Omit<BloodTransfusionRecord, 'id' | 'patientIpNo' | 'createdAt'>,
): Promise<BloodTransfusionRecord> {
  const { data, error } = await supabase
    .from('blood_transfusion')
    .insert({
      patient_ip_no:    patientIpNo,
      transfusion_date: record.transfusionDate,
      blood_product:    record.bloodProduct,
      blood_group:      record.bloodGroup ?? null,
      units:            record.units,
      bag_no:           record.bagNo ?? null,
      started_at:       record.startedAt ?? null,
      completed_at:     record.completedAt ?? null,
      reaction:         record.reaction ?? null,
      notes:            record.notes ?? null,
      recorded_by:      record.recordedBy ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToRecord(data as Record<string, unknown>);
}

export async function updateBloodTransfusion(record: BloodTransfusionRecord): Promise<void> {
  const { error } = await supabase
    .from('blood_transfusion')
    .update({
      transfusion_date: record.transfusionDate,
      blood_product:    record.bloodProduct,
      blood_group:      record.bloodGroup ?? null,
      units:            record.units,
      bag_no:           record.bagNo ?? null,
      started_at:       record.startedAt ?? null,
      completed_at:     record.completedAt ?? null,
      reaction:         record.reaction ?? null,
      notes:            record.notes ?? null,
      recorded_by:      record.recordedBy ?? null,
    })
    .eq('id', record.id);
  if (error) throw error;
}

export async function deleteBloodTransfusion(id: string): Promise<void> {
  const { error } = await supabase.from('blood_transfusion').delete().eq('id', id);
  if (error) throw error;
}
