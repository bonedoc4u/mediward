import { describe, it, expect } from 'vitest';
import { getWeekendDutyUnit, getOTCycleDates, UNIT_SCHEDULE } from '../utils/otSchedule';

describe('getWeekendDutyUnit', () => {
  it('returns null on weekdays', () => {
    // 06-Apr-2026 is a Monday
    expect(getWeekendDutyUnit(new Date('2026-04-06T09:00:00'))).toBeNull();
  });

  it('maps the anchor weekend correctly (Sat 04-Apr-2026 → OR4, Sun 05-Apr → OR5)', () => {
    expect(getWeekendDutyUnit(new Date('2026-04-04T09:00:00'))).toBe('OR4');
    expect(getWeekendDutyUnit(new Date('2026-04-05T09:00:00'))).toBe('OR5');
  });

  it('rotates on a 5-week cycle (Sat +5 weeks == same unit)', () => {
    const sat = new Date('2026-04-04T09:00:00');
    const fiveWeeksLater = new Date(sat.getTime() + 5 * 7 * 86_400_000);
    expect(getWeekendDutyUnit(fiveWeeksLater)).toBe(getWeekendDutyUnit(sat));
  });

  it('week 2 Saturday (11-Apr-2026) → OR3', () => {
    expect(getWeekendDutyUnit(new Date('2026-04-11T09:00:00'))).toBe('OR3');
  });

  it('every unit has a full OT schedule', () => {
    expect(Object.keys(UNIT_SCHEDULE)).toHaveLength(5);
  });
});

describe('getOTCycleDates', () => {
  // Timezone-invariant helpers: differences survive any toISOString offset.
  const parse = (s: string) => new Date(s + 'T00:00:00');
  const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);

  it('returns three YYYY-MM-DD dates', () => {
    const r = getOTCycleDates('OR2', new Date(2026, 6, 1, 9));
    for (const d of [r.eotDate, r.majorDate, r.minorDate]) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('major & minor fall within the 7-day window after the EOT/admission day', () => {
    const r = getOTCycleDates('OR2', new Date(2026, 6, 1, 9));
    expect(daysBetween(r.eotDate, r.majorDate)).toBeGreaterThanOrEqual(1);
    expect(daysBetween(r.eotDate, r.majorDate)).toBeLessThanOrEqual(6);
    expect(daysBetween(r.eotDate, r.minorDate)).toBeGreaterThanOrEqual(1);
    expect(daysBetween(r.eotDate, r.minorDate)).toBeLessThanOrEqual(6);
  });

  it('rolls forward by exactly 7 days one week later', () => {
    const a = getOTCycleDates('OR2', new Date(2026, 6, 6, 9));  // Mon 06-Jul
    const b = getOTCycleDates('OR2', new Date(2026, 6, 13, 9)); // Mon 13-Jul
    expect(daysBetween(a.eotDate, b.eotDate)).toBe(7);
    expect(daysBetween(a.majorDate, b.majorDate)).toBe(7);
    expect(daysBetween(a.minorDate, b.minorDate)).toBe(7);
  });

  it('unknown unit falls back to a valid cycle', () => {
    const r = getOTCycleDates('OR9', new Date(2026, 6, 1, 9));
    expect(r.eotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('includes a weekend EOT date when the unit is on weekend duty that cycle', () => {
    // Week of Sat 04-Apr-2026: Saturday duty = OR4. OR4 admits Thu (02-Apr),
    // so its 7-day window includes that Saturday.
    const r = getOTCycleDates('OR4', new Date(2026, 3, 2, 9));
    expect(r.eotWeekendDates.length).toBeGreaterThanOrEqual(1);
  });

  it('has no weekend EOT date when the unit is not on weekend duty that cycle', () => {
    // Same week: OR3 (admits Wed) is on neither Sat(OR4) nor Sun(OR5) duty.
    const r = getOTCycleDates('OR3', new Date(2026, 3, 1, 9));
    expect(r.eotWeekendDates).toEqual([]);
  });
});
