import { describe, it, expect, beforeEach } from 'vitest';
import {
  findTodayRound, findPreviousNote, appendPhrase, dayLabel, timeLabel, noteMeta,
  draftKey, loadDraft, saveDraft, clearDraft, ROUND_NOTE_MAX_LENGTH,
} from '../src/features/rounds/roundNotes';
import { DailyRound } from '../types';

const TODAY = '2026-11-13';
const round = (date: string, roundNote?: string, extra: Partial<DailyRound> = {}): DailyRound =>
  ({ date, note: '# Neck of femur (R)', todos: [], roundNote, ...extra });

describe('findPreviousNote — what the doctor reads first', () => {
  it('returns the most recent note written before today', () => {
    const rounds = [round('2026-11-10', 'older'), round('2026-11-12', 'yesterday'), round(TODAY, 'today')];
    expect(findPreviousNote(rounds, TODAY)?.roundNote).toBe('yesterday');
  });

  it('skips days without a note, so Monday still shows Friday', () => {
    const rounds = [round('2026-11-10', 'friday note'), round('2026-11-11', ''), round('2026-11-12')];
    expect(findPreviousNote(rounds, TODAY)?.date).toBe('2026-11-10');
  });

  // Regression: every old row holds a copy of the diagnosis in `note`.
  // That must never be shown as if a doctor had written it.
  it('never treats the legacy diagnosis copy as a note', () => {
    expect(findPreviousNote([round('2026-11-12')], TODAY)).toBeUndefined();
    expect(findPreviousNote([round('2026-11-12', '   ')], TODAY)).toBeUndefined();
  });

  it('ignores today and handles a missing list', () => {
    expect(findPreviousNote([round(TODAY, 'today')], TODAY)).toBeUndefined();
    expect(findPreviousNote(undefined, TODAY)).toBeUndefined();
  });
});

describe('findTodayRound', () => {
  it('finds the round for today only', () => {
    expect(findTodayRound([round('2026-11-12', 'y'), round(TODAY, 't')], TODAY)?.roundNote).toBe('t');
    expect(findTodayRound([round('2026-11-12', 'y')], TODAY)).toBeUndefined();
  });
});

describe('appendPhrase', () => {
  it('starts a note', () => expect(appendPhrase('', 'Afebrile')).toBe('Afebrile. '));
  it('adds a sentence, closing the previous one', () => {
    expect(appendPhrase('Wound dry', 'Afebrile')).toBe('Wound dry. Afebrile. ');
    expect(appendPhrase('Wound dry. ', 'Afebrile')).toBe('Wound dry. Afebrile. ');
  });
  it('does not repeat a phrase that is already there', () => {
    expect(appendPhrase('Afebrile. Wound dry.', 'afebrile')).toBe('Afebrile. Wound dry.');
  });
  it('never exceeds the database limit', () => {
    expect(appendPhrase('x'.repeat(ROUND_NOTE_MAX_LENGTH - 3), 'Afebrile').length).toBe(ROUND_NOTE_MAX_LENGTH);
  });
});

describe('labels', () => {
  it('says Yesterday for the day before, a date otherwise', () => {
    expect(dayLabel('2026-11-12', TODAY)).toBe('Yesterday');
    expect(dayLabel('2026-11-10', TODAY)).toBe('10 Nov');
    expect(dayLabel('2026-10-31', '2026-11-01')).toBe('Yesterday');
  });
  it('formats the time in local 24-hour form and tolerates a missing stamp', () => {
    expect(timeLabel(new Date(2026, 10, 12, 9, 5).toISOString())).toBe('09:05');
    expect(timeLabel(undefined)).toBe('');
    expect(timeLabel('not a date')).toBe('');
  });
  it('leaves out unknown parts of the heading', () => {
    const at = new Date(2026, 10, 12, 9, 20).toISOString();
    expect(noteMeta(round('2026-11-12', 'n', { roundNoteBy: 'Dr R', roundNoteAt: at }), TODAY)).toBe('Yesterday · Dr R · 09:20');
    expect(noteMeta(round('2026-11-12', 'n'), TODAY)).toBe('Yesterday');
  });
});

describe('drafts', () => {
  beforeEach(() => localStorage.clear());
  it('keeps one draft per patient per day', () => {
    saveDraft(TODAY, 'IP-1', 'for one');
    saveDraft(TODAY, 'IP-2', 'for two');
    expect(loadDraft(TODAY, 'IP-1')).toBe('for one');
    expect(loadDraft(TODAY, 'IP-2')).toBe('for two');
    expect(loadDraft('2026-11-12', 'IP-1')).toBeNull();
    clearDraft(TODAY, 'IP-1');
    expect(loadDraft(TODAY, 'IP-1')).toBeNull();
  });
  it('uses a key that starts with the date, so the 2-day clean-up in Round Mode finds it', () => {
    expect(draftKey(TODAY, 'IP-1')).toBe('mediward_round_draft_2026-11-13_IP-1');
  });
});
