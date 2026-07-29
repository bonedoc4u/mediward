import { Patient, LabResult, LabType, AppNotification, PatientStatus, PacStatus, News2Detail, WardConfig } from '../types';
// Note: Ward display order is now driven by ward_config.sort_order in ConfigContext.
import { generateId } from './sanitize';
import { localYmd } from './otSchedule';

// ─── POD Calculation ───
export const calculatePOD = (dos?: string): number | undefined => {
  if (!dos) return undefined;
  const today = new Date();
  // Append T00:00:00 so YYYY-MM-DD strings are parsed as local time, not UTC.
  // Without this, JavaScript treats bare date strings as UTC midnight,
  // causing off-by-one errors in non-UTC timezones (e.g. IST UTC+5:30).
  const surgeryDate = new Date(dos + 'T00:00:00');
  today.setHours(0, 0, 0, 0);
  surgeryDate.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - surgeryDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  // 1-based: day of surgery = POD 1, matching calcPod in HandoverSummary.
  // Commit 27919b2 moved the app to this convention but missed this function,
  // so p.pod stayed 0-based and triage sorted day-of-surgery patients as stable.
  return diffDays >= 0 ? diffDays + 1 : undefined;
};

export const enrichPatientData = (patients: Patient[]): Patient[] => {
  return patients.map(p => ({
    ...p,
    pod:            calculatePOD(p.dos),
    // Normalise arrays — guard against null/undefined from DB or optimistic new-patient objects
    dailyRounds:   Array.isArray(p.dailyRounds)   ? p.dailyRounds   : [],
    todos:         Array.isArray(p.todos)          ? p.todos          : [],
    labResults:    Array.isArray(p.labResults)     ? p.labResults     : [],
    investigations:Array.isArray(p.investigations) ? p.investigations : [],
    comorbidities: Array.isArray(p.comorbidities)  ? p.comorbidities  : [],
  }));
};

// ─── Status Colors ───
export const getStatusColor = (status: string) => {
  if (!status) return 'bg-slate-100 text-slate-700 border-slate-300';
  switch (status.toLowerCase()) {
    // PAC statuses
    case 'pac pending':
    case 'pending':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'pac fit':
    case 'fit':
      return 'bg-green-100 text-green-800 border-green-300';
    // Bare 'review' belongs to the patient-status group below (amber) —
    // having it here too made that case unreachable, so "Needs Review"
    // patients rendered with PAC-purple badges.
    case 'pac review':
      return 'bg-purple-100 text-purple-800 border-purple-300';
    // Patient statuses
    case 'admitted':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'scheduled':
      return 'bg-violet-100 text-violet-800 border-violet-300';
    case 'in surgery':
    case 'insurgery':
      return 'bg-amber-100 text-amber-900 border-amber-300';
    case 'recovery room':
    case 'recoveryroom':
      return 'bg-teal-100 text-teal-800 border-teal-300';
    case 'icu':
      return 'bg-red-200 text-red-900 border-red-400 font-bold';
    case 'post op':
    case 'postop':
      return 'bg-cyan-100 text-cyan-800 border-cyan-300';
    case 'went home':
      return 'bg-violet-100 text-violet-800 border-violet-300';
    case 'discharged':
      return 'bg-slate-100 text-slate-600 border-slate-300';
    case 'discharge ready':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'critical':
      return 'bg-red-200 text-red-900 border-red-400 animate-pulse';
    case 'review':
      return 'bg-amber-100 text-amber-900 border-amber-300';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300';
  }
};

// ─── Lab Trends ───
export interface LabTrendData {
  latest: number | undefined;
  previous: number | undefined;
  trend: 'up' | 'down' | 'equal' | 'none';
  latestDate: string | undefined;
}

export const getLabTrend = (labResults: LabResult[], type: LabType): LabTrendData => {
  const filtered = labResults
    .filter(r => r.type === type)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (filtered.length === 0) {
    return { latest: undefined, previous: undefined, trend: 'none', latestDate: undefined };
  }

  const latest = filtered[0].value;
  const previous = filtered.length > 1 ? filtered[1].value : undefined;
  let trend: 'up' | 'down' | 'equal' | 'none' = 'none';

  if (previous !== undefined) {
    if (latest > previous) trend = 'up';
    else if (latest < previous) trend = 'down';
    else trend = 'equal';
  }

  return { latest, previous, trend, latestDate: filtered[0].date };
};

// ─── Triage Priority ───
// Returns a sort key: lower = more urgent. Tiebreaker is bed number.
/** Conservatively-managed patients aren't operated, so PAC does not apply:
 *  no PAC badge, no PAC-pending urgency, filters and alerts skip them. */
export const needsPac = (p: Patient): boolean =>
  (p.management ?? 'surgical_fixation') !== 'conservative';

/** Should this patient appear in the OT pending list / ward "Pending" view?
 *  True if never operated, OR already operated but a further surgery has an
 *  outstanding planned date. Safe only because plannedDos is guaranteed to be
 *  cleared the moment its surgery is recorded (see buildSurgeryUpdate) — a
 *  stale leftover plannedDos would otherwise wrongly resurrect a fully-done
 *  patient into these lists. */
export const hasPendingSurgery = (p: Patient): boolean => !p.dos || !!p.plannedDos;

/** When a surgery date is set/corrected directly (e.g. via the Edit Patient
 *  form, rather than the dedicated "Add Surgery" action), any existing
 *  plannedDos on or before that date refers to the surgery just recorded,
 *  not a still-upcoming one — clear it. A plannedDos further in the future
 *  is a genuinely separate second surgery and is left untouched. Without
 *  this, hasPendingSurgery's invariant is violated and an already-operated
 *  patient can be stuck showing as pending indefinitely. */
export const reconcilePlannedDos = (plannedDos: string | undefined, newDos: string | undefined): string | undefined =>
  (plannedDos && newDos && plannedDos <= newDos) ? undefined : plannedDos;

/** Computes the field updates for recording a new (possibly second) surgery.
 *  If the patient already has a current surgery (`dos` set), it is archived
 *  into `priorSurgeries` before being overwritten — this is what lets a
 *  second surgery become "current" without losing the first surgery's data.
 *
 *  Also resets pacStatus/pacFlow/preOpChecklist to a fresh "not yet cleared"
 *  state: these are scalar, not archived per-surgery, so without a reset a
 *  patient who was PAC Fit and fully checklisted for surgery 1 would show as
 *  already cleared for surgery 2 — a false assurance nothing has actually
 *  been checked for the new procedure. */
export const buildSurgeryUpdate = (
  patient: Patient,
  newProcedure: string,
  newDos: string,
): Pick<Patient, 'procedure' | 'dos' | 'plannedDos' | 'priorSurgeries' | 'pacStatus' | 'pacFlow' | 'preOpChecklist'> => ({
  procedure: newProcedure,
  dos: newDos,
  plannedDos: undefined,
  priorSurgeries: patient.dos
    ? [...(patient.priorSurgeries ?? []), { procedure: patient.procedure ?? '', dos: patient.dos }]
    : (patient.priorSurgeries ?? []),
  pacStatus: PacStatus.Pending,
  pacFlow: undefined,
  preOpChecklist: undefined,
});

export const getTriagePriority = (p: Patient): number => {
  if (p.patientStatus === PatientStatus.Critical) return 0;
  if (p.pod === 1) return 1;
  if (p.pod === 2) return 2;
  if (needsPac(p) && p.pacStatus === PacStatus.Pending) return 3;
  if (p.patientStatus === PatientStatus.Review) return 4;
  if (p.patientStatus === PatientStatus.DischargeReady) return 6;
  return 5;
};

// Returns a left-border Tailwind class reflecting clinical urgency.
export const getTriageBorderClass = (p: Patient): string => {
  if (p.patientStatus === PatientStatus.WentHome)   return 'border-l-4 border-l-violet-400';
  if (p.patientStatus === PatientStatus.Critical)   return 'border-l-4 border-l-red-500';
  if (p.pod !== undefined && p.pod <= 2)            return 'border-l-4 border-l-teal-500';
  if (needsPac(p) && p.pacStatus === PacStatus.Pending) return 'border-l-4 border-l-orange-500';
  if (p.patientStatus === PatientStatus.DischargeReady) return 'border-l-4 border-l-emerald-400';
  return 'border-l-4 border-l-slate-100';
};

// ─── Shared Sorting ───
/** True for Varanda Bed labels: VB, VB1, VB-2, vb 3, etc. */
const isVaranda = (bed: string) => /^vb/i.test(bed.trim());

/** Extract numeric bed component — handles "10-05" → 5, "05" → 5, "1A" → NaN */
const bedNum = (bed: string): number => {
  const part = bed.includes('-') ? bed.split('-').pop()! : bed;
  return parseInt(part, 10);
};

export const sortByBed = (a: Patient, b: Patient): number => {
  const va = isVaranda(a.bed);
  const vb = isVaranda(b.bed);
  // Varanda beds always float to the end of their ward
  if (va && vb) return a.bed.localeCompare(b.bed, undefined, { numeric: true });
  if (va) return 1;
  if (vb) return -1;
  // Regular beds: sort numerically, fall back to locale string
  const numA = bedNum(a.bed);
  const numB = bedNum(b.bed);
  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
  if (!isNaN(numA)) return -1;
  if (!isNaN(numB)) return 1;
  return a.bed.localeCompare(b.bed);
};

/**
 * All patients admitted on a given date (Admission List's day cohort),
 * deduplicated and sorted by IP number ascending (earliest-admitted first).
 * Shared between components/AdmissionList.tsx (renders the list) and App.tsx
 * (computes Next/Previous-patient navigation when viewing a patient's detail
 * from that list) — kept here rather than exported from AdmissionList.tsx
 * itself so App.tsx doesn't force AdmissionList's lazy-loaded chunk to load
 * eagerly just to reuse this filter.
 */
export const getAdmissionDayCohort = (patients: Patient[], date: string, unit?: string): Patient[] => {
  const seen = new Set<string>();
  return patients
    .filter(p => {
      if (p.doa !== date) return false;
      if (unit && p.unit && p.unit !== unit) return false;
      if (seen.has(p.ipNo)) return false;
      seen.add(p.ipNo);
      return true;
    })
    .sort((a, b) => {
      const an = parseInt(a.ipNo, 10);
      const bn = parseInt(b.ipNo, 10);
      return isNaN(an) || isNaN(bn) ? a.ipNo.localeCompare(b.ipNo) : an - bn;
    });
};

/**
 * Active wards a patient may be moved to: those serving the patient's own
 * unit, plus shared wards (no `unit` restriction) and ICU. Falls back to
 * every active ward when the patient has no unit assigned.
 */
export const wardOptionsForPatient = (wards: WardConfig[], patientUnit: string | undefined): WardConfig[] => {
  const active = [...wards].filter(w => w.active).sort((a, b) => a.sortOrder - b.sortOrder);
  if (!patientUnit) return active;
  return active.filter(w => !w.unit?.length || w.unit.includes(patientUnit) || w.isIcu);
};

/**
 * True when a diagnosis is a short placeholder code (e.g. "Left", "#NOF")
 * rather than a full write-up — PatientDetail collapses these into a
 * tap-to-expand chip instead of showing them as if they were the real
 * diagnosis. Must be checked against the SAVED diagnosis, never a live
 * typing buffer — any real diagnosis starting with one word of 3+ letters
 * ("Left", "Right", "Fracture"...) matches this pattern for the instant
 * between finishing that word and typing the next one.
 */
export const isShortDiagnosisCode = (diagnosis: string): boolean => /^[#A-Z]\w{2,}$/.test(diagnosis.trim());

export const groupByWard = (patients: Patient[]): Record<string, Patient[]> => {
  const groups: Record<string, Patient[]> = {};
  patients.forEach(p => {
    const ward = p.ward || 'Unknown';
    if (!groups[ward]) groups[ward] = [];
    groups[ward].push(p);
  });
  Object.keys(groups).forEach(key => {
    groups[key].sort(sortByBed);
  });
  return groups;
};

// ─── Notification Generator ───
export function generateNotifications(patients: Patient[]): AppNotification[] {
  const notifications: AppNotification[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  // localYmd, not toISOString(): converting local midnight to UTC shifts the
  // date back a day in IST, so the alert compared against 2 days ago.
  const yesterdayStr = localYmd(yesterday);

  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const activePatients = patients.filter(p => p.patientStatus !== PatientStatus.Discharged);

  for (const p of activePatients) {
    // Normalise arrays — guard against null/undefined coming from Supabase
    const comorbidities = Array.isArray(p.comorbidities) ? p.comorbidities : [];
    const labResults    = Array.isArray(p.labResults)    ? p.labResults    : [];
    const dailyRounds   = Array.isArray(p.dailyRounds)   ? p.dailyRounds   : [];

    // 1. Diabetic protocol - FBS/PPBS every 2 days
    const hasDM = comorbidities.some(c => /dm|diabetes/i.test(c)) ||
                  /diabetes|dm/i.test(p.diagnosis);
    if (hasDM) {
      const latestFBS = labResults
        .filter(r => r.type === 'FBS')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      if (!latestFBS || new Date(latestFBS.date) < twoDaysAgo) {
        notifications.push({
          id: generateId(),
          timestamp: new Date().toISOString(),
          title: `Overdue: FBS/PPBS for ${p.name}`,
          message: `Bed ${p.bed}: Diabetic protocol requires alternate-day glucose monitoring. ${latestFBS ? `Last done: ${latestFBS.date}` : 'No records found.'}`,
          priority: 'high',
          patientId: p.ipNo,
          read: false,
          category: 'lab',
        });
      }
    }

    // 2. Infection protocol - ESR/CRP every 3 days for open fractures
    const hasInfection = /open|infected|cellulitis|abscess|wound/i.test(p.diagnosis);
    if (hasInfection) {
      const latestESR = labResults
        .filter(r => r.type === 'ESR')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      if (!latestESR || new Date(latestESR.date) < threeDaysAgo) {
        notifications.push({
          id: generateId(),
          timestamp: new Date().toISOString(),
          title: `Overdue: ESR/CRP for ${p.name}`,
          message: `Bed ${p.bed}: Infection protocol requires 3-day inflammatory marker tracking.`,
          priority: 'medium',
          patientId: p.ipNo,
          read: false,
          category: 'lab',
        });
      }
    }

    // 3. Incomplete todos from yesterday
    const yesterdayRound = dailyRounds.find(r => r.date === yesterdayStr);
    if (yesterdayRound) {
      const incompleteTodos = yesterdayRound.todos.filter(t => !t.isDone);
      if (incompleteTodos.length > 0) {
        notifications.push({
          id: generateId(),
          timestamp: new Date().toISOString(),
          title: `${incompleteTodos.length} incomplete task(s) from yesterday`,
          message: `Bed ${p.bed} ${p.name}: ${incompleteTodos.map(t => t.task).join(', ')}`,
          priority: 'low',
          patientId: p.ipNo,
          read: false,
          category: 'todo',
        });
      }
    }

    // 4. PAC Pending for > 3 days (not applicable to conservative patients)
    if (needsPac(p) && p.pacStatus === 'PAC Pending' && !p.dos) {
      const admDate = new Date(p.doa);
      const daysSinceAdm = Math.floor((today.getTime() - admDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceAdm >= 3) {
        notifications.push({
          id: generateId(),
          timestamp: new Date().toISOString(),
          title: `PAC still pending: ${p.name}`,
          message: `Bed ${p.bed}: Admitted ${daysSinceAdm} days ago. Anesthesia clearance still pending.`,
          priority: 'medium',
          patientId: p.ipNo,
          read: false,
          category: 'pac',
        });
      }
    }

    // 5. POD milestone alerts
    if (p.pod !== undefined) {
      if (p.pod === 1) {
        notifications.push({
          id: generateId(),
          timestamp: new Date().toISOString(),
          title: `POD 1: ${p.name}`,
          message: `Bed ${p.bed}: First post-op day. Check wound, vitals, drain output.`,
          priority: 'info',
          patientId: p.ipNo,
          read: false,
          category: 'pod',
        });
      }
    }

    // 6. NEWS2 escalation alert
    const vitals = Array.isArray(p.vitals) ? p.vitals : [];
    if (vitals.length > 0) {
      const latestVitals = vitals[0];
      if (latestVitals.news2Score != null && latestVitals.news2Score >= 5) {
        notifications.push({
          id: generateId(),
          timestamp: new Date().toISOString(),
          title: `NEWS2 Alert: ${p.name} (score ${latestVitals.news2Score})`,
          message: `Bed ${p.bed}: NEWS2 score ${latestVitals.news2Score} — ${latestVitals.news2Score >= 7 ? 'HIGH RISK: immediate escalation required.' : 'Medium risk: increase monitoring frequency.'}`,
          priority: 'high',
          patientId: p.ipNo,
          read: false,
          category: 'system',
        });
      }
    }
  }

  return notifications;
}

// ─── NEWS2 Scoring ──────────────────────────────────────────────────────────
// Reference: https://www.rcplondon.ac.uk/projects/outputs/national-early-warning-score-news-2

export function calculateNEWS2(vitals: {
  respiratoryRate?: number;
  spO2?: number;
  supplementalO2?: boolean;
  temperature?: number;
  bpSystolic?: number;
  heartRate?: number;
  consciousness?: 'A' | 'V' | 'P' | 'U' | 'alert' | 'voice' | 'pain' | 'unresponsive';
  /** Use SpO2 Scale 2 for hypercapnic/T2RF/COPD patients with SpO2 target 88–92%. */
  useSpO2Scale2?: boolean;
}): News2Detail | null {
  // All required parameters must be present
  const { respiratoryRate, spO2, temperature, bpSystolic, heartRate } = vitals;
  if (
    respiratoryRate == null || spO2 == null || temperature == null ||
    bpSystolic == null || heartRate == null
  ) return null;

  // Respiratory rate score
  let rrScore = 0;
  if (respiratoryRate <= 8) rrScore = 3;
  else if (respiratoryRate <= 11) rrScore = 1;
  else if (respiratoryRate <= 20) rrScore = 0;
  else if (respiratoryRate <= 24) rrScore = 2;
  else rrScore = 3;

  // SpO2 score — Scale 1 (standard) or Scale 2 (COPD/T2RF, target 88–92%)
  let spO2Score = 0;
  if (vitals.useSpO2Scale2) {
    if (spO2 <= 83) spO2Score = 3;
    else if (spO2 <= 85) spO2Score = 2;
    else if (spO2 <= 87) spO2Score = 1;
    else if (spO2 <= 92) spO2Score = 0; // target range
    else if (vitals.supplementalO2) {
      if (spO2 <= 94) spO2Score = 1;
      else if (spO2 <= 96) spO2Score = 2;
      else spO2Score = 3; // over-oxygenation
    } else {
      spO2Score = 0;
    }
  } else {
    if (spO2 <= 91) spO2Score = 3;
    else if (spO2 <= 93) spO2Score = 2;
    else if (spO2 <= 95) spO2Score = 1;
    else spO2Score = 0;
  }

  // Supplemental O2 score
  const o2Score = vitals.supplementalO2 ? 2 : 0;

  // Temperature score
  let tempScore = 0;
  if (temperature <= 35.0) tempScore = 3;
  else if (temperature <= 36.0) tempScore = 1;
  else if (temperature <= 38.0) tempScore = 0;
  else if (temperature <= 39.0) tempScore = 1;
  else tempScore = 2;

  // Systolic BP score
  let bpScore = 0;
  if (bpSystolic <= 90) bpScore = 3;
  else if (bpSystolic <= 100) bpScore = 2;
  else if (bpSystolic <= 110) bpScore = 1;
  else if (bpSystolic <= 219) bpScore = 0;
  else bpScore = 3;

  // Heart rate score
  let hrScore = 0;
  if (heartRate <= 40) hrScore = 3;
  else if (heartRate <= 50) hrScore = 1;
  else if (heartRate <= 90) hrScore = 0;
  else if (heartRate <= 110) hrScore = 1;
  else if (heartRate <= 130) hrScore = 2;
  else hrScore = 3;

  // Consciousness score (AVPU — A=0, V/P/U=3)
  const avpu = vitals.consciousness?.toLowerCase();
  const consciousnessScore = (!avpu || avpu === 'a' || avpu === 'alert') ? 0 : 3;

  const total = rrScore + spO2Score + o2Score + tempScore + bpScore + hrScore + consciousnessScore;

  let riskLevel: News2Detail['riskLevel'] = 'low';
  if (total === 0) riskLevel = 'low';
  else if (total <= 4) riskLevel = 'low';
  else if (total <= 6) riskLevel = 'medium';
  else if (total >= 7) riskLevel = 'critical';
  // Also critical if any single parameter scores 3
  if ([rrScore, spO2Score, tempScore, bpScore, hrScore, consciousnessScore].some(s => s === 3)) {
    if (riskLevel === 'low') riskLevel = 'medium';
  }

  return {
    respiratoryRate: rrScore,
    spO2Scale1: vitals.useSpO2Scale2 ? 0 : spO2Score,
    spO2Scale2: vitals.useSpO2Scale2 ? spO2Score : 0,
    supplementalO2: o2Score,
    temperature: tempScore,
    systolicBP: bpScore,
    heartRate: hrScore,
    consciousness: consciousnessScore,
    total,
    riskLevel,
  };
}
