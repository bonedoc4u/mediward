/**
 * patientService.ts
 * All Supabase reads/writes for the patients table.
 * Handles snake_case (DB) ↔ camelCase (app) mapping.
 * Labs and imaging are read via JOIN, written via their own normalized services.
 */

import { supabase } from '../lib/supabase';
import {
  Patient, DailyRound, Investigation, LabResult, ToDoItem,
  PacChecklistItem, PreOpChecklist, DischargeSummary,
} from '../types';

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
  daily_rounds: DailyRound[];
  todos: ToDoItem[];
  pac_checklist: PacChecklistItem[] | null;
  pre_op_checklist: PreOpChecklist | null;
  discharge_summary: DischargeSummary | null;
  created_at: string;
  updated_at: string;
  // Joined relations (present on SELECT queries, absent on Realtime payloads)
  labs?: LabRowRead[] | null;
  imaging?: ImagingRowRead[] | null;
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

  return {
    ipNo:             row.ip_no,
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
    dailyRounds:      Array.isArray(row.daily_rounds)    ? row.daily_rounds    : [],
    investigations,
    labResults,
    todos:            Array.isArray(row.todos)            ? row.todos           : [],
    pacChecklist:     row.pac_checklist    ?? undefined,
    preOpChecklist:   row.pre_op_checklist ?? undefined,
    dischargeSummary: row.discharge_summary ?? undefined,
  };
}

// ─── TypeScript Patient → DB row (labs/imaging excluded — written via services) ───
function patientToRow(patient: Patient): Omit<PatientRow, 'created_at' | 'updated_at' | 'labs' | 'imaging'> {
  return {
    ip_no:             patient.ipNo,
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
    daily_rounds:      patient.dailyRounds,
    todos:             patient.todos,
    pac_checklist:     patient.pacChecklist     ?? null,
    pre_op_checklist:  patient.preOpChecklist   ?? null,
    discharge_summary: patient.dischargeSummary ?? null,
  };
}

// ─── Shared SELECT string (patients columns + joined labs/imaging) ───
const PATIENT_SELECT = [
  'ip_no', 'name', 'mobile', 'age', 'gender', 'ward', 'bed', 'unit', 'diagnosis', 'procedure',
  'comorbidities', 'doa', 'dos', 'planned_dos', 'dod', 'pod', 'pac_status', 'patient_status',
  'daily_rounds', 'todos', 'pac_checklist', 'pre_op_checklist', 'discharge_summary',
  'created_at', 'updated_at',
  'labs(id, date, type, value)',
  'imaging(id, date, type, findings, image_url)',
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
): Promise<{ patients: Patient[]; hasMore: boolean }> {
  const from = page * pageSize;
  const to = from + pageSize; // inclusive, fetches pageSize+1 rows

  let query = supabase
    .from('patients')
    .select(PATIENT_SELECT)
    .neq('patient_status', 'Discharged')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (unit) {
    query = query.eq('unit', unit);
  }

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
export async function fetchActivePatients(unit?: string): Promise<Patient[]> {
  let query = supabase
    .from('patients')
    .select(PATIENT_SELECT)
    .neq('patient_status', 'Discharged')
    .order('created_at', { ascending: false })
    .limit(500);

  if (unit) {
    query = query.eq('unit', unit);
  }

  const { data, error } = await query;
  if (error) throw new Error(`fetchActivePatients: ${error.message}`);
  return ((data ?? []) as unknown as PatientRow[]).map(rowToPatient);
}

/**
 * Load ALL patients including discharged — used for Master List & Discharge views.
 * If `unit` is provided, only that unit's patients are returned.
 */
export async function fetchAllPatients(unit?: string): Promise<Patient[]> {
  let query = supabase
    .from('patients')
    .select(PATIENT_SELECT)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (unit) {
    query = query.eq('unit', unit);
  }

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
