import { describe, it, expect } from 'vitest';
import { localYmd, todayYmd, formatDayMonth } from '../utils/dates';

describe('localYmd', () => {
  // The property toISOString() violates: a Date built from local components
  // must format back to those same components, in ANY timezone — including
  // just after local midnight, where the UTC date is still yesterday.
  it('round-trips local date components at local midnight', () => {
    expect(localYmd(new Date(2026, 6, 5, 0, 15))).toBe('2026-07-05');
  });

  it('round-trips just before local midnight', () => {
    expect(localYmd(new Date(2026, 6, 4, 23, 59))).toBe('2026-07-04');
  });

  it('pads single-digit month and day', () => {
    expect(localYmd(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
});

describe('todayYmd', () => {
  it('matches localYmd of now', () => {
    expect(todayYmd()).toBe(localYmd(new Date()));
  });
});

describe('formatDayMonth — the one short date format', () => {
  it('formats a calendar date without a time zone shift', () => {
    expect(formatDayMonth('2026-11-10')).toBe('10 Nov');
    expect(formatDayMonth('2026-01-01')).toBe('1 Jan');
    expect(formatDayMonth('2026-12-31')).toBe('31 Dec');
  });
  it('accepts a full timestamp and uses its date part', () => {
    expect(formatDayMonth('2026-11-10T23:59:00+05:30')).toBe('10 Nov');
  });
  it('returns an empty string for anything it cannot read', () => {
    expect(formatDayMonth(undefined)).toBe('');
    expect(formatDayMonth(null)).toBe('');
    expect(formatDayMonth('10/11/2026')).toBe('');
    expect(formatDayMonth('2026-13-40')).toBe('');
  });
});
