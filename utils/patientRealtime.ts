/**
 * patientRealtime.ts — how a live patient change updates this phone's list.
 *
 * Pure functions, used by PatientContext's live-update listener. Each returns
 * the new list, or null when the list does not change.
 *
 * Live updates carry only INSERT and UPDATE events: deletion events are
 * switched off in the database because Supabase cannot apply access rules to
 * them (they would leak other hospitals' IP numbers). The app never
 * hard-deletes a patient; "remove" sets deleted_at, which arrives as an
 * UPDATE. So a patient leaves this list when an UPDATE shows it is no longer
 * visible here (removed, moved to another unit, or out of this user's access).
 */
import type { Patient } from '../types';

/** A new patient in this phone's scope: add it unless it is already listed. */
export function applyPatientInsert(prev: Patient[], fresh: Patient): Patient[] | null {
  if (prev.some(p => p.ipNo === fresh.ipNo)) return null;
  return [fresh, ...prev];
}

/**
 * A changed patient: replace it, keeping the sub-records loaded on this phone
 * (labs, investigations, rounds, vitals). Handles an IP-number change, where
 * the event carries the OLD ip_no (REPLICA IDENTITY DEFAULT). A patient that
 * is in neither form on this phone (outside the loaded page or unit) is left
 * alone; the INSERT path is what brings a new patient into scope.
 */
export function applyPatientUpdate(prev: Patient[], fresh: Patient, oldIpNo?: string): Patient[] | null {
  const renamed = !!oldIpNo && oldIpNo !== fresh.ipNo;
  const currentEntry = prev.find(p => p.ipNo === fresh.ipNo);
  const oldEntry = renamed ? prev.find(p => p.ipNo === oldIpNo) : undefined;
  const source = currentEntry ?? oldEntry;
  if (!source) return null;
  const merged: Patient = {
    ...fresh,
    labResults:     source.labResults,
    investigations: source.investigations,
    dailyRounds:    source.dailyRounds,
    vitals:         source.vitals,
  };
  const withoutStaleEntry = oldEntry ? prev.filter(p => p.ipNo !== oldIpNo) : prev;
  return currentEntry
    ? withoutStaleEntry.map(p => (p.ipNo === fresh.ipNo ? merged : p))
    : [merged, ...withoutStaleEntry];
}

/**
 * A patient that changed but is no longer visible here (removed, moved to
 * another unit, or no longer readable): take it off the list. Both the new
 * and, for an IP-number change, the old number are removed.
 */
export function removePatientsFromList(prev: Patient[], ipNos: (string | undefined | null)[]): Patient[] | null {
  const gone = new Set(ipNos.filter((n): n is string => !!n));
  if (gone.size === 0) return null;
  const next = prev.filter(p => !gone.has(p.ipNo));
  return next.length === prev.length ? null : next;
}
