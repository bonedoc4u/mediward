/**
 * patientDataRights.ts — a patient's data-protection requests (DPDP Act 2023):
 * erase my data (§13) and give me a copy of my data (§16).
 *
 * The erase itself is one database function, erase_patient_data(), so it is
 * all-or-nothing and covers every table that refers to a patient (migration
 * 20261114180000). This file only adds the part the database cannot do:
 * removing the stored image files.
 */
import { supabase } from '../lib/supabase';
import { removePatientFiles } from './storageService';

// ─── Erase ───────────────────────────────────────────────────────────────────

/** Who is about to be erased, as the database sees it. Shown before confirming. */
export interface ErasePreview {
  ipNo: string;
  hospitalId: string;
  name: string;
  age: number;
  gender: string;
  ward: string;
  bed: string;
  unit: string | null;
  status: string;
  /** Rows in linked tables (rounds, labs, charting…) that will be deleted. */
  rowsToRemove: number;
  /** Image links recorded for the patient. */
  imagePaths: string[];
  /** The record was erased before; only leftovers, if any, would be removed. */
  alreadyErased: boolean;
}

export interface EraseResult {
  ipNo: string;
  rowsRemoved: number;
  filesRemoved: number;
  /** Image links that point outside this hospital's storage and were left alone. */
  filesSkipped: number;
}

/** Name the database gives an erased record. */
export const ERASED_NAME = '[REDACTED]';

/** Turn a database refusal into a sentence a ward admin can act on. */
export function eraseErrorMessage(message: string, ipNo: string): string {
  if (message.startsWith('ROLE_FORBIDDEN')) return 'Only an admin can erase patient data.';
  if (message.startsWith('PATIENT_NOT_FOUND')) return `No patient with IP number ${ipNo} in this hospital.`;
  if (message.startsWith('PATIENT_STILL_ADMITTED')) {
    return 'This patient is still admitted. Discharge the patient first. Nothing was erased.';
  }
  if (/could not find the function/i.test(message)) {
    return 'Erasing is not switched on in the database yet. Nothing was erased.';
  }
  return `Nothing was erased. Check the connection and try again. (${message})`;
}

interface DryRunRow {
  ip_no: string; hospital_id: string; name: string; age: number; gender: string;
  ward: string; bed: string; unit: string | null; patient_status: string;
  rows_to_remove: number; image_urls: string[] | null;
}

/**
 * Ask the database who this IP number is and whether an erase would be
 * accepted. Changes nothing. Throws a readable error when the patient is not
 * found, is still admitted, or the user is not an admin.
 */
export async function fetchErasePreview(ipNo: string): Promise<ErasePreview> {
  const wanted = ipNo.trim();
  const { data, error } = await supabase.rpc('erase_patient_data', { p_ip_no: wanted, p_dry_run: true });
  if (error) throw new Error(eraseErrorMessage(error.message, wanted));
  const row = data as DryRunRow | null;
  if (!row?.ip_no) throw new Error(eraseErrorMessage('empty answer', wanted));
  return {
    ipNo: row.ip_no,
    hospitalId: row.hospital_id,
    name: row.name,
    age: row.age,
    gender: row.gender,
    ward: row.ward,
    bed: row.bed,
    unit: row.unit,
    status: row.patient_status,
    rowsToRemove: row.rows_to_remove ?? 0,
    imagePaths: row.image_urls ?? [],
    alreadyErased: row.name === ERASED_NAME,
  };
}

/**
 * Erase a patient's personal and clinical data. Cannot be undone.
 *
 * Order matters:
 *   1. Ask the database again whether the erase will be accepted (dry run).
 *      Nothing has been touched if it says no.
 *   2. Remove the image files, and prove they are gone.
 *   3. Erase the records, in one transaction.
 * If step 3 fails after step 2, the files are gone but the records are still
 * there. Running the erase again finishes the job; the error says so.
 */
export async function erasePatientData(ipNo: string): Promise<EraseResult> {
  const patient = await fetchErasePreview(ipNo);

  const files = await removePatientFiles(patient.hospitalId, patient.ipNo, patient.imagePaths);

  const { data, error } = await supabase.rpc('erase_patient_data', { p_ip_no: patient.ipNo });
  if (error) {
    throw new Error(files.removed > 0
      ? `The image files were removed, but the records were NOT erased. Run the erase again to finish. (${error.message})`
      : eraseErrorMessage(error.message, patient.ipNo));
  }
  const done = data as { rows_removed?: number } | null;
  return {
    ipNo: patient.ipNo,
    rowsRemoved: done?.rows_removed ?? 0,
    filesRemoved: files.removed,
    filesSkipped: files.skipped,
  };
}

// ─── Export (a copy of everything held) ──────────────────────────────────────

/**
 * Every table that holds rows of one patient, and the name its rows get in
 * the export file. scripts/check-erase-patient-data.mjs proves on a real
 * database that the erase covers the same tables.
 */
export const PATIENT_LINKED_TABLES = {
  labs: 'labs',
  imaging: 'imaging',
  rounds: 'rounds',
  nursing_notes: 'nursingNotes',
  patient_vitals: 'vitals',
  medications_prescribed: 'medications',
  med_administrations: 'medicationAdministrations',
  wound_care: 'woundCare',
  intake_output: 'intakeOutput',
  blood_transfusion: 'bloodTransfusions',
  ot_list_entries: 'otListEntries',
  consult_requests: 'consultRequests',
  handovers: 'handovers',
} as const;

/** Tables whose patient_ip_no is plain text, not a database link to the patient. */
const NOT_LINKED_BY_KEY: readonly string[] = ['ot_list_entries'];

/** "This database does not have that table" — not the same as "the read failed". */
const isMissingTable = (code: string | undefined): boolean => code === 'PGRST205' || code === '42P01';

export interface PatientExport {
  exportedAt: string;
  exportedBy: string;
  patient: Record<string, unknown>;
  /** Tables this database does not have. Listed so a gap is never silent. */
  notAvailable: string[];
  [section: string]: unknown;
}

/**
 * Collect everything held for one patient. Throws if any part cannot be read:
 * an export with a silent gap would be handed over as complete.
 */
export async function buildPatientExport(ipNo: string, hospitalId: string): Promise<PatientExport> {
  // Tenant scope: the patient must belong to this hospital.
  const { data: patient, error: patErr } = await supabase
    .from('patients')
    .select('*')
    .eq('ip_no', ipNo)
    .eq('hospital_id', hospitalId)
    .maybeSingle();
  if (patErr) throw new Error(`The patient record could not be read: ${patErr.message}`);
  if (!patient) throw new Error(`No patient with IP number ${ipNo} in this hospital.`);

  const bundle: PatientExport = {
    exportedAt: new Date().toISOString(),
    exportedBy: 'MediWard — DPDP §16 Data Portability',
    patient: patient as Record<string, unknown>,
    notAvailable: [],
  };

  const tables = Object.keys(PATIENT_LINKED_TABLES) as (keyof typeof PATIENT_LINKED_TABLES)[];
  const results = await Promise.all(tables.map(table => {
    // Linked rows belong to the patient by a database key (ip_no is unique
    // across hospitals), so the patient check above already scopes them. A
    // plain-text column gives no such guarantee: filter by hospital as well.
    const query = supabase.from(table).select('*').eq('patient_ip_no', ipNo);
    return NOT_LINKED_BY_KEY.includes(table) ? query.eq('hospital_id', hospitalId) : query;
  }));

  results.forEach((res, i) => {
    const table = tables[i];
    if (res.error) {
      if (isMissingTable(res.error.code)) { bundle.notAvailable.push(table); return; }
      throw new Error(`The export is incomplete and was not downloaded: ${table} could not be read (${res.error.message}).`);
    }
    bundle[PATIENT_LINKED_TABLES[table]] = res.data ?? [];
  });

  return bundle;
}

/** Build the export and hand it to the browser as a JSON download. */
export async function exportPatientData(ipNo: string, hospitalId: string): Promise<void> {
  const bundle = await buildPatientExport(ipNo, hospitalId);

  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `mediward_patient_${ipNo.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
