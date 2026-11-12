/**
 * roundNotes.ts — pure helpers for the round note (no React, no network).
 */
import { DailyRound } from '../../../types';

/** Where a note currently is. The screen always shows exactly one of these. */
export type NoteSaveState =
  | 'clean'    // nothing typed that the server does not already have
  | 'dirty'    // typed, not sent yet (kept as a draft on this phone)
  | 'saving'   // request in flight
  | 'saved'    // the server confirmed it
  | 'queued';  // the server could not be reached or refused; kept on this phone, will be sent later

/** Default quick phrases. Tapping one appends it to today's note. */
export const QUICK_PHRASES: readonly string[] = [
  'Afebrile', 'Wound dry', 'Distal NV intact', 'Pain controlled', 'Mobilising with walker', 'Continue same',
];

export const ROUND_NOTE_MAX_LENGTH = 4000; // mirrors chk_round_note_len in the database

const hasNote = (r: DailyRound) => (r.roundNote ?? '').trim() !== '';

/** The round for `today`, if one exists. */
export function findTodayRound(rounds: readonly DailyRound[] | undefined, today: string): DailyRound | undefined {
  return (rounds ?? []).find(r => r.date === today);
}

/**
 * The most recent real note written BEFORE `today` — what the doctor reads
 * first on a round. Days whose round has no note text are skipped, so a
 * weekend gap still shows Friday's note. The legacy `note` field (a copy of
 * the diagnosis) is never treated as a note.
 */
export function findPreviousNote(rounds: readonly DailyRound[] | undefined, today: string): DailyRound | undefined {
  return [...(rounds ?? [])]
    .filter(r => r.date < today && hasNote(r))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** Append a quick phrase as its own sentence. Never duplicates a phrase already in the text. */
export function appendPhrase(text: string, phrase: string): string {
  const trimmed = text.replace(/\s+$/, '');
  if (trimmed.toLowerCase().includes(phrase.toLowerCase())) return text;
  if (trimmed === '') return `${phrase}. `;
  const needsStop = !/[.!?;:]$/.test(trimmed);
  return `${trimmed}${needsStop ? '.' : ''} ${phrase}. `.slice(0, ROUND_NOTE_MAX_LENGTH);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Yesterday", or "11 Nov" for older dates. `date` and `today` are YYYY-MM-DD. */
export function dayLabel(date: string, today: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const diffDays = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86_400_000);
  if (diffDays === 1) return 'Yesterday';
  return `${d} ${MONTHS[m - 1]}`;
}

/** "09:20" in the device's time zone, or '' when the stamp is missing or unreadable. */
export function timeLabel(iso: string | undefined): string {
  if (!iso) return '';
  const t = new Date(iso);
  if (isNaN(t.getTime())) return '';
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

/** "Yesterday · Dr R · 09:20" — parts that are unknown are left out. */
export function noteMeta(round: DailyRound, today: string): string {
  return [dayLabel(round.date, today), round.roundNoteBy, timeLabel(round.roundNoteAt)].filter(Boolean).join(' · ');
}

// ─── Drafts ──────────────────────────────────────────────────────────────────
// What is typed is written to the phone on every keystroke, so a call, a
// crash or a dead battery cannot lose it. The key starts with the date so
// RoundMode's existing clean-up of "mediward_round_draft_<date>…" older than
// two days keeps working.

const DRAFT_PREFIX = 'mediward_round_draft_';
export const draftKey = (date: string, ipNo: string) => `${DRAFT_PREFIX}${date}_${ipNo}`;

export function loadDraft(date: string, ipNo: string): string | null {
  try { return localStorage.getItem(draftKey(date, ipNo)); } catch { return null; }
}

export function saveDraft(date: string, ipNo: string, text: string): void {
  try { localStorage.setItem(draftKey(date, ipNo), text); } catch { /* storage full or blocked */ }
}

export function clearDraft(date: string, ipNo: string): void {
  try { localStorage.removeItem(draftKey(date, ipNo)); } catch { /* ignore */ }
}
