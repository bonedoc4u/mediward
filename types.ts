export enum Gender {
  Male = "Male",
  Female = "Female",
  Other = "Other"
}

export enum PacStatus {
  Fit = "PAC Fit",
  Pending = "PAC Pending",
  Unfit = "PAC Unfit"
}

export enum PatientStatus {
  Fit = "Fit",
  Review = "Review",
  Critical = "Critical",
  DischargeReady = "Discharge Ready",
  Discharged = "Discharged"
}

/** Ward name — now a plain string fed from the ward_config database table. */
export type Ward = string;

/** A customer hospital registered in the hospitals table. */
export interface Hospital {
  id: string;
  name: string;
  slug?: string;
  plan: 'trial' | 'basic' | 'pro';
  status: 'active' | 'suspended';
  trialEndsAt?: string;
  createdAt: string;
}

/** Lab test name — now a plain string fed from the lab_type_config database table. */
export type LabType = string;

/** Hospital-level configuration stored in the hospital_config table. */
export interface HospitalConfig {
  hospitalName: string;
  /** Clinical department name, e.g. "DEPARTMENT OF ORTHOPAEDICS". */
  department: string;
  /** Clinical units in this department, e.g. ["OR1", "OR2", "OR3", "OR4", "OR5"]. */
  units: string[];
  /** Label for the pre-op clearance module, e.g. "PAC Status" or "Pre-admission". */
  preOpModuleName: string;
  /** Label for the procedure list module, e.g. "OT List" or "Procedure List". */
  procedureListName: string;
  /** Configurable pre-op checklist items shown in the Pre-Op Prep screen.
   *  Admin can customise per department. Defaults to orthopaedic items. */
  preOpChecklistTemplate: string[];
}

/** A ward row from the ward_config table. */
export interface WardConfig {
  id: string;
  name: string;
  sortOrder: number;
  isIcu: boolean;
  active: boolean;
  /** Clinical units this ward serves (e.g. ["OR1","OR2"]). undefined/empty = shared ward (all units). */
  unit?: string[];
}

/** A lab test row from the lab_type_config table. */
export interface LabTypeConfig {
  id: string;
  name: string;
  unit: string;
  /** Value above this is highlighted red in Lab Trends. null = no threshold. */
  alertHigh: number | null;
  category: string;
  sortOrder: number;
  active: boolean;
}

/** A medication row from the medication_config table. */
export interface MedicationConfig {
  id: string;
  name: string;      // generic name
  brand: string;     // brand name (may be empty)
  category: string;  // e.g. Analgesic, Antibiotic
  form: string;      // Tablet, Capsule, Syrup, Injection, etc.
  strength: string;  // default strength e.g. "500mg"
  sortOrder: number;
  active: boolean;
}

// ─── Specialty Template Types ────────────────────────────────────────────────

export type SpecialtyFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'boolean'
  | 'score'
  | 'date'
  | 'multi_select';

export interface SpecialtyField {
  key: string;
  label: string;
  type: SpecialtyFieldType;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
  placeholder?: string;
  required?: boolean;
}

export interface SpecialtyFieldGroup {
  key: string;
  label: string;
  icon?: string;
  fields: SpecialtyField[];
}

/**
 * Per-hospital customisation of a specialty template.
 * Stored in the department_templates table.
 * fieldGroups fully overrides the default template when present.
 */
export interface DepartmentTemplateOverride {
  id: string;
  hospitalId: string;
  specialty: string;
  /** Full field group override — replaces default template groups. */
  fieldGroups: SpecialtyFieldGroup[];
  updatedAt: string;
}

// ─── SBAR Handover ────────────────────────────────────────────────────────────

export interface SBARHandover {
  id: string;
  patientIpNo: string;
  hospitalId?: string;
  shift: 'morning' | 'evening' | 'night';
  handoverAt: string;
  handingOverBy: string;
  handingOverByName: string;
  receivedBy?: string;
  /** Situation — what is happening RIGHT NOW */
  situation: string;
  /** Background — admission diagnosis, key history, surgery performed */
  background: string;
  /** Assessment — current clinical status, trends, concerns */
  assessment: string;
  /** Recommendation — what the incoming team must watch/do */
  recommendation: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
}

// ─── Inter-departmental Consult ───────────────────────────────────────────────

export interface ConsultRequest {
  id: string;
  patientIpNo: string;
  hospitalId?: string;
  patientName: string;
  requestingDept: string;
  targetDept: string;
  urgency: 'routine' | 'urgent' | 'stat';
  clinicalQuestion: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  status: 'pending' | 'seen' | 'responded';
  response?: string;
  respondedBy?: string;
  respondedByName?: string;
  respondedAt?: string;
}

// ─── Lab & Investigation ──────────────────────────────────────────────────────

export interface LabResult {
  id: string;
  date: string;
  type: LabType;
  value: number;
}

/**
 * Vital signs observation recorded by nursing staff.
 * All numeric fields are optional — a partial observation is still valid.
 */
export interface VitalSigns {
  id: string;
  /** ISO 8601 datetime, e.g. "2026-03-04T08:30:00" */
  timestamp: string;
  recordedBy?: string;
  /** Systolic blood pressure in mmHg */
  bpSystolic?: number;
  /** Diastolic blood pressure in mmHg */
  bpDiastolic?: number;
  /** Heart rate in beats per minute */
  heartRate?: number;
  /** Temperature in °C */
  temperature?: number;
  /** Peripheral oxygen saturation % */
  spo2?: number;
  /** Respiratory rate in breaths/min */
  respiratoryRate?: number;
  /** Weight in kg */
  weight?: number;
  /** Pain score 0–10 (VAS) */
  painScore?: number;
  notes?: string;
}

export interface Investigation {
  id: string;
  date: string;
  type: string;
  findings: string;
  imageUrl: string;
}

export interface ToDoItem {
  id: string;
  task: string;
  isDone: boolean;
}

export interface PacChecklistItem {
  id: string;
  task: string;
  isDone: boolean;
}

export interface DailyRound {
  date: string;
  note: string;
  todos: ToDoItem[];
}

/** Pre-op checklist — dynamic list, same structure as PacChecklistItem.
 *  Replaces the old hardcoded 9-boolean orthopaedic-specific interface.
 *  Old data (object format) is auto-migrated in patientService.rowToPatient. */
export type PreOpChecklist = PacChecklistItem[];

export interface DischargeSummary {
  hospitalCourse: string;
  conditionAtDischarge: string;
  dischargeMedications: string;
  followUpInstructions: string;
  followUpDate: string;
  woundCare: string;
  restrictions: string;
  attendingDoctor: string;
  residentDoctor: string;
  /** ICD-10 / ICD-11 primary diagnosis code (e.g. "S72.0 — Fracture of neck of femur") */
  icd10Code?: string;
  /** ICD-10 / ICD-11 secondary / comorbidity codes (comma-separated) */
  icd10Secondary?: string;
  /** Structured final diagnosis text (may differ from admission diagnosis) */
  finalDiagnosis?: string;
}

export interface Patient {
  bed: string;
  ward: Ward;
  /** Unit this patient belongs to (e.g. "OR1", "OR2"). Determines which team can see them. */
  unit?: string;
  ipNo: string;
  /** Ayushman Bharat Health Account (ABHA) 14-digit ID — used for FHIR/NDHM interoperability. */
  abhaId?: string;
  name: string;
  mobile: string;
  age: number;
  gender: Gender;
  diagnosis: string;
  comorbidities: string[];
  doa: string;
  procedure?: string;
  dos?: string;
  plannedDos?: string;
  pod?: number;
  pacStatus: PacStatus;
  pacChecklist?: PacChecklistItem[];
  /** Fixed to PatientStatus enum — was incorrectly typed as `string` (P0 fix). */
  patientStatus: PatientStatus;
  dailyRounds: DailyRound[];
  investigations: Investigation[];
  labResults: LabResult[];
  todos: ToDoItem[];
  preOpChecklist?: PreOpChecklist;
  /** Vital signs observations — newest first. Recorded by nursing staff. */
  vitals?: VitalSigns[];
  dod?: string;
  dischargeSummary?: DischargeSummary;
  /**
   * Specialty key — determines which template is used for specialtyData rendering.
   * Stored in the `specialty` column of the patients table.
   */
  specialty?: string;
  /**
   * Specialty-specific clinical data (JSONB in DB).
   * Keys and schema are defined by the specialty template for this patient's department.
   */
  specialtyData?: Record<string, unknown>;
  /** Server-side timestamp of last DB update — used for concurrent-edit detection. */
  updatedAt?: string;
}

// ─── Auth Types ───────────────────────────────────────────────────────────────

export type UserRole = 'attending' | 'resident' | 'house_surgeon' | 'admin' | 'superadmin';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  ward?: Ward;
  /** Unit assignment (e.g. "OR1"). Null/undefined means admin — sees all patients. */
  unit?: string;
  /** Hospital this user belongs to. Used to scope all DB queries via RLS. */
  hospitalId: string;
  sessionExpiry: number;
}

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  ward?: Ward;
  /** Unit assignment (e.g. "OR1"). Null/undefined means admin — sees all patients. */
  unit?: string;
  /** Hospital this user belongs to. */
  hospitalId: string;
  passwordHash: string;
}

// ─── Audit Types ──────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'VIEW' | 'EXPORT';
  entity: string;
  entityId: string;
  details: string;
}

// ─── Notification Types ───────────────────────────────────────────────────────

export type NotificationPriority = 'high' | 'medium' | 'low' | 'info';

export interface AppNotification {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  priority: NotificationPriority;
  patientId?: string;
  read: boolean;
  category: 'lab' | 'pac' | 'todo' | 'system' | 'pod';
}

// ─── Route Types ──────────────────────────────────────────────────────────────

export type ViewMode =
  | 'dashboard' | 'pending' | 'master' | 'discharge'
  | 'radiology' | 'labs' | 'team' | 'audit'
  | 'rounds' | 'pac' | 'preop' | 'otlist'
  | 'patient' | 'round-mode' | 'settings' | 'status';
