/**
 * woundCareService.ts
 * CRUD for the wound_care table.
 */

import { supabase } from '../lib/supabase';
import { WoundCareRecord } from '../types';

function rowToRecord(row: Record<string, unknown>): WoundCareRecord {
  return {
    id:                 String(row.id),
    patientIpNo:        String(row.patient_ip_no),
    careDate:           String(row.care_date),
    woundSite:          String(row.wound_site),
    woundType:          row.wound_type ? String(row.wound_type) : undefined,
    woundCondition:     row.wound_condition ? String(row.wound_condition) : undefined,
    dressingType:       row.dressing_type ? String(row.dressing_type) : undefined,
    dressingChanged:    Boolean(row.dressing_changed),
    woundMeasurement:   row.wound_measurement ? String(row.wound_measurement) : undefined,
    exudate:            row.exudate ? String(row.exudate) : undefined,
    notes:              row.notes ? String(row.notes) : undefined,
    nextDressingDate:   row.next_dressing_date ? String(row.next_dressing_date) : undefined,
    recordedBy:         row.recorded_by ? String(row.recorded_by) : undefined,
    createdAt:          String(row.created_at),
  };
}

export async function fetchWoundCare(patientIpNo: string): Promise<WoundCareRecord[]> {
  const { data, error } = await supabase
    .from('wound_care')
    .select('*')
    .eq('patient_ip_no', patientIpNo)
    .order('care_date', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToRecord);
}

export async function addWoundCare(
  patientIpNo: string,
  record: Omit<WoundCareRecord, 'id' | 'patientIpNo' | 'createdAt'>,
): Promise<WoundCareRecord> {
  const { data, error } = await supabase
    .from('wound_care')
    .insert({
      patient_ip_no:      patientIpNo,
      care_date:          record.careDate,
      wound_site:         record.woundSite,
      wound_type:         record.woundType ?? null,
      wound_condition:    record.woundCondition ?? null,
      dressing_type:      record.dressingType ?? null,
      dressing_changed:   record.dressingChanged,
      wound_measurement:  record.woundMeasurement ?? null,
      exudate:            record.exudate ?? null,
      notes:              record.notes ?? null,
      next_dressing_date: record.nextDressingDate ?? null,
      recorded_by:        record.recordedBy ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToRecord(data as Record<string, unknown>);
}

export async function updateWoundCare(record: WoundCareRecord): Promise<void> {
  const { error } = await supabase
    .from('wound_care')
    .update({
      care_date:          record.careDate,
      wound_site:         record.woundSite,
      wound_type:         record.woundType ?? null,
      wound_condition:    record.woundCondition ?? null,
      dressing_type:      record.dressingType ?? null,
      dressing_changed:   record.dressingChanged,
      wound_measurement:  record.woundMeasurement ?? null,
      exudate:            record.exudate ?? null,
      notes:              record.notes ?? null,
      next_dressing_date: record.nextDressingDate ?? null,
      recorded_by:        record.recordedBy ?? null,
    })
    .eq('id', record.id);
  if (error) throw error;
}

export async function deleteWoundCare(id: string): Promise<void> {
  const { error } = await supabase.from('wound_care').delete().eq('id', id);
  if (error) throw error;
}
