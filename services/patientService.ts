/**
 * patientService.ts
 * All Supabase reads/writes for the patients table.
 * Handles snake_case (DB) ↔ camelCase (app) mapping.
 * Labs and imaging are read via JOIN, written via their own normalized services.
 */

import { supabase } from '../lib/supabase';
import {
  Patient, DailyRound, Investigation, LabResult, ToDoItem,
  PacChecklistItem, PreOpChecklist, DischargeSummary, DamaSummary, DeathSummary, VitalSigns,
  ManagementPlan, PacFlowData,
} from '../types';

// ─── Joined row shapes from normalized rounds / vitals tables ─────
interface RoundsRowRead {
  date: string;
  note: string;
  todos: ToDoItem[];
}

interface VitalRowRead {
  id: string;
  timestamp: string;
  recorded_by: string | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  heart_rate: number | null;
  temperature: string | null;
  spo2: number | null;
  respiratory_rate: number | null;
  weight: string | null;
  pain_score: number | null;
  news2_score: number | null;
  notes: string | null;
}

// ─── Joined row shapes from normalized tables ───
interface LabRowRead {
  id: string;
  date: string;
  type: string;
  value: number | string; // Postgres NUMERIC comes back as string via REST
}

interface ImagingRowRead {
  id: string;
  date: string;
  type: string;
  findings: string;
  image_url: string | null;
}

// ─── DB row shape (mirrors the Supabase table exactly) ───
interface PatientRow {
  ip_no: string;
  hospital_id: string;
  abha_id: string | null;
  name: string;
  mobile: string;
  age: number;
  gender: string;
  ward: string;
  bed: string;
  unit: string | null;
  specialty: string | null;
  specialty_data: Record<string, unknown> | null;
  diagnosis: string;
  procedure: string | null;
  comorbidities: string[];
  drug_allergies: string[] | null;
  doa: string;
  dos: string | null;
  planned_dos: string | null;
  dod: string | null;
  pod: number | null;
  pac_status: string;
  patient_status: string;
  // Still present in DB (legacy JSONB) — used as fallback when normalized tables have no data
  daily_rounds?: DailyRound[] | null;
  todos: ToDoItem[];
  pac_checklist: PacChecklistItem[] | null;
  pac_flow: PacFlowData | null;
  management: string | null;
  pre_op_checklist: PreOpChecklist | null;
  discharge_summary: DischargeSummary | null;
  dama_summary: DamaSummary | null;
  death_summary: DeathSummary | null;
  vitals?: VitalSigns[] | null;
  created_at: string;
  updated_at: string;
  consent_given_at: string | null;
  consent_version: string | null;
  // Joined relations from normalized tables
  labs?: LabRowRead[] | null;
  imaging?: ImagingRowRead[] | null;
  rounds?: RoundsRowRead[] | null;
  patient_vitals?: VitalRowRead[] | null;
}

// ─── Backward-compatible migration: old PreOpChecklist object → PacChecklistItem[] ───
const PREOP_LABEL_MAP: Record<string, string> = {
  cefuroxime:   'Inj. Cefuroxime',
  consent:      'Consent',
  cbd:          'CBD (Catheter)',
  preOpXray:    'Pre-OP X-Ray',
  preOpOrder:   'Pre-OP Order',
  things:       'Things / Materials',
  implantOrder: 'Implant Order',
  cSample:      'C-Sample (Cross Match)',
  shave:        'Part Preparation (Shave)',
};

function migratePreOpChecklist(raw: unknown): PacChecklistItem[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw as PacChecklistItem[];
  // Old format: { cefuroxime: true, consent: false, phoneNo: "..." }
  return Object.entries(raw as Record<string, unknown>)
    .filter(([k, v]) => k !== 'phoneNo' && typeof v === 'boolean')
    .map(([k, v]) => ({ id: k, task: PREOP_LABEL_MAP[k] ?? k, isDone: v as boolean }));
}

// ─── DB row → TypeScript Patient ───
function rowToPatient(row: PatientRow): Patient {
  // Map normalized labs rows → LabResult[]
  const labResults: LabResult[] = Array.isArray(row.labs)
    ? row.labs.map(l => ({
        id:    l.id,
        date:  l.date,
        type:  l.type as LabResult['type'],
        value: Number(l.value),
      }))
    : [];

  // Map normalized imaging rows → Investigation[]
  const investigations: Investigation[] = Array.isArray(row.imaging)
    ? row.imaging.map(i => ({
        id:       i.id,
        date:     i.date,
        type:     i.type,
        findings: i.findings,
        imageUrl: i.image_url ?? '',
      }))
    : [];

  // Rounds: prefer normalized table; fall back to legacy JSONB for backward compat
  const dailyRounds: DailyRound[] = Array.isArray(row.rounds) && row.rounds.length > 0
    ? row.rounds.map(r => ({ date: r.date, note: r.note, todos: Array.isArray(r.todos) ? r.todos : [] }))
    : Array.isArray(row.daily_rounds) ? row.daily_rounds : [];

  // Vitals: prefer normalized table; fall back to legacy JSONB
  const vitals: VitalSigns[] = Array.isArray(row.patient_vitals) && row.patient_vitals.length > 0
    ? row.patient_vitals.map(v => ({
        id:              v.id,
        timestamp:       v.timestamp,
        recordedBy:      v.recorded_by      ?? undefined,
        bpSystolic:      v.bp_systolic      ?? undefined,
        bpDiastolic:     v.bp_diastolic     ?? undefined,
        heartRate:       v.heart_rate       ?? undefined,
        temperature:     v.temperature != null ? Number(v.temperature) : undefined,
        spo2:            v.spo2             ?? undefined,
        respiratoryRate: v.respiratory_rate ?? undefined,
        weight:          v.weight != null   ? Number(v.weight)       : undefined,
        painScore:       v.pain_score       ?? undefined,
        news2Score:      v.news2_score      ?? undefined,
        notes:           v.notes            ?? undefined,
      }))
    : Array.isArray(row.vitals) ? row.vitals : [];

  return {
    ipNo:             row.ip_no,
    abhaId:           row.abha_id ?? undefined,
    name:             row.name,
    mobile:           row.mobile,
    age:              row.age,
    gender:           row.gender as Patient['gender'],
    ward:             row.ward  as Patient['ward'],
    bed:              row.bed,
    unit:             row.unit ?? undefined,
    diagnosis:        row.diagnosis,
    procedure:        row.procedure        ?? undefined,
    comorbidities:    Array.isArray(row.comorbidities)   ? row.comorbidities   : [],
    drugAllergies:    Array.isArray(row.drug_allergies)  ? row.drug_allergies  : [],
    doa:              row.doa,
    dos:              row.dos              ?? undefined,
    plannedDos:       row.planned_dos      ?? undefined,
    dod:              row.dod              ?? undefined,
    pod:              row.pod              ?? undefined,
    pacStatus:        row.pac_status       as Patient['pacStatus'],
    patientStatus:    row.patient_status   as Patient['patientStatus'],
    dailyRounds,
    investigations,
    labResults,
    // Normalize todos: legacy rows stored `text` instead of `task`; filter blanks
    todos: Array.isArray(row.todos)
      ? (row.todos as unknown as Record<string, unknown>[])
          .map(t => ({
            id:     String(t.id     ?? ''),
            task:   String(t.task   ?? t.text ?? ''),
            isDone: Boolean(t.isDone ?? false),
          }))
          .filter(t => t.task.trim() !== '')
      : [],
    pacChecklist:     row.pac_checklist    ?? undefined,
    pacFlow:          row.pac_flow         ?? undefined,
    management:       (row.management ?? undefined) as ManagementPlan | undefined,
    preOpChecklist:   migratePreOpChecklist(row.pre_op_checklist),
    dischargeSummary: row.discharge_summary ?? undefined,
    damaSummary:      row.dama_summary      ?? undefined,
    deathSummary:     row.death_summary     ?? undefined,
    vitals,
    specialty:        row.specialty        ?? undefined,
    specialtyData:    row.specialty_data   ?? undefined,
    updatedAt:       row.updated_at,
    hospitalId:      row.hospital_id,
    consentGivenAt:  row.consent_given_at ?? undefined,
    consentVersion:  row.consent_version  ?? undefined,
  };
}

// ─── TypeScript Patient → DB row ───
// NOTE: daily_rounds and vitals are now written via roundsService / vitalsService.
//       We still write todos here (small JSONB, part of the main patient record).
function patientToRow(patient: Patient) {
  return {
    ip_no:             patient.ipNo,
    hospital_id:       patient.hospitalId ?? null,
    abha_id:           patient.abhaId ?? null,
    name:              patient.name,
    mobile:            patient.mobile,
    age:               patient.age,
    gender:            patient.gender,
    ward:              patient.ward,
    bed:               patient.bed,
    unit:              patient.unit ?? null,
    specialty:         patient.specialty         ?? null,
    specialty_data:    patient.specialtyData     ?? null,
    diagnosis:         patient.diagnosis,
    procedure:         patient.procedure        ?? null,
    comorbidities:     patient.comorbidities,
    drug_allergies:    patient.drugAllergies   ?? [],
    doa:               patient.doa,
    dos:               patient.dos              ?? null,
    planned_dos:       patient.plannedDos       ?? null,
    dod:               patient.dod              ?? null,
    pod:               patient.pod              ?? null,
    pac_status:        patient.pacStatus,
    patient_status:    patient.patientStatus,
    todos:             patient.todos,
    pac_checklist:     patient.pacChecklist     ?? null,
    pac_flow:          patient.pacFlow          ?? null,
    management:        patient.management       ?? null,
    pre_op_checklist:  patient.preOpChecklist   ?? null,
    discharge_summary: patient.dischargeSummary ?? null,
    dama_summary:      patient.damaSummary      ?? null,
    death_summary:     patient.deathSummary     ?? null,
    consent_given_at:  patient.consentGivenAt   ?? null,
    consent_version:   patient.consentVersion   ?? null,
    // daily_rounds and vitals intentionally omitted — normalized tables own these
  };
}

// ─── SELECT strings ───────────────────────────────────────────────────────────
//
// PATIENT_LIST_SELECT — lightweight, used for all list/dashboard queries.
//   Only the latest round note is fetched (limit 1) to show in list cards.
//   No vitals JOIN — the dashboard never renders vitals history.
//
// PATIENT_FULL_SELECT — full JOIN for PatientDetail and DischargeSummary views.
//   Fetches all labs, imaging, rounds, and vitals for a single patient.
//
const PATIENT_LIST_SELECT = [
  'ip_no', 'hospital_id', 'abha_id', 'name', 'mobile', 'age', 'gender', 'ward', 'bed', 'unit',
  'specialty', 'specialty_data',
  'diagnosis', 'procedure', 'comorbidities', 'doa', 'dos', 'planned_dos', 'dod', 'pod',
  'pac_status', 'patient_status', 'todos', 'pac_checklist', 'pre_op_checklist',
  'management',
  'discharge_summary', 'created_at', 'updated_at', 'consent_given_at', 'consent_version',
  // Only rounds join for list rendering — labs/imaging fetched on detail view only
  'rounds(date, note, todos)',
  // No labs, imaging, or patient_vitals in list queries — cuts payload by ~70%
].join(', ');

// Full select (all vitals) — used only when a single patient's detail is loaded
const PATIENT_SELECT = [
  'ip_no', 'hospital_id', 'abha_id', 'name', 'mobile', 'age', 'gender', 'ward', 'bed', 'unit',
  'specialty', 'specialty_data',
  'diagnosis', 'procedure', 'comorbidities', 'doa', 'dos', 'planned_dos', 'dod', 'pod',
  'pac_status', 'patient_status', 'todos', 'pac_checklist', 'pac_flow', 'pre_op_checklist',
  'management',
  'discharge_summary', 'created_at', 'updated_at', 'consent_given_at', 'consent_version',
  'labs(id, date, type, value)',
  'imaging(id, date, type, findings, image_url)',
  'rounds(date, note, todos)',
  'patient_vitals(id, timestamp, recorded_by, bp_systolic, bp_diastolic, heart_rate, temperature, spo2, respiratory_rate, weight, pain_score, news2_score, notes)',
].join(', ');

// ─── Public API ───

/** Parse a raw Supabase row into a Patient (used by Realtime handlers). */
export function parsePatientRow(row: unknown): Patient {
  return rowToPatient(row as PatientRow);
}

/** Page size for paginated fetches. */
export const PATIENT_PAGE_SIZE = 50;

/**
 * Load active (non-discharged) patients — paginated.
 * Returns one page of results plus a hasMore flag.
 * Fetches pageSize+1 rows to detect if more pages exist without a separate COUNT query.
 */
export async function fetchActivePatientsPage(
  unit?: string,
  page = 0,
  pageSize = PATIENT_PAGE_SIZE,
  hospitalId?: string,
): Promise<{ patients: Patient[]; hasMore: boolean }> {
  const from = page * pageSize;
  const to = from + pageSize; // inclusive, fetches pageSize+1 rows

  let query = supabase
    .from('patients')
    .select(PATIENT_LIST_SELECT)   // lightweight — no vitals JOIN
    .neq('patient_status', 'Discharged')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (unit) query = query.eq('unit', unit);
  if (hospitalId) query = query.eq('hospital_id', hospitalId);

  const { data, error } = await query;
  if (error) throw new Error(`fetchActivePatientsPage: ${error.message}`);
  const rows = (data ?? []) as unknown as PatientRow[];
  return {
    patients: rows.slice(0, pageSize).map(rowToPatient),
    hasMore: rows.length > pageSize,
  };
}

/**
 * Load only active (non-discharged) patients — non-paginated.
 * Used by realtime sync handlers and offline queue replays (small targeted syncs).
 * If `unit` is provided, only that unit's patients are returned.
 */
export async function fetchActivePatients(unit?: string, hospitalId?: string): Promise<Patient[]> {
  let query = supabase
    .from('patients')
    .select(PATIENT_LIST_SELECT)   // lightweight — no vitals JOIN
    .neq('patient_status', 'Discharged')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(2000);                  // high cap — paginated path is the primary one

  if (unit) query = query.eq('unit', unit);
  if (hospitalId) query = query.eq('hospital_id', hospitalId);

  const { data, error } = await query;
  if (error) throw new Error(`fetchActivePatients: ${error.message}`);
  return ((data ?? []) as unknown as PatientRow[]).map(rowToPatient);
}

/**
 * Load ALL patients including discharged — used for Master List & Discharge views.
 * Uses paginated batches internally to avoid the 1000-row hard cap.
 * Hard-capped at MAX_ALL_PAGES batches (25 000 patients) to prevent runaway
 * queries if the DB returns full pages indefinitely due to a bug or data issue.
 */
const MAX_ALL_PAGES = 50; // 50 × 500 = 25 000 patients hard ceiling

export async function fetchAllPatients(unit?: string, hospitalId?: string): Promise<Patient[]> {
  const pageSize = 500;
  const results: Patient[] = [];
  let page = 0;
  while (page < MAX_ALL_PAGES) {
    const from = page * pageSize;
    const to   = from + pageSize - 1;
    let query = supabase
      .from('patients')
      .select(PATIENT_LIST_SELECT)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (unit)       query = query.eq('unit', unit);
    if (hospitalId) query = query.eq('hospital_id', hospitalId);
    const { data, error } = await query;
    if (error) throw new Error(`fetchAllPatients: ${error.message}`);
    const rows = (data ?? []) as unknown as PatientRow[];
    results.push(...rows.map(rowToPatient));
    if (rows.length < pageSize) break;
    page++;
  }
  return results;
}

/**
 * Load a single patient with full sub-table joins (vitals, labs, imaging, rounds).
 * Use this for PatientDetail / DischargeSummary — not for list views.
 */
export async function fetchPatientById(ipNo: string, hospitalId?: string): Promise<Patient | null> {
  let query = supabase
    .from('patients')
    .select(PATIENT_SELECT)      // full join including vitals
    .eq('ip_no', ipNo)
    .is('deleted_at', null);
  if (hospitalId) query = query.eq('hospital_id', hospitalId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`fetchPatientById(${ipNo}): ${error.message}`);
  return data ? rowToPatient(data as unknown as PatientRow) : null;
}

/**
 * Insert or update a patient's core fields.
 * Labs and imaging are NOT written here — use labsService / imagingService.
 * Uses ip_no as the conflict key — safe to call on both create and update.
 *
 * Bug #9: Concurrent edit detection.
 * If the patient has an `updatedAt` timestamp (i.e. it was loaded from the DB),
 * we use a conditional update. If another user saved between our load and save,
 * the condition fails (0 rows updated) and we throw a CONCURRENT_EDIT error.
 */
export async function upsertPatient(patient: Patient): Promise<void> {
  if (patient.updatedAt) {
    // Existing patient: conditional update to detect concurrent edits
    const { data, error } = await supabase
      .from('patients')
      .update(patientToRow(patient))
      .eq('ip_no', patient.ipNo)
      .eq('updated_at', patient.updatedAt)
      .select('ip_no');

    if (error) throw new Error(`upsertPatient (${patient.ipNo}): ${error.message}`);
    if (!data || data.length === 0) {
      throw new Error(`CONCURRENT_EDIT:${patient.ipNo}`);
    }
  } else {
    // New patient: plain insert
    const { error } = await supabase
      .from('patients')
      .insert(patientToRow(patient));

    if (error) throw new Error(`upsertPatient (${patient.ipNo}): ${error.message}`);
  }
}

/**
 * Soft-delete a patient by setting deleted_at to now.
 * Hard-purge happens automatically after 30 days via purge_old_soft_deletes().
 * Use anonymizePatient() for DPDP §13 Right to Erasure (immediate PII wipe).
 */
export async function removePatient(ipNo: string): Promise<void> {
  const { error } = await supabase
    .from('patients')
    .update({ deleted_at: new Date().toISOString() })
    .eq('ip_no', ipNo);

  if (error) throw new Error(`removePatient (${ipNo}): ${error.message}`);
}

/**
 * Restore a soft-deleted patient within the 30-day recovery window.
 * Clears deleted_at so the patient reappears in all queries.
 */
export async function restorePatient(ipNo: string): Promise<void> {
  const { error } = await supabase
    .from('patients')
    .update({ deleted_at: null })
    .eq('ip_no', ipNo)
    .not('deleted_at', 'is', null);

  if (error) throw new Error(`restorePatient (${ipNo}): ${error.message}`);
}

/**
 * DPDP Act 2023 — Right to Erasure (§13)
 * Anonymises all PII fields for a patient record and deletes linked
 * labs, imaging, rounds and nursing_notes rows.
 * The anonymised patient row is retained for billing / audit continuity.
 */
export async function anonymizePatient(ipNo: string, hospitalId: string): Promise<void> {
  const redacted = '[REDACTED]';
  const redactedDate = '1900-01-01';

  // 1. Anonymise PII in patients table
  const { error: patErr } = await supabase
    .from('patients')
    .update({
      name:            redacted,
      mobile:          null,
      abha_id:         null,
      age:             0,
      comorbidities:   null,
      rounds:          null,
      pre_op_checklist: null,
      pac_checklist:   null,
      notes:           null,
      todos:           null,
      drug_allergies:  null,
      date_of_admission: redactedDate,
      date_of_surgery:   null,
    })
    .eq('ip_no', ipNo)
    .eq('hospital_id', hospitalId);
  if (patErr) throw new Error(`anonymizePatient PII wipe: ${patErr.message}`);

  // 2. Delete linked normalized tables
  const tables = ['labs', 'imaging', 'rounds', 'nursing_notes'] as const;
  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('patient_ip_no', ipNo);
    if (error) console.warn(`anonymizePatient ${table} delete: ${error.message}`);
  }

  // 3. Delete clinical administration tables (DPDP §13 complete erasure)
  const clinicalTables = ['med_administrations', 'medications_prescribed', 'patient_vitals'] as const;
  for (const table of clinicalTables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('patient_ip_no', ipNo);
    if (error) console.warn(`anonymizePatient ${table} delete: ${error.message}`);
  }
}

/**
 * DPDP Act 2023 — Right to Data Portability (§16)
 * Returns a structured JSON export of all data held for a single patient.
 * Triggers a browser download of the JSON file.
 */
export async function exportPatientData(ipNo: string, hospitalId: string): Promise<void> {
  // 1. Core patient record
  const { data: patient, error: patErr } = await supabase
    .from('patients')
    .select('*')
    .eq('ip_no', ipNo)
    .eq('hospital_id', hospitalId)
    .maybeSingle();
  if (patErr) throw new Error(`exportPatientData: ${patErr.message}`);
  if (!patient) throw new Error(`Patient ${ipNo} not found.`);

  // 2. Linked tables — hospital_id filter prevents cross-tenant data leakage (DPDP §16)
  const [labsRes, imagingRes, roundsRes, notesRes] = await Promise.all([
    supabase.from('labs').select('*').eq('patient_ip_no', ipNo).eq('hospital_id', hospitalId),
    supabase.from('imaging').select('*').eq('patient_ip_no', ipNo).eq('hospital_id', hospitalId),
    supabase.from('rounds').select('*').eq('patient_ip_no', ipNo).eq('hospital_id', hospitalId),
    supabase.from('nursing_notes').select('*').eq('patient_ip_no', ipNo).eq('hospital_id', hospitalId),
  ]);

  const exportBundle = {
    exportedAt: new Date().toISOString(),
    exportedBy: 'MediWard — DPDP §16 Data Portability',
    patient,
    labs:          labsRes.data    ?? [],
    imaging:       imagingRes.data ?? [],
    rounds:        roundsRes.data  ?? [],
    nursingNotes:  notesRes.data   ?? [],
  };

  // Trigger browser download
  const blob = new Blob([JSON.stringify(exportBundle, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `mediward_patient_${ipNo.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
