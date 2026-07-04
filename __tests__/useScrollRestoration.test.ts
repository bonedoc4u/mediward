import { describe, it, expect, beforeEach } from 'vitest';
import {
  setLastViewedPatient,
  getLastViewedPatient,
  clearLastViewedPatient,
} from '../hooks/useScrollRestoration';

describe('last-viewed patient persistence', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('round-trips the last viewed patient ip through sessionStorage', () => {
    expect(getLastViewedPatient()).toBeNull();
    setLastViewedPatient('42955');
    expect(getLastViewedPatient()).toBe('42955');
  });

  it('clears the stored id so the highlight does not re-fire', () => {
    setLastViewedPatient('42955');
    clearLastViewedPatient();
    expect(getLastViewedPatient()).toBeNull();
  });

  it('overwrites with the most recently viewed patient', () => {
    setLastViewedPatient('1');
    setLastViewedPatient('2');
    expect(getLastViewedPatient()).toBe('2');
  });
});
