/**
 * roundPosition.ts — which patient Round Mode is on.
 *
 * Round Mode used to remember a POSITION in the list ("patient number 5").
 * The list is live: when a colleague admits, moves or discharges someone, it
 * re-sorts, and position 5 silently became a different patient while the
 * doctor was typing an order. Round Mode now remembers the PATIENT (IP number)
 * and only falls back to a position when that patient has left the list.
 */

export interface RoundPosition {
  /** Index of the patient to show, or 0 for an empty list. */
  index: number;
  /** IP number of the patient to show, or null for an empty list. */
  ipNo: string | null;
  /** True when the remembered patient is no longer in the list, so a different one is shown. */
  lost: boolean;
}

/**
 * @param patients     the current list, already in display order
 * @param currentIpNo  the patient Round Mode was last on (null = not started)
 * @param lastIndex    where that patient was in the list last time
 */
export function resolveRoundPosition(
  patients: ReadonlyArray<{ ipNo: string }>,
  currentIpNo: string | null,
  lastIndex: number,
): RoundPosition {
  if (patients.length === 0) return { index: 0, ipNo: null, lost: currentIpNo !== null };

  if (currentIpNo !== null) {
    const found = patients.findIndex(p => p.ipNo === currentIpNo);
    if (found !== -1) return { index: found, ipNo: currentIpNo, lost: false };
  }

  // Not started yet, or the patient left the list: take whoever now stands at
  // the old position (the next bed in order), clamped to the list.
  const safeLast = Number.isFinite(lastIndex) ? Math.trunc(lastIndex) : 0;
  const index = Math.max(0, Math.min(safeLast, patients.length - 1));
  return { index, ipNo: patients[index].ipNo, lost: currentIpNo !== null };
}

/** Minimum sideways travel, in CSS pixels, before a touch counts as "next / previous patient". */
export const SWIPE_MIN_DISTANCE = 70;

/**
 * True only for a deliberate sideways swipe. A scroll that drifts sideways
 * must never change the patient: the movement has to be long enough AND
 * clearly more horizontal than vertical (at least 2:1).
 */
export function isHorizontalSwipe(dx: number, dy: number): boolean {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return ax >= SWIPE_MIN_DISTANCE && ax >= ay * 2;
}
