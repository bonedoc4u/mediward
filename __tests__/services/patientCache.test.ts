import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveActiveCache, loadActiveCache, saveAllCache, loadAllCache, clearPatientCache,
} from '../../services/patientCache';
import { Patient, PatientStatus, PacStatus, Gender } from '../../types';

const HOSPITAL = 'h-1';
const LEGACY_ACTIVE = `mediward_patients_active_cache_${HOSPITAL}`;
const LEGACY_ALL    = `mediward_patients_all_cache_${HOSPITAL}`;

const patient: Patient = {
  ipNo: 'TEST-001', name: 'Patient A', mobile: '', age: 68, gender: Gender.Female,
  ward: 'Female Ward', bed: '04', diagnosis: '# NOF', comorbidities: [], doa: '2026-11-08',
  pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [], todos: [],
  drugAllergies: ['Penicillin'],
};

/** What the pre-fix app left on the phone: a patient loaded WITHOUT allergies. */
const writeLegacyCache = () => {
  const stale = JSON.stringify({
    version: 1, timestamp: new Date().toISOString(),
    data: { patients: [{ ...patient, drugAllergies: [] }], cachedAt: new Date().toISOString() },
  });
  localStorage.setItem(LEGACY_ACTIVE, stale);
  localStorage.setItem(LEGACY_ALL, stale);
};

beforeEach(() => localStorage.clear());

describe('patientCache', () => {
  it('round-trips the active and full lists per hospital', () => {
    saveActiveCache([patient], HOSPITAL);
    saveAllCache([patient], HOSPITAL);
    expect(loadActiveCache(HOSPITAL)?.patients[0].drugAllergies).toEqual(['Penicillin']);
    expect(loadAllCache(HOSPITAL)?.patients).toHaveLength(1);
    expect(loadActiveCache('another-hospital')).toBeNull();
  });

  // Regression (audit DATA-01): a cache written before the fix holds patients
  // without allergies. Editing one offline would queue a save that erases them.
  it('never serves a cache written by the pre-fix version', () => {
    writeLegacyCache();
    expect(loadActiveCache(HOSPITAL)).toBeNull();
    expect(loadAllCache(HOSPITAL)).toBeNull();
  });

  it('deletes the old cache so no patient data is left behind on the phone', () => {
    writeLegacyCache();
    loadActiveCache(HOSPITAL);
    expect(localStorage.getItem(LEGACY_ACTIVE)).toBeNull();
    expect(localStorage.getItem(LEGACY_ALL)).toBeNull();
  });

  it('clearPatientCache removes current and old caches', () => {
    writeLegacyCache();
    saveActiveCache([patient], HOSPITAL);
    saveAllCache([patient], HOSPITAL);
    clearPatientCache(HOSPITAL);
    expect(Object.keys(localStorage).filter(k => k.includes('patients_'))).toEqual([]);
  });
});
