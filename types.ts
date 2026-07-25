export enum Gender {
  Male = "Male",
  Female = "Female",
  Other = "Other"
}

export enum PacStatus {
  Fit     = "PAC Fit",
  Pending = "PAC Pending",
  Unfit   = "PAC Unfit",
  Review  = "PAC Review",
}

export enum PatientStatus {
  Fit = "Fit",
  Review = "Review",
  Critical = "Critical",
  WentHome = "Went Home",
  DischargeReady = "Discharge Ready",
  Discharged = "Discharged"
}

/** Alert thresholds for vital signs. Breach triggers alert notification. */
export interface VitalThresholds {
  spO2Min: number;           // e.g. 90 — alert if SpO2 < 90%
  hrMin: number;             // e.g. 50 — alert if HR < 50
  hrMax: number;             // e.g. 120 — alert if HR > 120
  sbpMin: number;            // e.g. 90 — alert if SBP < 90
  rrMin: number;             // e.g. 10 — alert if RR < 10
  rrMax: number;             // e.g. 30 — alert if RR > 30
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

/** A comorbidity abbreviation → full-name mapping entry. */
export interface ComorbidityEntry {
  /** Abbreviation written on case sheets, e.g. "HTN" */
  short: string;
  /** Full clinical name stored in the patient record, e.g. "Hypertension" */
  full: string;
}

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
  /** Show the Nursing Notes tab in PatientDetail. Off by default. */
  showNursingNotes: boolean;
  /** Show the Medication Chart (MAR) tab in PatientDetail. Off by default. */
  showMedicationChart: boolean;
  /** Show the Intake/Output documentation tab. Off by default. */
  showIntakeOutput: boolean;
  /** Show the Blood Transfusion documentation tab. Off by default. */
  showBloodTransfusion: boolean;
  /** Show the Wound Care documentation tab. Off by default. */
  showWoundCare: boolean;
  /** Show the Wound Assessment field group in Patient Detail. Off by default. */
  showWoundAssessment: boolean;
  /** Show the Rehabilitation field group in Patient Detail. Off by default. */
  showRehabilitation: boolean;
  /** Show the NEWS2 Early Warning Score column and badge. On by default.
   *  Departments that do not use NEWS2 (e.g. outpatient-only units) can hide it. */
  showNews2: boolean;
  /** Admin-defined quick-add shortcuts shown in Ward Rounds to-do section.
   *  E.g. ["IV Fluids", "NBM", "Pre-op prep", "Bloods"]. */
  customTodoShortcuts: string[];
  /** ICU vital sign alert thresholds. Monitored when bedside monitors are connected.
   *  Admins can configure these to match department protocols. */
  vitalThresholds: VitalThresholds;
  /** Short-form → full-name mapping for comorbidities. Used by OCR to normalise
   *  case-sheet abbreviations and by the picker to display compact labels. */
  comorbidityMap?: ComorbidityEntry[];
  /** Admin-assigned weekend emergency-OT duty roster: local date "YYYY-MM-DD"
   *  (Saturday or Sunday) → unit on duty (e.g. "OR4"). Overrides the built-in
   *  rotating fallback for those specific weekends. */
  weekendDuty?: Record<string, string>;
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
  /** Computed NEWS2 total score at time of recording */
  news2Score?: number;
}

export interface News2Detail {
  respiratoryRate: number;   // 0-3
  spO2Scale1: number;        // 0-3
  spO2Scale2: number;        // 0-3 (if on O2)
  supplementalO2: number;    // 0 or 2
  temperature: number;       // 0-3
  systolicBP: number;        // 0-3
  heartRate: number;         // 0-3
  consciousness: number;     // 0 or 3 (AVPU)
  total: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

// ─── Medication Administration Record ────────────────────────────────────────

export type MedRoute = 'Oral' | 'IV' | 'IM' | 'SC' | 'Topical' | 'Inhaled' | 'PR' | 'SL';
export type MedAdminStatus = 'pending' | 'given' | 'held' | 'refused' | 'not_due';

export interface PrescribedMedication {
  id: string;
  hospitalId: string;
  patientIpNo: string;
  drugName: string;
  dose: string;
  route: MedRoute | string;
  frequency: string;
  prescribedAt: string;
  prescribedBy?: string;
  startDate: string;
  stopDate?: string;
  active: boolean;
  notes?: string;
}

export interface MedAdministration {
  id: string;
  hospitalId: string;
  medicationId: string;
  patientIpNo: string;
  scheduledTime?: string;
  administeredAt?: string;
  administeredBy?: string;
  status: MedAdminStatus;
  doseGiven?: string;
  notes?: string;
}

// ─── Nursing Shift Notes ──────────────────────────────────────────────────────

export type NursingShift = 'Morning' | 'Afternoon' | 'Night';

export interface NursingNote {
  id: string;
  hospitalId: string;
  patientIpNo: string;
  shift: NursingShift;
  note: string;
  createdAt: string;
  createdBy?: string;
}

// ─── Intake / Output ─────────────────────────────────────────────────────────

export type IOType = 'intake' | 'output';

export interface IntakeOutputEntry {
  id: string;
  patientIpNo: string;
  recordedAt: string;
  recordedBy?: string;
  type: IOType;
  category: string;
  amountMl: number;
  notes?: string;
  createdAt: string;
}

// ─── Blood Transfusion ────────────────────────────────────────────────────────

export interface BloodTransfusionRecord {
  id: string;
  patientIpNo: string;
  transfusionDate: string;
  bloodProduct: string;
  bloodGroup?: string;
  units: number;
  bagNo?: string;
  startedAt?: string;
  completedAt?: string;
  reaction?: string;
  notes?: string;
  recordedBy?: string;
  createdAt: string;
}

// ─── Wound Care ───────────────────────────────────────────────────────────────

export interface WoundCareRecord {
  id: string;
  patientIpNo: string;
  careDate: string;
  woundSite: string;
  woundType?: string;
  woundCondition?: string;
  dressingType?: string;
  dressingChanged: boolean;
  woundMeasurement?: string;
  exudate?: string;
  notes?: string;
  nextDressingDate?: string;
  recordedBy?: string;
  createdAt: string;
}

export interface Investigation {
  id: string;
  date: string;
  type: string;
  findings: string;
  imageUrl: string;
  /** 'preop' = before surgery, 'postop' = after. Defaults to 'preop' for legacy records. */
  phase?: 'preop' | 'postop';
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

/** Discharge Against Medical Advice documentation template. */
export interface DamaSummary {
  dateTime: string;
  clinicalCondition: string;
  patientReason: string;
  risksExplained: string;
  witnessName: string;
  signatureObtained: boolean;
  attendingDoctor: string;
  residentDoctor: string;
}

/** In-hospital death documentation template (death certificate support). */
export interface DeathSummary {
  dateTimeOfDeath: string;
  immediateCause: string;
  antecedentCause: string;
  underlyingCause: string;
  otherConditions: string;
  clinicalCourse: string;
  unnaturalDeath: boolean;
  policeIntimated: boolean;
  postMortemDone: boolean;
  certificateNo: string;
  attendingDoctor: string;
  residentDoctor: string;
}

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

// ─── Management Plan ─────────────────────────────────────────────────────────
/** Treatment plan selected during rounds. Default is surgical_fixation.
 *  Conservative patients are excluded from the pending (pre-op) list. */
export type ManagementPlan = 'surgical_fixation' | 'conservative';

// ─── Prior Surgery Archive ───────────────────────────────────────────────────────
/** A superseded surgery, archived when a later surgery overwrites `procedure`/`dos`. */
export interface PriorSurgery {
  procedure: string;
  dos: string;
}

// ─── Fracture Classification ─────────────────────────────────────────────────
/** One classification assigned to a fracture, e.g. { system: "Garden", grade: "IV" }.
 *  A single fracture can carry several of these at once (Garden + Pauwels + AO/OTA
 *  are complementary systems doctors commonly record together, not alternatives). */
export interface FractureClassificationEntry {
  system: string;
  grade: string;
}

/** One distinct fracture on a patient. A polytrauma patient can have several. */
export interface Fracture {
  id: string;
  /** Key into the static reference dataset in utils/fractureClassifications.ts, e.g. "nof". */
  region: string;
  side?: 'left' | 'right' | 'bilateral';
  classifications: FractureClassificationEntry[];
}

// ─── PAC Flowchart ───────────────────────────────────────────────────────────
/** One sub-task within a PAC branch (e.g. "Echocardiogram", "Correct Hb to 10") */
export interface PacFlowItem {
  id: string;
  label: string;
  isDone: boolean;
}

/** One clearance branch in the PAC flowchart (e.g. "Medicine Fitness"). */
export interface PacFlowBranch {
  id: string;
  label: string;
  isDone: boolean;
  /** Name of the user who marked this branch cleared (for medico-legal audit). */
  clearedBy?: string;
  /** ISO timestamp when this branch was cleared. */
  clearedAt?: string;
  /** Sub-requirements added by the consulting team. */
  items: PacFlowItem[];
}

/** Full PAC workflow state stored per patient. */
export interface PacFlowData {
  seenByAnaesthesia: boolean;
  seenDate?: string;
  branches: PacFlowBranch[];
}

export type AdmissionSource = 'OPD' | 'Casualty';

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
  /** How the injury occurred — e.g. "RTA", "Slip and Fall", "Fall from Height". */
  modeOfInjury?: string;
  /** Where the patient was referred from for this admission. */
  admissionSource?: AdmissionSource;
  comorbidities: string[];
  /** Known drug allergies — used as a safety gate in the MAR. e.g. ["Penicillin", "NSAIDs"] */
  drugAllergies?: string[];
  doa: string;
  procedure?: string;
  dos?: string;
  plannedDos?: string;
  pod?: number;
  pacStatus: PacStatus;
  pacChecklist?: PacChecklistItem[];
  /** PAC clearance flowchart — branches with sub-items per consultation. */
  pacFlow?: PacFlowData;
  /** Treatment plan: surgical_fixation (default) shows in pending list; conservative does not. */
  management?: ManagementPlan;
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
  damaSummary?: DamaSummary;
  deathSummary?: DeathSummary;
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
  /** Server-side timestamp of last DB update — legacy concurrent-edit lock key, superseded by `version`. */
  updatedAt?: string;
  /** Server-maintained optimistic-lock counter (`patients.version`, bumped by a DB trigger on every UPDATE). Primary concurrent-edit detection key — must be refreshed from the save response after every write. */
  version?: number;
  /**
   * Archive of superseded surgeries. `procedure`/`dos` always represent the
   * CURRENT/most-recent surgery; when a new one is recorded over an existing
   * one, the old {procedure, dos} pair is pushed here first. Most patients
   * have zero entries (only one surgery, ever).
   */
  priorSurgeries?: PriorSurgery[];
  /** Classified fractures — see the Fracture interface. Most patients have one
   *  entry (or zero, if their diagnosis isn't a classified fracture type). */
  fractures?: Fracture[];
  /** Hospital this patient belongs to — required for multi-tenant RLS and cross-user visibility. */
  hospitalId?: string;
  /** DPDP Act 2023: ISO timestamp when informed consent was obtained. */
  consentGivenAt?: string;
  /** DPDP Act 2023: Consent form version at time of consent (e.g. 'v1.0'). */
  consentVersion?: string;
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
  | 'dashboard' | 'pending' | 'master' | 'discharge' | 'wenthome'
  | 'radiology' | 'labs' | 'team' | 'audit'
  | 'rounds' | 'pac' | 'preop' | 'otlist'
  | 'admissions'
  | 'patient' | 'round-mode' | 'settings' | 'status';
