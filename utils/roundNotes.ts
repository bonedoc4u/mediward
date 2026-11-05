import type { DailyRound } from '../types';

/**
 * The most recent round note that actually has text, or null.
 *
 * Rounds are keyed by YYYY-MM-DD, so string comparison orders them. A round
 * created only to hold to-dos (empty note) is skipped so the card shows the
 * last thing someone wrote, not a blank.
 */
export function latestRoundNote(rounds: DailyRound[] | undefined): { date: string; note: string } | null {
  let latest: DailyRound | null = null;
  for (const r of rounds ?? []) {
    if (!r.note?.trim()) continue;
    if (!latest || r.date > latest.date) latest = r;
  }
  return latest ? { date: latest.date, note: latest.note.trim() } : null;
}
