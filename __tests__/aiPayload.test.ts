/**
 * What the Clinical Assistant sends to Google Gemini (audit SEC-05).
 * Before this, every ward patient's name went to Google with their notes.
 */
import { describe, it, expect } from 'vitest';
import { buildAiPayload, attachNames, scrubName } from '../utils/aiPayload';
import { PacStatus, PatientStatus, Gender } from '../types';
import type { Patient } from '../types';

function makePatient(overrides: Partial<Patient>): Patient {
  return {
    bed: '1', ward: 'Ward 10', ipNo: 'IP001', name: 'Test', mobile: '',
    age: 40, gender: Gender.Male, diagnosis: 'Fracture', comorbidities: [],
    doa: '2026-11-10', pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
    dailyRounds: [], investigations: [], labResults: [], todos: [],
    ...overrides,
  };
}

const ward = [
  makePatient({
    bed: '4', ipNo: 'IP/2026/0441', name: 'Ramesh Kumar', mobile: '9876543210', abhaId: '12-3456-7890-1234',
    diagnosis: 'Ramesh: # NOF (L)', comorbidities: ['DM'],
    todos: [{ id: 't1', task: 'Call Ramesh Kumar\'s son about consent', isDone: false }],
    dailyRounds: [{ date: '2026-11-13', note: 'RAMESH comfortable, wound dry' } as Patient['dailyRounds'][number]],
  }),
  makePatient({ bed: '7', ipNo: 'IP/2026/0442', name: 'Sita Devi', diagnosis: 'Shaft of femur (R)' }),
  makePatient({ bed: '9', ipNo: 'IP/2026/0443', name: 'Gone Home', patientStatus: PatientStatus.Discharged }),
] as Patient[];

describe('buildAiPayload', () => {
  const { summaries, keys } = buildAiPayload(ward, new Date('2026-11-14'));
  const sent = JSON.stringify(summaries);

  it('sends no name, IP number, mobile or ABHA ID', () => {
    for (const secret of ['Ramesh', 'Kumar', 'Sita', 'Devi', 'IP/2026', '9876543210', '12-3456-7890-1234']) {
      expect(sent, secret).not.toContain(secret);
    }
    expect(sent.toLowerCase()).not.toContain('ramesh');
  });

  it('sends each patient as a reference, with bed and the clinical details', () => {
    expect(summaries.map(s => [s.ref, s.name, s.bed])).toEqual([['Patient 1', 'Patient 1', '4'], ['Patient 2', 'Patient 2', '7']]);
    expect(summaries[0]).toMatchObject({
      diagnosis: 'Patient 1: # NOF (L)',
      comorbidities: ['DM'],
      pendingTodos: ['Call Patient 1\'s son about consent'],
      lastRoundNote: 'Patient 1 comfortable, wound dry',
      daysAdmitted: 4,
    });
  });

  it('leaves discharged patients out', () => {
    expect(summaries).toHaveLength(2);
    expect(sent).not.toContain('Gone Home');
  });

  it('keeps the key to the real names on the phone', () => {
    expect(keys.get('Patient 1')).toEqual({ bed: '4', name: 'Ramesh Kumar' });
    expect(keys.get('Patient 2')).toEqual({ bed: '7', name: 'Sita Devi' });
  });
});

describe('scrubName', () => {
  it('replaces whole words only, in any case', () => {
    expect(scrubName('Devika saw Devi; DEVI stable', 'Sita Devi', 'Patient 2')).toBe('Devika saw Patient 2; Patient 2 stable');
  });

  it('ignores name parts shorter than three letters', () => {
    expect(scrubName('K L to OT', 'K L Rahul', 'Patient 1')).toBe('K L to OT');
  });
});

describe('attachNames', () => {
  const { keys } = buildAiPayload(ward, new Date('2026-11-14'));

  it('puts the real name and bed back, by reference', () => {
    const alerts = attachNames([
      { bed: '4', patientName: 'Patient 1', category: 'Diabetic Care', message: 'Check FBS for Patient 1', priority: 'High' },
    ], keys);
    expect(alerts).toEqual([
      { bed: '4', patientName: 'Ramesh Kumar', category: 'Diabetic Care', message: 'Check FBS for Ramesh Kumar', priority: 'High' },
    ]);
  });

  it('does not confuse Patient 1 with Patient 10', () => {
    const many = buildAiPayload(Array.from({ length: 10 }, (_, i) => makePatient({ bed: `${i + 1}`, name: `Name${i + 1}` })));
    expect(attachNames([{ patientName: 'Patient 10', message: 'Patient 10 and Patient 1' }], many.keys)[0])
      .toMatchObject({ bed: '10', patientName: 'Name10', message: 'Name10 and Name1' });
  });

  it('falls back to the bed when the reference is missing', () => {
    expect(attachNames([{ bed: '7', message: 'x' }], keys)[0]).toMatchObject({ patientName: 'Sita Devi', priority: 'Low' });
  });

  it('drops an alert that matches no patient instead of showing it on the wrong one', () => {
    expect(attachNames([{ bed: '99', patientName: 'Patient 42', message: 'x' }, null, 'junk'], keys)).toEqual([]);
  });
});
