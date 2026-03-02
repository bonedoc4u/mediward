import { describe, it, expect } from 'vitest';
import { getSmartAlerts } from '../utils/smartAlerts';
import { PacStatus, PatientStatus, Gender } from '../types';
import type { Patient } from '../types';

const today    = new Date().toISOString().split('T')[0];
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];

function makePatient(overrides: Partial<Patient>): Patient {
  return {
    bed: '1', ward: 'Ward 10', ipNo: 'IP001', name: 'Test', mobile: '',
    age: 40, gender: Gender.Male, diagnosis: 'Fracture', comorbidities: [],
    doa: today, pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
    dailyRounds: [], investigations: [], labResults: [], todos: [],
    ...overrides,
  };
}

describe('getSmartAlerts', () => {
  it('returns critical alert when surgery is today and PAC is pending', () => {
    const patient = makePatient({ dos: today, pacStatus: PacStatus.Pending });
    const alerts = getSmartAlerts(patient);
    expect(alerts.some(a => a.type === 'critical' && a.message.includes('TODAY'))).toBe(true);
  });

  it('returns warning when surgery is tomorrow and PAC is pending', () => {
    const patient = makePatient({ dos: tomorrow, pacStatus: PacStatus.Pending });
    const alerts = getSmartAlerts(patient);
    expect(alerts.some(a => a.type === 'warning' && a.message.includes('tomorrow'))).toBe(true);
  });

  it('returns warning when POD is 0 or 1 and there are pending todos', () => {
    const patient = makePatient({
      pod: 1,
      todos: [{ id: 't1', task: 'Check wound', isDone: false }],
    });
    const alerts = getSmartAlerts(patient);
    expect(alerts.some(a => a.type === 'warning' && a.message.includes('overdue'))).toBe(true);
  });

  it('returns info alert when POD >= 5 and no discharge summary', () => {
    const patient = makePatient({ pod: 5, dischargeSummary: undefined });
    const alerts = getSmartAlerts(patient);
    expect(alerts.some(a => a.type === 'info' && a.message.includes('discharge planning'))).toBe(true);
  });

  it('returns warning when POD >= 7 for extended stay', () => {
    const patient = makePatient({ pod: 8 });
    const alerts = getSmartAlerts(patient);
    expect(alerts.some(a => a.type === 'warning' && a.message.includes('extended stay'))).toBe(true);
  });

  it('returns no alerts for a routine fit patient', () => {
    const patient = makePatient({ pacStatus: PacStatus.Fit, pod: 2 });
    const alerts = getSmartAlerts(patient);
    expect(alerts).toHaveLength(0);
  });
});
