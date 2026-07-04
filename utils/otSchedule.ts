/**
 * otSchedule.ts — single source of truth for the department OT schedule and
 * the rotating weekend-duty roster. Shared by TodaySchedule and the pending-list
 * OT date picker so the calendars can't drift out of sync.
 *
 * JS Date.getDay(): 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
 */

export interface UnitOTSchedule {
  admissionDay: number;
  majorDay: number;
  minorDay: number;
}

export const UNIT_SCHEDULE: Record<string, UnitOTSchedule> = {
  OR1: { admissionDay: 1, majorDay: 4, minorDay: 3 }, // Mon admit · Thu major · Wed minor
  OR2: { admissionDay: 2, majorDay: 5, minorDay: 4 }, // Tue admit · Fri major · Thu minor
  OR3: { admissionDay: 3, majorDay: 1, minorDay: 5 }, // Wed admit · Mon major · Fri minor
  OR4: { admissionDay: 4, majorDay: 2, minorDay: 1 }, // Thu admit · Tue major · Mon minor
  OR5: { admissionDay: 5, majorDay: 3, minorDay: 2 }, // Fri admit · Wed major · Tue minor
};

// 5-week rotating weekend duty, anchored to Saturday 04-Apr-2026
// Decoded from the 3-month duty roster (Apr–Jun 2026)
const SAT_CYCLE = [4, 3, 1, 2, 1]; // OR unit number per week
const SUN_CYCLE = [5, 2, 5, 4, 3];
const ANCHOR_SAT_MS = new Date('2026-04-04').getTime();
const MS_PER_WEEK = 7 * 86_400_000;

/** Which OR unit (e.g. "OR4") is on weekend duty for the given date, or null on a weekday. */
export function getWeekendDutyUnit(date: Date): string | null {
  const dow = date.getDay();
  if (dow !== 0 && dow !== 6) return null;
  const sat = new Date(date);
  if (dow === 0) sat.setDate(sat.getDate() - 1); // Sun → back to Sat
  sat.setHours(0, 0, 0, 0);
  const idx = (((Math.round((sat.getTime() - ANCHOR_SAT_MS) / MS_PER_WEEK)) % 5) + 5) % 5;
  return `OR${dow === 6 ? SAT_CYCLE[idx] : SUN_CYCLE[idx]}`;
}

const ymd = (d: Date): string => d.toISOString().split('T')[0];

/**
 * OT cycle for a unit = the 7-day window starting at the unit's admission day.
 * Anchors to the CURRENT cycle while its major/minor OT days are still ahead;
 * once both have passed, rolls to next week's admission cycle. Returns the
 * cycle's EOT (admission), Major and Minor dates (YYYY-MM-DD).
 */
export function getOTCycleDates(
  unit: string,
  today: Date = new Date(),
): { eotDate: string; majorDate: string; minorDate: string } {
  const s = UNIT_SCHEDULE[unit?.toUpperCase()] ?? UNIT_SCHEDULE['OR1'];
  const base = new Date(today); base.setHours(0, 0, 0, 0);
  // Most recent admission day on or before today.
  const daysSinceAdm = (base.getDay() - s.admissionDay + 7) % 7;
  const adm = new Date(base); adm.setDate(base.getDate() - daysSinceAdm);
  const dateForDow = (from: Date, dow: number) => {
    const off = (dow - s.admissionDay + 7) % 7; // 0..6 within the window
    const d = new Date(from); d.setDate(from.getDate() + off); return d;
  };
  let major = dateForDow(adm, s.majorDay);
  let minor = dateForDow(adm, s.minorDay);
  if (Math.max(major.getTime(), minor.getTime()) < base.getTime()) {
    adm.setDate(adm.getDate() + 7); // this cycle's OT days are done → next week
    major = dateForDow(adm, s.majorDay);
    minor = dateForDow(adm, s.minorDay);
  }
  return { eotDate: ymd(adm), majorDate: ymd(major), minorDate: ymd(minor) };
}
