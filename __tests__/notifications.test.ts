import { describe, it, expect } from 'vitest';
import { generateNotifications } from '../utils/calculations';
import { Patient, PatientStatus, PacStatus, Gender } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const daysAgo = (n: number): string =>
  new Date(Date.now() - n * 86_400_000).toISOString().split('T')[0];

const today = (): string => new Date().toISOString().split('T')[0];
const yesterday = (): string => daysAgo(1);

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  ipNo: 'IP001',
  name: 'Test Patient',
  mobile: '9876543210',
  age: 50,
  gender: Gender.Male,
  ward: 'Ortho A',
  bed: '3',
  diagnosis: 'Fracture',
  comorbidities: [],
  doa: daysAgo(5),
  pacStatus: PacStatus.Fit,
  patientStatus: PatientStatus.Fit,
  dailyRounds: [],
  investigations: [],
  labResults: [],
  todos: [],
  ...overrides,
});

// ─── Diabetic Protocol (FBS/PPBS) ─────────────────────────────────────────────

describe('generateNotifications – diabetic FBS protocol', () => {
  it('fires a high-priority lab alert when diabetic patient has no FBS result', () => {
    const p = makePatient({ comorbidities: ['DM Type 2'] });
    const notes = generateNotifications([p]);
    const alert = notes.find(n => n.patientId === 'IP001' && n.category === 'lab');
    expect(alert).toBeDefined();
    expect(alert?.priority).toBe('high');
    expect(alert?.title).toContain('FBS');
  });

  it('fires a lab alert when FBS was done more than 2 days ago', () => {
    const p = makePatient({
      comorbidities: ['DM'],
      labResults: [{ id: 'l1', type: 'FBS', value: 110, date: daysAgo(3) }],
    });
    const notes = generateNotifications([p]);
    expect(notes.some(n => n.category === 'lab' && n.patientId === 'IP001')).toBe(true);
  });

  it('does NOT fire a lab alert when FBS was done today', () => {
    const p = makePatient({
      comorbidities: ['DM'],
      labResults: [{ id: 'l1', type: 'FBS', value: 110, date: today() }],
    });
    const notes = generateNotifications([p]);
    expect(notes.some(n => n.category === 'lab' && n.patientId === 'IP001')).toBe(false);
  });

  it('fires alert when diabetes is mentioned in diagnosis', () => {
    const p = makePatient({ diagnosis: 'NOF fracture with Diabetes Mellitus' });
    const notes = generateNotifications([p]);
    expect(notes.some(n => n.category === 'lab' && n.patientId === 'IP001')).toBe(true);
  });

  it('does not fire for a non-diabetic patient with no FBS', () => {
    const p = makePatient({ comorbidities: ['HTN'] });
    const notes = generateNotifications([p]);
    expect(notes.some(n => n.category === 'lab')).toBe(false);
  });
});

// ─── Infection Protocol (ESR/CRP) ─────────────────────────────────────────────

describe('generateNotifications – infection/ESR protocol', () => {
  it('fires a medium-priority lab alert for open fracture with no ESR', () => {
    const p = makePatient({ diagnosis: 'Open fracture tibia' });
    const notes = generateNotifications([p]);
    const alert = notes.find(n => n.category === 'lab' && n.patientId === 'IP001');
    expect(alert).toBeDefined();
    expect(alert?.priority).toBe('medium');
    expect(alert?.title).toContain('ESR');
  });

  it('fires when ESR was done more than 3 days ago', () => {
    const p = makePatient({
      diagnosis: 'Infected wound',
      labResults: [{ id: 'l1', type: 'ESR', value: 80, date: daysAgo(4) }],
    });
    const notes = generateNotifications([p]);
    expect(notes.some(n => n.category === 'lab')).toBe(true);
  });

  it('does NOT fire when ESR was done 2 days ago', () => {
    const p = makePatient({
      diagnosis: 'Open fracture femur',
      labResults: [{ id: 'l1', type: 'ESR', value: 80, date: daysAgo(2) }],
    });
    const notes = generateNotifications([p]);
    expect(notes.some(n => n.category === 'lab')).toBe(false);
  });

  it('fires for abscess diagnosis', () => {
    const p = makePatient({ diagnosis: 'Pyogenic abscess thigh' });
    const notes = generateNotifications([p]);
    expect(notes.some(n => n.category === 'lab')).toBe(true);
  });
});

// ─── Incomplete Todos Carry-Over ──────────────────────────────────────────────

describe('generateNotifications – incomplete todos from yesterday', () => {
  it('fires a low-priority todo alert for incomplete yesterday tasks', () => {
    const p = makePatient({
      dailyRounds: [{
        date: yesterday(),
        note: '',
        todos: [
          { id: 't1', task: 'Send blood for culture', isDone: false },
          { id: 't2', task: 'IV antibiotics', isDone: true },
        ],
      }],
    });
    const notes = generateNotifications([p]);
    const alert = notes.find(n => n.category === 'todo');
    expect(alert).toBeDefined();
    expect(alert?.priority).toBe('low');
    expect(alert?.message).toContain('Send blood for culture');
    expect(alert?.message).not.toContain('IV antibiotics'); // completed task excluded
  });

  it('does NOT fire when all yesterday todos are done', () => {
    const p = makePatient({
      dailyRounds: [{
        date: yesterday(),
        note: '',
        todos: [{ id: 't1', task: 'Dress wound', isDone: true }],
      }],
    });
    const notes = generateNotifications([p]);
    expect(notes.some(n => n.category === 'todo')).toBe(false);
  });

  it('does NOT fire for rounds from 2 days ago (only yesterday matters)', () => {
    const p = makePatient({
      dailyRounds: [{
        date: daysAgo(2),
        note: '',
        todos: [{ id: 't1', task: 'Old task', isDone: false }],
      }],
    });
    const notes = generateNotifications([p]);
    expect(notes.some(n => n.category === 'todo')).toBe(false);
  });
});

// ─── PAC Pending > 3 days ─────────────────────────────────────────────────────

describe('generateNotifications – PAC pending alert', () => {
  it('fires a medium-priority PAC alert after 3+ days without clearance', () => {
    const p = makePatient({
      pacStatus: PacStatus.Pending,
      doa: daysAgo(4),
    });
    const notes = generateNotifications([p]);
    const alert = notes.find(n => n.category === 'pac');
    expect(alert).toBeDefined();
    expect(alert?.priority).toBe('medium');
    expect(alert?.title).toContain('PAC');
  });

  it('does NOT fire when PAC has been pending for only 2 days', () => {
    const p = makePatient({
      pacStatus: PacStatus.Pending,
      doa: daysAgo(2),
    });
    const notes = generateNotifications([p]);
    expect(notes.some(n => n.category === 'pac')).toBe(false);
  });

  it('does NOT fire when PAC is pending but surgery date is already set', () => {
    const p = makePatient({
      pacStatus: PacStatus.Pending,
      doa: daysAgo(5),
      dos: today(),
    });
    const notes = generateNotifications([p]);
    expect(notes.some(n => n.category === 'pac')).toBe(false);
  });

  it('does NOT fire when PAC status is Fit', () => {
    const p = makePatient({ pacStatus: PacStatus.Fit, doa: daysAgo(7) });
    const notes = generateNotifications([p]);
    expect(notes.some(n => n.category === 'pac')).toBe(false);
  });
});

// ─── POD Milestone ────────────────────────────────────────────────────────────

describe('generateNotifications – POD milestone', () => {
  it('fires an info-priority POD 1 alert', () => {
    const p = makePatient({ pod: 1 });
    const notes = generateNotifications([p]);
    const alert = notes.find(n => n.category === 'pod');
    expect(alert).toBeDefined();
    expect(alert?.priority).toBe('info');
    expect(alert?.title).toContain('POD 1');
  });

  it('does NOT fire a POD alert for POD 0 patients', () => {
    const p = makePatient({ pod: 0 });
    const notes = generateNotifications([p]);
    expect(notes.some(n => n.category === 'pod')).toBe(false);
  });

  it('does NOT fire a POD alert for POD 2+ patients', () => {
    const p = makePatient({ pod: 2 });
    const notes = generateNotifications([p]);
    expect(notes.some(n => n.category === 'pod')).toBe(false);
  });

  it('does NOT fire a POD alert when pod is undefined', () => {
    const p = makePatient({ pod: undefined });
    const notes = generateNotifications([p]);
    expect(notes.some(n => n.category === 'pod')).toBe(false);
  });
});

// ─── Discharged patients excluded ─────────────────────────────────────────────

describe('generateNotifications – discharged patient exclusion', () => {
  it('skips discharged patients entirely', () => {
    const discharged = makePatient({
      patientStatus: PatientStatus.Discharged,
      comorbidities: ['DM'],  // would trigger FBS alert if active
      pod: 1,                 // would trigger POD alert if active
    });
    const notes = generateNotifications([discharged]);
    expect(notes).toHaveLength(0);
  });
});

// ─── Null / undefined array guards ────────────────────────────────────────────

describe('generateNotifications – graceful null handling', () => {
  it('does not throw when comorbidities is null', () => {
    const p = makePatient({ comorbidities: null as unknown as string[] });
    expect(() => generateNotifications([p])).not.toThrow();
  });

  it('does not throw when labResults is null', () => {
    const p = makePatient({ diagnosis: 'Open fracture' });
    p.labResults = null as unknown as typeof p.labResults;
    expect(() => generateNotifications([p])).not.toThrow();
  });

  it('does not throw when dailyRounds is null', () => {
    const p = makePatient({ dailyRounds: null as unknown as typeof p.dailyRounds });
    expect(() => generateNotifications([p])).not.toThrow();
  });

  it('returns empty array for empty patient list', () => {
    expect(generateNotifications([])).toEqual([]);
  });
});
