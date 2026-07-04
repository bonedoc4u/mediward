import { describe, it, expect } from 'vitest';
import { getWeekendDutyUnit, UNIT_SCHEDULE } from '../utils/otSchedule';

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
