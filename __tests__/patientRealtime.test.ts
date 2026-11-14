/**
 * OPS-03: how a live patient change updates the list on a phone.
 * The bug this would have caught: a patient removed on one phone stayed on
 * every other phone until reload, because the UPDATE that marks it removed
 * fetched nothing and the listener simply returned.
 */
import { describe, it, expect } from 'vitest';
import type { Patient } from '../types';
import { applyPatientInsert, applyPatientUpdate, removePatientsFromList } from '../utils/patientRealtime';

const p = (ipNo: string, extra: Partial<Patient> = {}): Patient =>
  ({ ipNo, name: `Fake ${ipNo}`, labResults: [], investigations: [], dailyRounds: [], vitals: [], ...extra }) as unknown as Patient;

describe('applyPatientInsert', () => {
  it('adds a new patient at the top', () => {
    expect(applyPatientInsert([p('A')], p('B'))!.map(x => x.ipNo)).toEqual(['B', 'A']);
  });
  it('ignores a patient already listed', () => {
    expect(applyPatientInsert([p('A')], p('A'))).toBeNull();
  });
});

describe('applyPatientUpdate', () => {
  it('replaces the patient but keeps the sub-records loaded on this phone', () => {
    const labs = [{ id: 'l1' }] as unknown as Patient['labResults'];
    const prev = [p('A', { diagnosis: 'old', labResults: labs } as Partial<Patient>), p('B')];
    const next = applyPatientUpdate(prev, p('A', { diagnosis: 'new' } as Partial<Patient>))!;
    expect(next.map(x => x.ipNo)).toEqual(['A', 'B']);
    expect((next[0] as unknown as { diagnosis: string }).diagnosis).toBe('new');
    expect(next[0].labResults).toBe(labs);
  });
  it('follows an IP-number change without leaving the old entry behind', () => {
    const next = applyPatientUpdate([p('OLD'), p('B')], p('NEW'), 'OLD')!;
    expect(next.map(x => x.ipNo).sort()).toEqual(['B', 'NEW']);
  });
  it('leaves the list alone for a patient not on this phone', () => {
    expect(applyPatientUpdate([p('A')], p('Z'))).toBeNull();
  });
});

describe('removePatientsFromList (a removed or moved patient)', () => {
  it('takes the patient off the list', () => {
    expect(removePatientsFromList([p('A'), p('B')], ['A', undefined])!.map(x => x.ipNo)).toEqual(['B']);
  });
  it('removes both numbers of a renamed patient', () => {
    expect(removePatientsFromList([p('OLD'), p('NEW'), p('B')], ['NEW', 'OLD'])!.map(x => x.ipNo)).toEqual(['B']);
  });
  it('returns null when nothing is removed', () => {
    expect(removePatientsFromList([p('A')], ['Z'])).toBeNull();
    expect(removePatientsFromList([p('A')], [undefined, null])).toBeNull();
  });
});
