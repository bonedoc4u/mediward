import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveActiveCache, loadActiveCache, saveAllCache, loadAllCache, clearPatientCache,
  clearAllPatientCaches, PATIENT_CACHE_MAX_AGE_MS,
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

// Audit SEC-04: the last ward list stayed readable in the phone's storage
// after a session had ended, and for as long as nobody signed out by hand.
describe('patientCache — nothing outlives its session', () => {
  afterEach(() => vi.useRealTimers());

  it('clearAllPatientCaches removes every hospital\'s lists, in old and new formats', () => {
    saveActiveCache([patient], 'h-1');
    saveAllCache([patient], 'h-1');
    saveActiveCache([patient], 'h-2');          // e.g. a super-admin viewing another hospital
    localStorage.setItem('mediward_patients_active_cache_h-3', '{"version":1,"data":{"patients":[]}}');   // pre-v2 format
    localStorage.setItem('mediward_session', 'keep-me');
    localStorage.setItem('mediward_sync_queue', '[]');

    clearAllPatientCaches();

    expect(Object.keys(localStorage).filter(k => k.includes('patients_'))).toEqual([]);
    // Only patient lists go: the session marker and unsent changes are not this function's business.
    expect(localStorage.getItem('mediward_session')).toBe('keep-me');
    expect(localStorage.getItem('mediward_sync_queue')).toBe('[]');
  });

  it('a list older than the limit is never shown and is deleted on sight', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T08:00:00Z'));
    saveActiveCache([patient], HOSPITAL);
    saveAllCache([patient], HOSPITAL);

    vi.setSystemTime(new Date(Date.now() + PATIENT_CACHE_MAX_AGE_MS - 60_000));
    expect(loadActiveCache(HOSPITAL)?.patients).toHaveLength(1);   // just inside the limit

    vi.setSystemTime(new Date(Date.now() + 120_000));               // now just past it
    expect(loadActiveCache(HOSPITAL)).toBeNull();
    expect(loadAllCache(HOSPITAL)).toBeNull();
    expect(Object.keys(localStorage).filter(k => k.includes('patients_'))).toEqual([]);
  });

  it('a list with an unreadable timestamp is treated as too old', () => {
    localStorage.setItem(`mediward_patients_active_cache_v2_${HOSPITAL}`, JSON.stringify({
      version: 1, timestamp: 'x', data: { patients: [patient], cachedAt: 'not a date' },
    }));
    expect(loadActiveCache(HOSPITAL)).toBeNull();
  });
});
