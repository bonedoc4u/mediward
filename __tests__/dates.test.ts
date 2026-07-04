import { describe, it, expect } from 'vitest';
import { localYmd, todayYmd } from '../utils/dates';

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
