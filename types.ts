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

export interface LabResult {
  id: string;
  date: string;
  type: LabType;
  value: number;
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

export interface PreOpChecklist {
  cefuroxime: boolean;
  consent: boolean;
  cbd: boolean;
  preOpXray: boolean;
  preOpOrder: boolean;
  things: boolean;
  implantOrder: boolean;
  cSample: boolean;
  shave: boolean;
  phoneNo: string;
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
}

export interface Patient {
  bed: string;
  ward: Ward;
  /** Unit this patient belongs to (e.g. "OR1", "OR2"). Determines which team can see them. */
  unit?: string;
  ipNo: string;
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
  patientStatus: string;
  dailyRounds: DailyRound[];
  investigations: Investigation[];
  labResults: LabResult[];
  todos: ToDoItem[];
  preOpChecklist?: PreOpChecklist;
  dod?: string;
  dischargeSummary?: DischargeSummary;
}

// ─── Auth Types ───
export type UserRole = 'attending' | 'resident' | 'house_surgeon' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  ward?: Ward;
  /** Unit assignment (e.g. "OR1"). Null/undefined means admin — sees all patients. */
  unit?: string;
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
  passwordHash: string;
}

// ─── Audit Types ───
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

// ─── Notification Types ───
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

// ─── Route Types ───
export type ViewMode =
  | 'dashboard' | 'pending' | 'master' | 'discharge'
  | 'radiology' | 'labs' | 'team' | 'audit'
  | 'rounds' | 'pac' | 'preop' | 'otlist'
  | 'patient' | 'round-mode' | 'settings';
