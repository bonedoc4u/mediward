import { supabase } from '../lib/supabase';
import { OTPatient, OTListMeta, OTType } from '../utils/otListTypes';

interface OTListRow {
  id: string;
  surgeon: string;
  surgeon_unit: string;
  ot_time: string;
  version: number;
}

interface OTListEntryRow {
  id: string;
  ot_list_id: string;
  sequence: number;
  category: string;
  patient_ip_no: string;
  name: string;
  age: string;
  gender: string;
  ward: string;
  unit: string;
  diagnosis: string;
  procedure: string;
  side: string;
  anesthesia: string;
  c_arm: string;
  implants: string;
  remarks: string;
  version: number;
}

function rowToOTListMeta(row: OTListRow): OTListMeta {
  return {
    id: row.id,
    surgeon: row.surgeon,
    surgeonUnit: row.surgeon_unit,
    otTime: row.ot_time,
    version: row.version,
  };
}

// ot_list_entries has no ot_type column (it's implicit from which ot_lists
// row an entry belongs to, not stored redundantly on every entry) — so any
// mapper reading straight from this table can give you every field EXCEPT
// otType. fetchOTList/insertOTListEntry already know the otType they
// queried/inserted with, so they use the full rowToOTPatient below. A row
// returned by an UPDATE (updateOTListEntry) doesn't carry it, so that
// function returns Omit<OTPatient, 'otType'> via this helper instead,
// leaving the caller (which already has the entry's otType from its own
// prior state) to merge it back in — avoiding a guessed default.
function rowToOTPatientFields(row: OTListEntryRow): Omit<OTPatient, 'otType'> {
  return {
    id: row.id,
    otListId: row.ot_list_id,
    version: row.version,
    sequence: row.sequence,
    ipNo: row.patient_ip_no,
    name: row.name,
    age: row.age,
    gender: row.gender,
    ward: row.ward,
    unit: row.unit,
    diagnosis: row.diagnosis,
    procedure: row.procedure,
    side: row.side,
    anesthesia: row.anesthesia,
    cArm: row.c_arm,
    implants: row.implants,
    remarks: row.remarks,
    category: row.category,
  };
}

function rowToOTPatient(row: OTListEntryRow, otType: OTType): OTPatient {
  return { ...rowToOTPatientFields(row), otType };
}

export async function fetchOTList(
  hospitalId: string,
  unit: string,
  otType: OTType,
  listDate: string,
): Promise<{ list: OTListMeta | null; entries: OTPatient[] }> {
  const { data: listRow, error: listError } = await supabase
    .from('ot_lists')
    .select('*')
    .eq('hospital_id', hospitalId)
    .eq('unit', unit)
    .eq('ot_type', otType)
    .eq('list_date', listDate)
    .maybeSingle();
  if (listError) throw new Error(`fetchOTList: ${listError.message}`);
  if (!listRow) return { list: null, entries: [] };

  const { data: entryRows, error: entriesError } = await supabase
    .from('ot_list_entries')
    .select('*')
    .eq('ot_list_id', (listRow as OTListRow).id)
    .order('sequence', { ascending: true });
  if (entriesError) throw new Error(`fetchOTList entries: ${entriesError.message}`);

  return {
    list: rowToOTListMeta(listRow as OTListRow),
    entries: ((entryRows ?? []) as OTListEntryRow[]).map(r => rowToOTPatient(r, otType)),
  };
}

export async function upsertOTListMeta(
  hospitalId: string,
  unit: string,
  otType: OTType,
  listDate: string,
  meta: { surgeon: string; surgeonUnit: string; otTime: string },
): Promise<OTListMeta> {
  const { data, error } = await supabase
    .from('ot_lists')
    .upsert(
      {
        hospital_id: hospitalId,
        unit,
        ot_type: otType,
        list_date: listDate,
        surgeon: meta.surgeon,
        surgeon_unit: meta.surgeonUnit,
        ot_time: meta.otTime,
      },
      { onConflict: 'hospital_id,unit,ot_type,list_date' },
    )
    .select('*')
    .single();
  if (error) throw new Error(`upsertOTListMeta: ${error.message}`);
  return rowToOTListMeta(data as OTListRow);
}

export async function insertOTListEntry(
  otListId: string,
  hospitalId: string,
  entry: Omit<OTPatient, 'id' | 'otListId' | 'version'>,
): Promise<OTPatient> {
  const { data, error } = await supabase
    .from('ot_list_entries')
    .insert({
      ot_list_id: otListId,
      hospital_id: hospitalId,
      sequence: entry.sequence,
      category: entry.category ?? '',
      patient_ip_no: entry.ipNo,
      name: entry.name,
      age: entry.age,
      gender: entry.gender,
      ward: entry.ward,
      unit: entry.unit,
      diagnosis: entry.diagnosis,
      procedure: entry.procedure,
      side: entry.side,
      anesthesia: entry.anesthesia,
      c_arm: entry.cArm,
      implants: entry.implants,
      remarks: entry.remarks,
    })
    .select('*')
    .single();
  if (error) throw new Error(`insertOTListEntry: ${error.message}`);
  return rowToOTPatient(data as OTListEntryRow, entry.otType);
}

export async function updateOTListEntry(
  entryId: string,
  version: number,
  changes: Partial<Omit<OTPatient, 'id' | 'otListId' | 'version' | 'otType'>>,
): Promise<Omit<OTPatient, 'otType'>> {
  const rowChanges: Record<string, unknown> = {};
  if (changes.sequence !== undefined) rowChanges.sequence = changes.sequence;
  if (changes.category !== undefined) rowChanges.category = changes.category;
  if (changes.anesthesia !== undefined) rowChanges.anesthesia = changes.anesthesia;
  if (changes.cArm !== undefined) rowChanges.c_arm = changes.cArm;
  if (changes.implants !== undefined) rowChanges.implants = changes.implants;
  if (changes.remarks !== undefined) rowChanges.remarks = changes.remarks;
  if (changes.ipNo !== undefined) rowChanges.patient_ip_no = changes.ipNo;
  if (changes.name !== undefined) rowChanges.name = changes.name;
  if (changes.age !== undefined) rowChanges.age = changes.age;
  if (changes.gender !== undefined) rowChanges.gender = changes.gender;
  if (changes.ward !== undefined) rowChanges.ward = changes.ward;
  if (changes.unit !== undefined) rowChanges.unit = changes.unit;
  if (changes.diagnosis !== undefined) rowChanges.diagnosis = changes.diagnosis;
  if (changes.procedure !== undefined) rowChanges.procedure = changes.procedure;
  if (changes.side !== undefined) rowChanges.side = changes.side;

  const { data, error } = await supabase
    .from('ot_list_entries')
    .update(rowChanges)
    .eq('id', entryId)
    .eq('version', version)
    .select('*');
  if (error) throw new Error(`updateOTListEntry (${entryId}): ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`CONCURRENT_EDIT:${entryId}`);
  }
  const row = (data as OTListEntryRow[])[0];
  return rowToOTPatientFields(row);
}

export async function deleteOTListEntry(entryId: string): Promise<void> {
  const { error } = await supabase.from('ot_list_entries').delete().eq('id', entryId);
  if (error) throw new Error(`deleteOTListEntry (${entryId}): ${error.message}`);
}

export async function reorderOTListEntries(
  updates: Array<{ id: string; sequence: number; category: string }>,
): Promise<Array<{ id: string; version: number }>> {
  // Returns the post-update id/version pairs — a reorder still bumps each
  // row's optimistic-lock version (the DB trigger does this on every
  // update), so callers need these back to keep their local copy in sync;
  // otherwise the very next edit to a just-reordered row would carry a
  // stale version and be rejected as a false conflict.
  const results = await Promise.all(
    updates.map(u =>
      supabase.from('ot_list_entries')
        .update({ sequence: u.sequence, category: u.category })
        .eq('id', u.id)
        .select('id, version')
    ),
  );
  const failed = results.find(r => r.error);
  if (failed?.error) throw new Error(`reorderOTListEntries: ${failed.error.message}`);
  return results.flatMap(r => (r.data ?? []) as Array<{ id: string; version: number }>);
}
