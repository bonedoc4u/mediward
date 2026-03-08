/**
 * patientService.ts
 * All Supabase reads/writes for the patients table.
 * Handles snake_case (DB) ↔ camelCase (app) mapping.
 * Labs and imaging are read via JOIN, written via their own normalized services.
 */

import { supabase } from '../lib/supabase';
import {
  Patient, DailyRound, Investigation, LabResult, ToDoItem,
  PacChecklistItem, PreOpChecklist, DischargeSummary, VitalSigns,
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
  abha_id: string | null;
  name: string;
  mobile: string;
  age: number;
  gender: string;
  ward: string;
  bed: string;
  unit: string | null;
  diagnosis: string;
  procedure: string | null;
  comorbidities: string[];
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
  pre_op_checklist: PreOpChecklist | null;
  discharge_summary: DischargeSummary | null;
  vitals?: VitalSigns[] | null;
  created_at: string;
  updated_at: string;
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
    doa:              row.doa,
    dos:              row.dos              ?? undefined,
    plannedDos:       row.planned_dos      ?? undefined,
    dod:              row.dod              ?? undefined,
    pod:              row.pod              ?? undefined,
    pacStatus:        row.pac_status       as Patient['pacStatus'],
    patientStatus:    row.patient_status,
    dailyRounds,
    investigations,
    labResults,
    todos:            Array.isArray(row.todos)            ? row.todos           : [],
    pacChecklist:     row.pac_checklist    ?? undefined,
    preOpChecklist:   migratePreOpChecklist(row.pre_op_checklist),
    dischargeSummary: row.discharge_summary ?? undefined,
    vitals,
  };
}

// ─── TypeScript Patient → DB row ───
// NOTE: daily_rounds and vitals are now written via roundsService / vitalsService.
//       We still write todos here (small JSONB, part of the main patient record).
function patientToRow(patient: Patient) {
  return {
    ip_no:             patient.ipNo,
    abha_id:           patient.abhaId ?? null,
    name:              patient.name,
    mobile:            patient.mobile,
    age:               patient.age,
    gender:            patient.gender,
    ward:              patient.ward,
    bed:               patient.bed,
    unit:              patient.unit ?? null,
    diagnosis:         patient.diagnosis,
    procedure:         patient.procedure        ?? null,
    comorbidities:     patient.comorbidities,
    doa:               patient.doa,
    dos:               patient.dos              ?? null,
    planned_dos:       patient.plannedDos       ?? null,
    dod:               patient.dod              ?? null,
    pod:               patient.pod              ?? null,
    pac_status:        patient.pacStatus,
    patient_status:    patient.patientStatus,
    todos:             patient.todos,
    pac_checklist:     patient.pacChecklist     ?? null,
    pre_op_checklist:  patient.preOpChecklist   ?? null,
    discharge_summary: patient.dischargeSummary ?? null,
    // daily_rounds and vitals intentionally omitted — normalized tables own these
  };
}

// ─── Shared SELECT string ────────────────────────────────────────────────────
// daily_rounds and vitals JSONB columns are excluded — data comes from the
// normalized rounds and patient_vitals tables (joined below).
// The legacy JSONB columns remain in the DB as backup but are not queried.
const PATIENT_SELECT = [
  'ip_no', 'abha_id', 'name', 'mobile', 'age', 'gender', 'ward', 'bed', 'unit',
  'diagnosis', 'procedure', 'comorbidities', 'doa', 'dos', 'planned_dos', 'dod', 'pod',
  'pac_status', 'patient_status', 'todos', 'pac_checklist', 'pre_op_checklist',
  'discharge_summary', 'created_at', 'updated_at',
  // Normalized tables
  'labs(id, date, type, value)',
  'imaging(id, date, type, findings, image_url)',
  'rounds(date, note, todos)',
  'patient_vitals(id, timestamp, recorded_by, bp_systolic, bp_diastolic, heart_rate, temperature, spo2, respiratory_rate, weight, pain_score, notes)',
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
    .select(PATIENT_SELECT)
    .neq('patient_status', 'Discharged')
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
    .select(PATIENT_SELECT)
    .neq('patient_status', 'Discharged')
    .order('created_at', { ascending: false })
    .limit(500);

  if (unit) query = query.eq('unit', unit);
  if (hospitalId) query = query.eq('hospital_id', hospitalId);

  const { data, error } = await query;
  if (error) throw new Error(`fetchActivePatients: ${error.message}`);
  return ((data ?? []) as unknown as PatientRow[]).map(rowToPatient);
}

/**
 * Load ALL patients including discharged — used for Master List & Discharge views.
 * If `unit` is provided, only that unit's patients are returned.
 */
export async function fetchAllPatients(unit?: string, hospitalId?: string): Promise<Patient[]> {
  let query = supabase
    .from('patients')
    .select(PATIENT_SELECT)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (unit) query = query.eq('unit', unit);
  if (hospitalId) query = query.eq('hospital_id', hospitalId);

  const { data, error } = await query;
  if (error) throw new Error(`fetchAllPatients: ${error.message}`);
  return ((data ?? []) as unknown as PatientRow[]).map(rowToPatient);
}

/**
 * Insert or update a patient's core fields.
 * Labs and imaging are NOT written here — use labsService / imagingService.
 * Uses ip_no as the conflict key — safe to call on both create and update.
 */
export async function upsertPatient(patient: Patient): Promise<void> {
  const { error } = await supabase
    .from('patients')
    .upsert(patientToRow(patient), { onConflict: 'ip_no' });

  if (error) throw new Error(`upsertPatient (${patient.ipNo}): ${error.message}`);
}

/** Permanently delete a patient by IP number. */
export async function removePatient(ipNo: string): Promise<void> {
  const { error } = await supabase
    .from('patients')
    .delete()
    .eq('ip_no', ipNo);

  if (error) throw new Error(`removePatient (${ipNo}): ${error.message}`);
}
