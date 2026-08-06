import { UNIT_SCHEDULE } from './otSchedule';

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
  otListId?: string; // set once persisted (see services/otListService.ts) — absent for an entry still mid-save
  version?: number;  // optimistic-lock counter — absent for an entry still mid-save
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

export interface OTListMeta {
  id: string;
  surgeon: string;
  surgeonUnit: string;
  otTime: string;
  version: number;
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
