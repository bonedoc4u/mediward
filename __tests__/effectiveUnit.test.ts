import { describe, it, expect } from 'vitest';
import { resolveEffectiveUnit } from '../utils/effectiveUnit';

describe('resolveEffectiveUnit', () => {
  it('uses the picked unit for an admin who has selected a specific unit', () => {
    // Regression: PatientContext.tsx's loadAllPatients() used to pass
    // user.unit (always undefined for admins) instead of this value —
    // Master List (and the dashboard, which also loads the full list)
    // showed every unit's patients no matter what an admin selected.
    expect(resolveEffectiveUnit('admin', 'OR2', undefined)).toBe('OR2');
  });

  it('is unfiltered for an admin who has selected "all"', () => {
    expect(resolveEffectiveUnit('admin', 'all', undefined)).toBeUndefined();
  });

  it('is unfiltered for an admin who has not picked a unit yet (null)', () => {
    expect(resolveEffectiveUnit('admin', null, undefined)).toBeUndefined();
  });

  it('ignores selectedUnit for a non-admin — their own unit always applies', () => {
    expect(resolveEffectiveUnit('resident', 'OR2', 'OR1')).toBe('OR1');
  });

  it('is unfiltered for a non-admin with no unit assigned (e.g. ICU)', () => {
    expect(resolveEffectiveUnit('resident', null, undefined)).toBeUndefined();
  });
});
