import { describe, it, expect } from 'vitest';
import {
  getTriagePriority,
  getTriageBorderClass,
  sortByBed,
  groupByWard,
} from '../utils/calculations';
import { Patient, PatientStatus, PacStatus, Gender } from '../types';

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  ipNo: 'IP001',
  name: 'Test Patient',
  mobile: '9876543210',
  age: 45,
  gender: Gender.Male,
  ward: 'Ortho Ward',
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

// ─── getTriagePriority ────────────────────────────────────────────────────────

describe('getTriagePriority', () => {
  it('assigns 0 to Critical patients (highest urgency)', () => {
    const p = makePatient({ patientStatus: PatientStatus.Critical });
    expect(getTriagePriority(p)).toBe(0);
  });

  it('assigns 1 to POD 0 (day of surgery)', () => {
    const p = makePatient({ pod: 0 });
    expect(getTriagePriority(p)).toBe(1);
  });

  it('assigns 2 to POD 1 (first post-op day)', () => {
    const p = makePatient({ pod: 1 });
    expect(getTriagePriority(p)).toBe(2);
  });

  it('assigns 3 to PAC Pending patients awaiting clearance', () => {
    const p = makePatient({ pacStatus: PacStatus.Pending });
    expect(getTriagePriority(p)).toBe(3);
  });

  it('assigns 4 to Review status patients', () => {
    const p = makePatient({ patientStatus: PatientStatus.Review });
    expect(getTriagePriority(p)).toBe(4);
  });

  it('assigns 5 to stable (Fit) patients', () => {
    const p = makePatient({ patientStatus: PatientStatus.Fit });
    expect(getTriagePriority(p)).toBe(5);
  });

  it('assigns 6 to Discharge Ready patients (lowest urgency)', () => {
    const p = makePatient({ patientStatus: PatientStatus.DischargeReady });
    expect(getTriagePriority(p)).toBe(6);
  });

  it('Critical overrides POD 0 (Critical is always top)', () => {
    const p = makePatient({ patientStatus: PatientStatus.Critical, pod: 0 });
    expect(getTriagePriority(p)).toBe(0);
  });

  it('POD 0 takes priority over PAC Pending', () => {
    const p = makePatient({ pod: 0, pacStatus: PacStatus.Pending });
    expect(getTriagePriority(p)).toBe(1);
  });

  it('stable patient on POD 5 gets default priority 5', () => {
    const p = makePatient({ pod: 5 });
    expect(getTriagePriority(p)).toBe(5);
  });
});

// ─── getTriageBorderClass ─────────────────────────────────────────────────────

describe('getTriageBorderClass', () => {
  it('returns red border for Critical', () => {
    const p = makePatient({ patientStatus: PatientStatus.Critical });
    expect(getTriageBorderClass(p)).toContain('red');
  });

  it('returns amber border for POD 0', () => {
    const p = makePatient({ pod: 0 });
    expect(getTriageBorderClass(p)).toContain('amber');
  });

  it('returns amber border for POD 1', () => {
    const p = makePatient({ pod: 1 });
    expect(getTriageBorderClass(p)).toContain('amber');
  });

  it('returns orange border for PAC Pending', () => {
    const p = makePatient({ pacStatus: PacStatus.Pending });
    expect(getTriageBorderClass(p)).toContain('orange');
  });

  it('returns emerald border for Discharge Ready', () => {
    const p = makePatient({ patientStatus: PatientStatus.DischargeReady });
    expect(getTriageBorderClass(p)).toContain('emerald');
  });

  it('returns slate border for stable patients', () => {
    const p = makePatient({ patientStatus: PatientStatus.Fit });
    expect(getTriageBorderClass(p)).toContain('slate');
  });

  it('returns a border-l-4 class for all statuses', () => {
    const statuses = [
      makePatient({ patientStatus: PatientStatus.Critical }),
      makePatient({ pod: 0 }),
      makePatient({ pacStatus: PacStatus.Pending }),
      makePatient({ patientStatus: PatientStatus.DischargeReady }),
      makePatient(),
    ];
    statuses.forEach(p => {
      expect(getTriageBorderClass(p)).toContain('border-l-4');
    });
  });
});

// ─── sortByBed ────────────────────────────────────────────────────────────────

describe('sortByBed', () => {
  it('sorts numeric beds in ascending order', () => {
    const p1 = makePatient({ bed: '10' });
    const p2 = makePatient({ bed: '2' });
    expect(sortByBed(p1, p2)).toBeGreaterThan(0); // 10 > 2 numerically
    expect(sortByBed(p2, p1)).toBeLessThan(0);
  });

  it('returns 0 for identical bed numbers', () => {
    const p1 = makePatient({ bed: '5' });
    const p2 = makePatient({ bed: '5' });
    expect(sortByBed(p1, p2)).toBe(0);
  });

  it('places non-numeric beds after numeric ones', () => {
    const numeric = makePatient({ bed: '3' });
    const alpha   = makePatient({ bed: 'ICU-A' });
    expect(sortByBed(alpha, numeric)).toBeGreaterThan(0); // alpha after numeric
    expect(sortByBed(numeric, alpha)).toBeLessThan(0);
  });

  it('sorts two non-numeric beds alphabetically', () => {
    const a = makePatient({ bed: 'A1' });
    const b = makePatient({ bed: 'B2' });
    expect(sortByBed(a, b)).toBeLessThan(0);
  });
});

// ─── groupByWard ──────────────────────────────────────────────────────────────

describe('groupByWard', () => {
  it('groups patients by their ward', () => {
    const patients = [
      makePatient({ ipNo: 'IP001', ward: 'Ortho A', bed: '1' }),
      makePatient({ ipNo: 'IP002', ward: 'Ortho B', bed: '1' }),
      makePatient({ ipNo: 'IP003', ward: 'Ortho A', bed: '2' }),
    ];
    const groups = groupByWard(patients);
    expect(Object.keys(groups)).toHaveLength(2);
    expect(groups['Ortho A']).toHaveLength(2);
    expect(groups['Ortho B']).toHaveLength(1);
  });

  it('sorts patients within each ward by bed number', () => {
    const patients = [
      makePatient({ ipNo: 'IP001', ward: 'Ortho A', bed: '10' }),
      makePatient({ ipNo: 'IP002', ward: 'Ortho A', bed: '2' }),
      makePatient({ ipNo: 'IP003', ward: 'Ortho A', bed: '7' }),
    ];
    const groups = groupByWard(patients);
    const beds = groups['Ortho A'].map(p => p.bed);
    expect(beds).toEqual(['2', '7', '10']);
  });

  it('uses "Unknown" for patients with no ward', () => {
    const patients = [makePatient({ ipNo: 'IP001', ward: undefined as unknown as string })];
    const groups = groupByWard(patients);
    expect(groups['Unknown']).toHaveLength(1);
  });

  it('returns an empty object for empty input', () => {
    expect(groupByWard([])).toEqual({});
  });
});
