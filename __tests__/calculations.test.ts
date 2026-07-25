import { describe, it, expect } from 'vitest';
import { calculatePOD, getStatusColor, sortByBed, wardOptionsForPatient, hasPendingSurgery, buildSurgeryUpdate } from '../utils/calculations';
import { PacStatus } from '../types';
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

describe('hasPendingSurgery (OT pending-list / ward "Pending" view membership)', () => {
  it('is true when the patient has never been operated', () => {
    expect(hasPendingSurgery({ dos: undefined, plannedDos: undefined } as Patient)).toBe(true);
  });

  it('is true when not yet operated but a date is already planned', () => {
    expect(hasPendingSurgery({ dos: undefined, plannedDos: '2026-08-01' } as Patient)).toBe(true);
  });

  it('is false once operated with no further surgery planned', () => {
    expect(hasPendingSurgery({ dos: '2026-06-01', plannedDos: undefined } as Patient)).toBe(false);
  });

  it('is true once operated AND a second surgery has been planned', () => {
    // Regression: this patient was previously permanently excluded from the
    // pending list because both filters hard-checked `!p.dos`.
    expect(hasPendingSurgery({ dos: '2026-06-01', plannedDos: '2026-08-01' } as Patient)).toBe(true);
  });
});

describe('buildSurgeryUpdate (recording a new/second surgery)', () => {
  it('sets the new procedure and dos, and clears plannedDos', () => {
    const patient = { procedure: undefined, dos: undefined, plannedDos: '2026-06-01', priorSurgeries: undefined } as Patient;
    const result = buildSurgeryUpdate(patient, 'DHS fixation', '2026-06-01');
    expect(result).toEqual({
      procedure: 'DHS fixation',
      dos: '2026-06-01',
      plannedDos: undefined,
      priorSurgeries: [],
      pacStatus: PacStatus.Pending,
      pacFlow: undefined,
      preOpChecklist: undefined,
    });
  });

  it('archives the current procedure/dos into priorSurgeries when a surgery already existed', () => {
    const patient = {
      procedure: 'DHS fixation', dos: '2026-06-01', plannedDos: '2026-07-20', priorSurgeries: undefined,
    } as Patient;
    const result = buildSurgeryUpdate(patient, 'Implant removal', '2026-07-20');
    expect(result).toEqual({
      procedure: 'Implant removal',
      dos: '2026-07-20',
      plannedDos: undefined,
      priorSurgeries: [{ procedure: 'DHS fixation', dos: '2026-06-01' }],
      pacStatus: PacStatus.Pending,
      pacFlow: undefined,
      preOpChecklist: undefined,
    });
  });

  it('resets pacStatus/pacFlow/preOpChecklist so a second surgery does not inherit stale clearance from the first', () => {
    // Regression: without this reset, a patient who was PAC Fit and fully
    // checklisted for surgery 1 would show as already cleared for surgery 2,
    // even though nothing has actually been assessed for the new procedure.
    const patient = {
      procedure: 'DHS fixation', dos: '2026-06-01', plannedDos: undefined,
      pacStatus: PacStatus.Fit,
      pacFlow: { seenByAnaesthesia: true, branches: [{ id: '1', name: 'Cardiology', isDone: true, items: [] }] },
      preOpChecklist: [{ id: '0', task: 'Consent', isDone: true }],
    } as unknown as Patient;
    const result = buildSurgeryUpdate(patient, 'Implant removal', '2026-08-01');
    expect(result.pacStatus).toBe(PacStatus.Pending);
    expect(result.pacFlow).toBeUndefined();
    expect(result.preOpChecklist).toBeUndefined();
  });

  it('appends to existing priorSurgeries rather than overwriting the list', () => {
    const patient = {
      procedure: 'Implant removal', dos: '2026-07-20', plannedDos: undefined,
      priorSurgeries: [{ procedure: 'DHS fixation', dos: '2026-06-01' }],
    } as Patient;
    const result = buildSurgeryUpdate(patient, 'Revision fixation', '2026-09-01');
    expect(result.priorSurgeries).toEqual([
      { procedure: 'DHS fixation', dos: '2026-06-01' },
      { procedure: 'Implant removal', dos: '2026-07-20' },
    ]);
  });
});
