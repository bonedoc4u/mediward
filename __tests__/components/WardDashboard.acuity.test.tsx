import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WardDashboard from '../../components/WardDashboard';
import { Patient, PatientStatus, PacStatus, Gender } from '../../types';

const config = {
  wards: [
    { id: 'w1', name: 'ICU', sortOrder: 1, isIcu: true, active: true },
    { id: 'w2', name: 'Male Ward', sortOrder: 2, isIcu: false, active: true },
  ],
  icuWardNames: new Set(['ICU']),
  labTypes: [],
  showNews2: true,
  hospitalName: 'Test Hospital',
  department: 'Orthopaedics',
};

vi.mock('../../contexts/AppContext', () => ({
  useConfig: () => config,
  useAuth: () => ({ user: { id: 'u1', name: 'Dr Test', role: 'admin' }, selectedUnit: 'all' }),
}));

const makePatient = (overrides: Partial<Patient>): Patient => ({
  ipNo: 'IP001', name: 'Patient', mobile: '9876543210', age: 45, gender: Gender.Male,
  ward: 'ICU', bed: '1', diagnosis: 'Fracture femur', comorbidities: [], doa: '2026-11-01',
  pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [], todos: [],
  ...overrides,
});

const news2 = (score: number) => [{ id: 'v', timestamp: '2026-11-05T06:10:00', news2Score: score }];

// viewMode "master" skips TodaySchedule / HandoverSummary (they need more context).
const renderBoard = (patients: Patient[]) => render(<WardDashboard patients={patients} viewMode="master" />);

describe('WardDashboard acuity colours', () => {
  beforeEach(() => { config.showNews2 = true; });

  it('does not flag a stable ICU ward (no more always-on CRITICAL)', () => {
    renderBoard([
      makePatient({ ipNo: 'A', name: 'Patient A', bed: '1', vitals: news2(1) }),
      makePatient({ ipNo: 'B', name: 'Patient B', bed: '2', vitals: news2(3) }),
    ]);
    expect(screen.queryByText('CRITICAL')).not.toBeInTheDocument();
    expect(screen.queryByText(/needs? review/)).not.toBeInTheDocument();
  });

  it('counts only patients who need urgent review, on any ward', () => {
    renderBoard([
      makePatient({ ipNo: 'A', name: 'Patient A', ward: 'ICU', bed: '1', vitals: news2(6) }),
      makePatient({ ipNo: 'B', name: 'Patient B', ward: 'ICU', bed: '2', vitals: news2(1) }),
      makePatient({ ipNo: 'C', name: 'Patient C', ward: 'Male Ward', bed: '3', patientStatus: PatientStatus.Critical }),
    ]);
    // ICU: 1 of 2 needs review; the general ward's Critical patient is flagged too.
    expect(screen.getAllByText('1 needs review').length).toBeGreaterThanOrEqual(2);
  });

  it('spells out NEWS2 with its band instead of "N2: 6"', () => {
    renderBoard([makePatient({ ipNo: 'A', name: 'Patient A', vitals: news2(6) })]);
    expect(screen.getAllByText(/NEWS2 6 · Medium/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/N2: 6/)).not.toBeInTheDocument();
  });
});
