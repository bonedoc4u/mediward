import { describe, it, expect } from 'vitest';
import { calculatePOD, getStatusColor, sortByBed, wardOptionsForPatient } from '../utils/calculations';
import type { Patient, WardConfig } from '../types';

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
  // POD is 1-based app-wide: day of surgery = POD 1 (commit 27919b2).
  it('returns 1 when DOS is today (day of surgery)', () => {
    const today = localDate(new Date());
    expect(calculatePOD(today)).toBe(1);
  });

  it('returns correct 1-based POD for a past date', () => {
    const threeDaysAgo = localDate(new Date(Date.now() - 3 * 86_400_000));
    expect(calculatePOD(threeDaysAgo)).toBe(4);
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

  it('returns red + animate-pulse for Critical', () => {
    const result = getStatusColor('Critical');
    expect(result).toContain('red');
    expect(result).toContain('animate-pulse');
  });

  it('returns slate/default for unknown status', () => {
    const result = getStatusColor('Unknown Status');
    expect(result).toContain('slate');
  });

  it('is case-insensitive', () => {
    expect(getStatusColor('pac fit')).toBe(getStatusColor('PAC Fit'));
  });
});

describe('wardOptionsForPatient (Move Bed ward picker)', () => {
  const ward = (name: string, overrides: Partial<WardConfig> = {}): WardConfig => ({
    id: name, name, sortOrder: 0, isIcu: false, active: true, ...overrides,
  });

  const wards: WardConfig[] = [
    ward('OR1 Ward', { unit: ['OR1'], sortOrder: 1 }),
    ward('OR2 Ward', { unit: ['OR2'], sortOrder: 2 }),
    ward('Shared Ward', { sortOrder: 3 }),          // no unit = shared, all units
    ward('ICU', { isIcu: true, sortOrder: 4 }),      // ICU always included
    ward('Inactive OR1 Ward', { unit: ['OR1'], active: false, sortOrder: 5 }),
  ];

  it("only includes wards that serve the patient's unit, plus shared and ICU wards", () => {
    const names = wardOptionsForPatient(wards, 'OR1').map(w => w.name);
    expect(names).toEqual(['OR1 Ward', 'Shared Ward', 'ICU']);
  });

  it('excludes wards belonging to a different unit', () => {
    const names = wardOptionsForPatient(wards, 'OR1').map(w => w.name);
    expect(names).not.toContain('OR2 Ward');
  });

  it('excludes inactive wards even if they match the unit', () => {
    const names = wardOptionsForPatient(wards, 'OR1').map(w => w.name);
    expect(names).not.toContain('Inactive OR1 Ward');
  });

  it('returns every active ward when the patient has no unit assigned', () => {
    const names = wardOptionsForPatient(wards, undefined).map(w => w.name);
    expect(names).toEqual(['OR1 Ward', 'OR2 Ward', 'Shared Ward', 'ICU']);
  });
});
