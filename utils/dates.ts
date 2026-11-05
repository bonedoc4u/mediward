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

/** Parses YYYY-MM-DD as a LOCAL calendar date (`new Date('2026-11-03')` is UTC midnight). */
function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** "3 Nov" for a YYYY-MM-DD date; returns the input unchanged if it isn't one. */
export function shortDate(ymd: string): string {
  const d = parseYmd(ymd);
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ymd;
}

/** "Today", "Yesterday", otherwise shortDate() — relative to `today` (YYYY-MM-DD). */
export function relativeDayLabel(ymd: string, today: string): string {
  if (ymd === today) return 'Today';
  const t = parseYmd(today);
  if (t) {
    t.setDate(t.getDate() - 1);
    if (localYmd(t) === ymd) return 'Yesterday';
  }
  return shortDate(ymd);
}
