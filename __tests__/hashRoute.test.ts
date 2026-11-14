import { describe, it, expect } from 'vitest';
import { parseHashRoute } from '../utils/hashRoute';

describe('parseHashRoute', () => {
  // Regression: at start-up the id stayed inside the view name, which matched
  // no screen, so reloading a patient page showed the ward dashboard.
  it('separates the screen from the patient id', () => {
    expect(parseHashRoute('#/patient/TEST-0001')).toEqual({ view: 'patient', params: { id: 'TEST-0001' } });
    expect(parseHashRoute('#/radiology/IP2611027')).toEqual({ view: 'radiology', params: { id: 'IP2611027' } });
  });

  it('reads a screen without an id', () => {
    expect(parseHashRoute('#/round-mode')).toEqual({ view: 'round-mode', params: {} });
    expect(parseHashRoute('#/dashboard')).toEqual({ view: 'dashboard', params: {} });
    expect(parseHashRoute('#dashboard')).toEqual({ view: 'dashboard', params: {} });
  });

  it('returns an empty screen for an empty hash, so the caller can choose its default', () => {
    expect(parseHashRoute('')).toEqual({ view: '', params: {} });
    expect(parseHashRoute('#')).toEqual({ view: '', params: {} });
    expect(parseHashRoute('#/')).toEqual({ view: '', params: {} });
  });

  it('treats a trailing slash as no id', () => {
    expect(parseHashRoute('#/patient/')).toEqual({ view: 'patient', params: {} });
  });
});
