import { describe, it, expect } from 'vitest';
import { needsUrgentReview, news2Band } from '../utils/calculations';
import { Patient, PatientStatus, PacStatus, Gender, VitalSigns } from '../types';

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  ipNo: 'IP001',
  name: 'Test Patient',
  mobile: '9876543210',
  age: 45,
  gender: Gender.Male,
  ward: 'ICU',
  bed: '5',
  diagnosis: 'Fracture femur',
  comorbidities: [],
  doa: '2024-01-01',
  pacStatus: PacStatus.Fit,
  patientStatus: PatientStatus.Fit,
  dailyRounds: [],
  investigations: [],
  labResults: [],
  todos: [],
  ...overrides,
});

// vitals[0] is the latest reading.
const withNews2 = (...scores: number[]): VitalSigns[] =>
  scores.map((news2Score, i) => ({ id: `v${i}`, timestamp: `2026-11-0${5 - i}T08:00:00`, news2Score }));

describe('news2Band (RCP aggregate bands)', () => {
  it.each([
    [0, 'Low'], [4, 'Low'],
    [5, 'Medium'], [6, 'Medium'],
    [7, 'High'], [15, 'High'],
  ])('score %i → %s', (score, band) => {
    expect(news2Band(score)).toBe(band);
  });
});

describe('needsUrgentReview', () => {
  it('is false for a stable ICU patient — being in the ICU alone is not an alert', () => {
    // Regression: the ICU ward header used to count every ICU patient as critical.
    expect(needsUrgentReview(makePatient({ vitals: withNews2(2) }), true)).toBe(false);
    expect(needsUrgentReview(makePatient(), true)).toBe(false);
  });

  it('is true at NEWS2 5 (the RCP urgent-response threshold) and above', () => {
    expect(needsUrgentReview(makePatient({ vitals: withNews2(4) }), true)).toBe(false);
    expect(needsUrgentReview(makePatient({ vitals: withNews2(5) }), true)).toBe(true);
    expect(needsUrgentReview(makePatient({ vitals: withNews2(9) }), true)).toBe(true);
  });

  it('uses only the latest reading, not an older high score', () => {
    expect(needsUrgentReview(makePatient({ vitals: withNews2(1, 8) }), true)).toBe(false);
    expect(needsUrgentReview(makePatient({ vitals: withNews2(6, 1) }), true)).toBe(true);
  });

  it('is always true for clinician-set Critical status, even with NEWS2 hidden', () => {
    const p = makePatient({ patientStatus: PatientStatus.Critical, vitals: withNews2(0) });
    expect(needsUrgentReview(p, true)).toBe(true);
    expect(needsUrgentReview(p, false)).toBe(true);
  });

  it('ignores NEWS2 when the hospital has NEWS2 display turned off', () => {
    expect(needsUrgentReview(makePatient({ vitals: withNews2(8) }), false)).toBe(false);
  });

  it('treats a reading without a NEWS2 score as not urgent', () => {
    const p = makePatient({ vitals: [{ id: 'v0', timestamp: '2026-11-05T08:00:00', heartRate: 90 }] });
    expect(needsUrgentReview(p, true)).toBe(false);
  });
});
