import { Patient } from '../types';
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
