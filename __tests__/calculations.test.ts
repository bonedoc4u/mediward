import { describe, it, expect } from 'vitest';
import { calculatePOD, getStatusColor, sortByBed } from '../utils/calculations';
import type { Patient } from '../types';

/** Minimal Patient stub — sortByBed only reads `bed`. */
const bedPatient = (bed: string): Patient => ({ bed } as Patient);

/** Returns a YYYY-MM-DD string in local timezone (avoids UTC off-by-one in IST/non-UTC envs). */
function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('calculatePOD', () => {
  it('returns 0 when DOS is today', () => {
    const today = localDate(new Date());
    expect(calculatePOD(today)).toBe(0);
  });

  it('returns correct POD for a past date', () => {
    const threeDaysAgo = localDate(new Date(Date.now() - 3 * 86_400_000));
    expect(calculatePOD(threeDaysAgo)).toBe(3);
  });

  it('returns undefined for a future DOS (not yet operated)', () => {
    const tomorrow = localDate(new Date(Date.now() + 86_400_000));
    expect(calculatePOD(tomorrow)).toBeUndefined();
  });

  it('returns undefined when no DOS is provided', () => {
    expect(calculatePOD(undefined)).toBeUndefined();
  });
});

describe('sortByBed (round-mode / dashboard ordering)', () => {
  it('orders beds numerically ascending, not lexicographically', () => {
    const beds = ['10', '2', '1', '21', '3'].map(bedPatient);
    const sorted = [...beds].sort(sortByBed).map(p => p.bed);
    expect(sorted).toEqual(['1', '2', '3', '10', '21']);
  });

  it('floats varanda beds to the end of the ward', () => {
    const beds = ['VB2', '5', 'VB1', '1'].map(bedPatient);
    const sorted = [...beds].sort(sortByBed).map(p => p.bed);
    expect(sorted).toEqual(['1', '5', 'VB1', 'VB2']);
  });
});

describe('getStatusColor', () => {
  it('returns red classes for PAC Pending', () => {
    const result = getStatusColor('PAC Pending');
    expect(result).toContain('red');
  });

  it('returns green classes for PAC Fit', () => {
    const result = getStatusColor('PAC Fit');
    expect(result).toContain('green');
  });

  it('returns orange + animate-pulse for Critical', () => {
    const result = getStatusColor('Critical');
    expect(result).toContain('orange');
    expect(result).toContain('animate-pulse');
  });

  it('returns grey/default for unknown status', () => {
    const result = getStatusColor('Unknown Status');
    expect(result).toContain('gray');
  });

  it('is case-insensitive', () => {
    expect(getStatusColor('pac fit')).toBe(getStatusColor('PAC Fit'));
  });
});
