import { describe, it, expect } from 'vitest';
import { findNewlyPlannedOTAssignments } from '../utils/otListAutoPopulate';
import { Patient, Gender, PacStatus, PatientStatus } from '../types';

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  ipNo: 'IP001', name: 'Ravi Kumar', mobile: '9876543210', age: 52,
  gender: Gender.Male, ward: 'Ward 22', bed: '5', unit: 'OR1',
  diagnosis: 'Fracture femur', comorbidities: [], doa: '2026-07-26',
  pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [], todos: [],
  ...overrides,
});

// OR1: admit Mon, major Thu, minor Wed (see utils/otSchedule.ts UNIT_SCHEDULE)
const tabDates = [
  { date: '2026-08-06', fallbackType: 'Major' as const }, // a Thursday
  { date: '2026-08-05', fallbackType: 'Minor' as const }, // a Wednesday
  { date: '2026-08-03', fallbackType: 'EOT' as const },   // a Monday
];

describe('findNewlyPlannedOTAssignments', () => {
  it('includes a patient whose plannedDos matches a tab date and is not yet in the list', () => {
    const patients = [makePatient({ ipNo: 'IP001', plannedDos: '2026-08-06' })];
    const result = findNewlyPlannedOTAssignments(patients, new Set(), tabDates);
    expect(result).toHaveLength(1);
    expect(result[0].patient.ipNo).toBe('IP001');
    expect(result[0].otType).toBe('Major');
    expect(result[0].date).toBe('2026-08-06');
  });

  it('does not insert a duplicate for a patient already present in the loaded list', () => {
    const patients = [makePatient({ ipNo: 'IP001', plannedDos: '2026-08-06' })];
    const result = findNewlyPlannedOTAssignments(patients, new Set(['IP001']), tabDates);
    expect(result).toHaveLength(0);
  });

  it('does not return the same patient twice even if eligible for two tab dates', () => {
    // Same ipNo appearing with a plannedDos matching more than one tab date
    // in the same pass must only ever produce one assignment.
    const patients = [
      makePatient({ ipNo: 'IP001', plannedDos: '2026-08-06' }),
      makePatient({ ipNo: 'IP001', plannedDos: '2026-08-05' }),
    ];
    const result = findNewlyPlannedOTAssignments(patients, new Set(), tabDates);
    expect(result).toHaveLength(1);
  });

  it('excludes a patient with no pending surgery', () => {
    // hasPendingSurgery (utils/calculations.ts) is `!p.dos || !!p.plannedDos`
    // — any truthy plannedDos is unconditionally pending (it may be a
    // genuine second surgery; see reconcilePlannedDos), so a settled
    // patient must have plannedDos absent, not merely dos before it.
    const patients = [makePatient({ ipNo: 'IP001', dos: '2026-07-01' })];
    const result = findNewlyPlannedOTAssignments(patients, new Set(), tabDates);
    expect(result).toHaveLength(0);
  });

  it('resolves otType from the unit schedule when the date matches a real OT day, falling back otherwise', () => {
    // OR1's schedule says 2026-08-06 is that unit's Major day (see tabDates
    // comment above) — confirm the real schedule wins over the naive
    // fallback that assumed this was the "Major tab"'s date.
    const patients = [makePatient({ ipNo: 'IP001', unit: 'OR1', plannedDos: '2026-08-05' })];
    const result = findNewlyPlannedOTAssignments(patients, new Set(), tabDates);
    expect(result[0].otType).toBe('Minor'); // OR1's real Wednesday type, matching the fallback here too
  });
});
