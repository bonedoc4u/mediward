import { describe, it, expect } from 'vitest';
import { carryOverLabel } from '../utils/todoCarryOver';

describe('carryOverLabel', () => {
  it('is null for a done item, regardless of addedDate', () => {
    expect(carryOverLabel({ isDone: true, addedDate: '2026-08-01' }, '2026-08-11')).toBeNull();
    expect(carryOverLabel({ isDone: true, addedDate: undefined }, '2026-08-11')).toBeNull();
  });

  it('is null for an open item added on the day being viewed', () => {
    expect(carryOverLabel({ isDone: false, addedDate: '2026-08-11' }, '2026-08-11')).toBeNull();
  });

  it('shows a specific "since" date for an open item added on an earlier day', () => {
    expect(carryOverLabel({ isDone: false, addedDate: '2026-08-04' }, '2026-08-11')).toBe('since 04-08');
  });

  it('shows a generic "carried over" label when addedDate is missing entirely', () => {
    // Regression: pre-fix legacy todos have no addedDate at all — showing no
    // badge for them was indistinguishable from "added today", which is the
    // exact confusion this feature exists to resolve (Ayisha Kutty / Sarada).
    expect(carryOverLabel({ isDone: false, addedDate: undefined }, '2026-08-11')).toBe('carried over');
  });
});
