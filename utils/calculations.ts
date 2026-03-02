import { Patient, LabResult, LabType, AppNotification, PatientStatus, PacStatus } from '../types';
// Note: Ward display order is now driven by ward_config.sort_order in ConfigContext.
import { generateId } from './sanitize';

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
  return diffDays >= 0 ? diffDays : undefined;
};

export const enrichPatientData = (patients: Patient[]): Patient[] => {
  return patients.map(p => ({
    ...p,
    pod: calculatePOD(p.dos)
  }));
};

// ─── Status Colors ───
export const getStatusColor = (status: string) => {
  if (!status) return 'bg-gray-100 text-gray-800 border-gray-200';
  switch (status.toLowerCase()) {
    case 'pac pending':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'pac fit':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'critical':
      return 'bg-orange-100 text-orange-800 border-orange-200 animate-pulse';
    case 'fit':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'discharge ready':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
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
export const getTriagePriority = (p: Patient): number => {
  if (p.patientStatus === PatientStatus.Critical) return 0;
  if (p.pod === 0) return 1;
  if (p.pod === 1) return 2;
  if (p.pacStatus === PacStatus.Pending) return 3;
  if (p.patientStatus === PatientStatus.Review) return 4;
  if (p.patientStatus === PatientStatus.DischargeReady) return 6;
  return 5;
};

// Returns a left-border Tailwind class reflecting clinical urgency.
export const getTriageBorderClass = (p: Patient): string => {
  if (p.patientStatus === PatientStatus.Critical) return 'border-l-4 border-l-red-500';
  if (p.pod === 0 || p.pod === 1) return 'border-l-4 border-l-amber-400';
  if (p.pacStatus === PacStatus.Pending) return 'border-l-4 border-l-orange-400';
  if (p.patientStatus === PatientStatus.DischargeReady) return 'border-l-4 border-l-emerald-400';
  return 'border-l-4 border-l-slate-100';
};

// ─── Shared Sorting ───
export const sortByBed = (a: Patient, b: Patient): number => {
  const bedA = parseInt(a.bed);
  const bedB = parseInt(b.bed);
  if (isNaN(bedA) && isNaN(bedB)) return a.bed.localeCompare(b.bed);
  if (isNaN(bedA)) return 1;
  if (isNaN(bedB)) return -1;
  return bedA - bedB;
};

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
  const todayStr = today.toISOString().split('T')[0];

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

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

    // 4. PAC Pending for > 3 days
    if (p.pacStatus === 'PAC Pending' && !p.dos) {
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
  }

  return notifications;
}
