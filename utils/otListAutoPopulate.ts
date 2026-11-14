import { AuthUser, Patient } from '../types';
import { can } from './permissions';
import { OTType, getOTTypeForDate, isEligibleForOTList } from './otListTypes';

export interface PlannedOTAssignment {
  patient: Patient;
  otType: OTType;
  date: string;
}

/**
 * Finds patients whose plannedDos matches one of the given tab dates and
 * who aren't already represented in `existingIpNos` (already-loaded/
 * already-persisted entries) — the auto-populate effect in
 * OTListManagement.tsx calls this, then persists whatever comes back.
 * Pulled out as a pure function specifically so "doesn't insert a duplicate
 * for a patient already in the list" is unit-testable without rendering
 * the whole component.
 */
export function findNewlyPlannedOTAssignments(
  patients: Patient[],
  existingIpNos: Set<string>,
  tabDates: Array<{ date: string; fallbackType: OTType }>,
): PlannedOTAssignment[] {
  const seen = new Set(existingIpNos);
  const result: PlannedOTAssignment[] = [];
  for (const { date, fallbackType } of tabDates) {
    const dated = patients.filter(p => p.plannedDos === date && isEligibleForOTList(p));
    dated.forEach(p => {
      if (seen.has(p.ipNo)) return;
      seen.add(p.ipNo);
      const unit = (p.unit ?? '').toUpperCase();
      const otType = getOTTypeForDate(unit, date) ?? fallbackType;
      result.push({ patient: p, otType, date });
    });
  }
  return result;
}

/**
 * May the OT list screen add planned patients to the list by itself when
 * this user opens it? Opening a screen must never write for somebody who is
 * not allowed to write (audit SEC-06: for a view-only role the database now
 * refuses that write, and the screen showed the raw refusal).
 *
 *  - no 'otlist:write'            → no. They see the list as it is stored.
 *  - admin looking at "all units" → no. There is no single unit to file the
 *  - superadmin                      patient under; the screen's fallback unit
 *                                    would collect every unit's surgeries.
 * Adding or assigning a patient by hand is not affected.
 */
export function mayAutoAddPlannedPatients(user: AuthUser | null, selectedUnit: string | null | undefined): boolean {
  if (!user || !can(user, 'otlist:write')) return false;
  if (user.role === 'superadmin') return false;
  if (user.role === 'admin' && (!selectedUnit || selectedUnit === 'all')) return false;
  return true;
}
