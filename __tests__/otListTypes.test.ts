import { describe, it, expect } from 'vitest';
import { getOTTypeForDate, getTableOptionsForType, getDefaultCategoryForType, isEligibleForOTList, PENDING_ID_PREFIX } from '../utils/otListTypes';
import { Patient, Gender, PacStatus, PatientStatus } from '../types';

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  ipNo: 'IP001',
  name: 'Ravi Kumar',
  mobile: '9876543210',
  age: 52,
  gender: Gender.Male,
  ward: 'Ward 22',
  bed: '5',
  diagnosis: 'Intertrochanteric fracture femur',
  comorbidities: [],
  doa: '2026-07-26',
  pacStatus: PacStatus.Fit,
  patientStatus: PatientStatus.Fit,
  dailyRounds: [],
  investigations: [],
  labResults: [],
  todos: [],
  ...overrides,
});

describe('PENDING_ID_PREFIX', () => {
  it('is the shared prefix pending-card drag ids are built from and parsed with', () => {
    // PendingSurgeryPanel builds `${PENDING_ID_PREFIX}${ipNo}`; OTListManagement's
    // handleDragEnd/DragOverlay parse it back the same way. Pinning the value
    // here means a future rename of the constant's contents shows up as a
    // failing test instead of silently breaking assign-by-drag.
    expect(PENDING_ID_PREFIX).toBe('pending-');
  });
});

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

describe('isEligibleForOTList', () => {
  it('includes a current inpatient who has never had surgery', () => {
    expect(isEligibleForOTList(makePatient({ dos: undefined, plannedDos: undefined }))).toBe(true);
  });

  it('includes a current inpatient with a second surgery planned', () => {
    expect(isEligibleForOTList(makePatient({ dos: '2026-07-28', plannedDos: '2026-08-10' }))).toBe(true);
  });

  it('excludes a current inpatient with no pending surgery at all', () => {
    expect(isEligibleForOTList(makePatient({ dos: '2026-07-28', plannedDos: undefined }))).toBe(false);
  });

  it('excludes a Discharged patient even if they would otherwise be pending', () => {
    expect(isEligibleForOTList(makePatient({
      patientStatus: PatientStatus.Discharged, dos: undefined, plannedDos: undefined,
    }))).toBe(false);
  });

  it('excludes a Discharged patient even with a planned second surgery', () => {
    expect(isEligibleForOTList(makePatient({
      patientStatus: PatientStatus.Discharged, dos: '2026-07-28', plannedDos: '2026-08-10',
    }))).toBe(false);
  });

  it('excludes a Went Home patient with no second surgery planned', () => {
    expect(isEligibleForOTList(makePatient({
      patientStatus: PatientStatus.WentHome, dos: '2026-07-28', plannedDos: undefined,
    }))).toBe(false);
  });

  it('includes a Went Home patient who has a second surgery planned', () => {
    expect(isEligibleForOTList(makePatient({
      patientStatus: PatientStatus.WentHome, dos: '2026-07-28', plannedDos: '2026-08-10',
    }))).toBe(true);
  });
});
