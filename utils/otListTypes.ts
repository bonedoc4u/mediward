import { UNIT_SCHEDULE } from './otSchedule';
import { Patient, PatientStatus } from '../types';
import { hasPendingSurgery } from './calculations';

/**
 * Prefix used to build the drag id for a pending-surgery card (see
 * PendingSurgeryPanel) and to recognise it in OTListManagement's
 * handleDragEnd. Shared here so a rename can't silently desync the two
 * call sites (there is no test that would catch that otherwise).
 */
export const PENDING_ID_PREFIX = 'pending-';

export type OTType = 'Major' | 'Minor' | 'EOT';

export interface OTPatient {
  id: string;
  sequence: number;
  ipNo: string;
  name: string;
  age: string;
  gender: 'M' | 'F' | string;
  ward: string;
  unit: string;
  diagnosis: string;
  procedure: string;
  side: string;
  anesthesia: string;
  cArm: 'Yes' | 'No' | string;
  implants: string;
  remarks: string;
  category?: string; // e.g., "Spinal Table", "Local Table"
  otType: OTType;    // which OT list this entry belongs to
}

export function getOTTypeForDate(unit: string, dateStr: string): OTType | null {
  const s = UNIT_SCHEDULE[unit?.toUpperCase()];
  if (!s) return null;
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  if (dow === s.majorDay)     return 'Major';
  if (dow === s.minorDay)     return 'Minor';
  if (dow === s.admissionDay) return 'EOT';
  return null;
}

export function getTableOptionsForType(otType: OTType): string[] {
  if (otType === 'Major') return ['TABLE 1', 'TABLE 2'];
  if (otType === 'Minor') return ['SPINAL TABLE', 'LOCAL TABLE'];
  return ['SPINAL TABLE']; // EOT — single table
}

export function getDefaultCategoryForType(otType: OTType): string {
  return getTableOptionsForType(otType)[0];
}

/** Same pending-surgery rule as hasPendingSurgery, plus the status
 *  exclusions an OT list specifically needs: a Discharged patient is never
 *  relevant to any future OT list, but a patient who Went Home is still
 *  relevant if they have a genuinely scheduled second surgery (plannedDos) —
 *  unlike the Ward Dashboard's "Pending" tab, which excludes Went Home
 *  unconditionally since that view tracks who's still physically pre-op in
 *  the ward. */
export function isEligibleForOTList(p: Patient): boolean {
  if (p.patientStatus === PatientStatus.Discharged) return false;
  if (p.patientStatus === PatientStatus.WentHome && !p.plannedDos) return false;
  return hasPendingSurgery(p);
}
