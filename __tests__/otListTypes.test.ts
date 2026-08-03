import { describe, it, expect } from 'vitest';
import { getOTTypeForDate, getTableOptionsForType, getDefaultCategoryForType } from '../utils/otListTypes';

describe('getOTTypeForDate', () => {
  it('returns Major on the unit\'s major OT day', () => {
    // OR1: admit Mon, major Thu, minor Wed (see utils/otSchedule.ts UNIT_SCHEDULE)
    expect(getOTTypeForDate('OR1', '2026-08-06')).toBe('Major'); // a Thursday
  });

  it('returns Minor on the unit\'s minor OT day', () => {
    expect(getOTTypeForDate('OR1', '2026-08-05')).toBe('Minor'); // a Wednesday
  });

  it('returns EOT on the unit\'s admission day', () => {
    expect(getOTTypeForDate('OR1', '2026-08-03')).toBe('EOT'); // a Monday
  });

  it('returns null for an unknown unit', () => {
    expect(getOTTypeForDate('NOT-A-UNIT', '2026-08-03')).toBeNull();
  });
});

describe('getTableOptionsForType', () => {
  it('returns two tables for Major', () => {
    expect(getTableOptionsForType('Major')).toEqual(['TABLE 1', 'TABLE 2']);
  });

  it('returns two tables for Minor', () => {
    expect(getTableOptionsForType('Minor')).toEqual(['SPINAL TABLE', 'LOCAL TABLE']);
  });

  it('returns one table for EOT', () => {
    expect(getTableOptionsForType('EOT')).toEqual(['SPINAL TABLE']);
  });
});

describe('getDefaultCategoryForType', () => {
  it('returns the first table option for the given type', () => {
    expect(getDefaultCategoryForType('Major')).toBe('TABLE 1');
    expect(getDefaultCategoryForType('Minor')).toBe('SPINAL TABLE');
    expect(getDefaultCategoryForType('EOT')).toBe('SPINAL TABLE');
  });
});
