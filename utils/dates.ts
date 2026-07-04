/**
 * dates.ts — canonical local-date helpers.
 *
 * NEVER use `new Date().toISOString().split('T')[0]` for a calendar date:
 * toISOString() is UTC, which lags IST by 5h30 — between 00:00 and 05:30
 * local time it returns *yesterday*. This has now caused three separate bugs
 * (yesterday-todo alerts, weekend-duty keys, POD column vs POD alerts
 * disagreeing after midnight). All "which day is it" logic goes through here.
 */

/** YYYY-MM-DD of a Date in the device's local timezone. */
export function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today's YYYY-MM-DD in the device's local timezone. */
export function todayYmd(): string {
  return localYmd(new Date());
}
