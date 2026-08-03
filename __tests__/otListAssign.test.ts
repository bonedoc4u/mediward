import { describe, it, expect } from 'vitest';
import { buildOTPatientEntry } from '../utils/otListAssign';
import { OTPatient } from '../utils/otListTypes';
import { Patient, Gender, PacStatus, PatientStatus } from '../types';

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  ipNo: 'IP001',
  name: 'Ravi Kumar',
  mobile: '9876543210',
  age: 52,
  gender: Gender.Male,
  ward: 'Ward 22',
  bed: '5',
  unit: 'OR1',
  diagnosis: 'Intertrochanteric fracture femur',
  procedure: 'DHS fixation',
  comorbidities: ['HTN', 'DM'],
  doa: '2026-07-26',
  pacStatus: PacStatus.Fit,
  patientStatus: PatientStatus.Fit,
  dailyRounds: [],
  investigations: [],
  labResults: [],
  todos: [],
  ...overrides,
});

describe('buildOTPatientEntry', () => {
  it('maps patient fields onto a new OT entry', () => {
    const entry = buildOTPatientEntry(makePatient(), 'Major', 'TABLE 1', []);
    expect(entry.ipNo).toBe('IP001');
    expect(entry.name).toBe('Ravi Kumar');
    expect(entry.age).toBe('52');
    expect(entry.gender).toBe('M');
    expect(entry.ward).toBe('22'); // "Ward 22" -> "22"
    expect(entry.unit).toBe('OR1');
    expect(entry.diagnosis).toBe('Intertrochanteric fracture femur');
    expect(entry.procedure).toBe('DHS fixation');
    expect(entry.remarks).toBe('HTN, DM');
    expect(entry.category).toBe('TABLE 1');
    expect(entry.otType).toBe('Major');
    expect(entry.cArm).toBe('No');
  });

  it('defaults unit to OR1 when the patient has none', () => {
    const entry = buildOTPatientEntry(makePatient({ unit: undefined }), 'Major', 'TABLE 1', []);
    expect(entry.unit).toBe('OR1');
  });

  it('maps Female to F', () => {
    const entry = buildOTPatientEntry(makePatient({ gender: Gender.Female }), 'Major', 'TABLE 1', []);
    expect(entry.gender).toBe('F');
  });

  it('computes sequence as one past the highest existing sequence in that category', () => {
    const existing: OTPatient[] = [
      { id: 'a', sequence: 1, ipNo: 'x', name: '', age: '', gender: 'M', ward: '', unit: '', diagnosis: '', procedure: '', side: '', anesthesia: '', cArm: 'No', implants: '', remarks: '', category: 'TABLE 1', otType: 'Major' },
      { id: 'b', sequence: 3, ipNo: 'y', name: '', age: '', gender: 'M', ward: '', unit: '', diagnosis: '', procedure: '', side: '', anesthesia: '', cArm: 'No', implants: '', remarks: '', category: 'TABLE 1', otType: 'Major' },
    ];
    const entry = buildOTPatientEntry(makePatient(), 'Major', 'TABLE 1', existing);
    expect(entry.sequence).toBe(4);
  });

  it('starts sequence at 1 when the category is empty', () => {
    const entry = buildOTPatientEntry(makePatient(), 'Major', 'TABLE 1', []);
    expect(entry.sequence).toBe(1);
  });
});
