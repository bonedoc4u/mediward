import { describe, it, expect, vi } from 'vitest';

// The panel imports useSignedUrl → storageService → Supabase client; mock the
// hook so importing the module under test needs no Supabase environment.
vi.mock('../../hooks/useSignedUrl', () => ({
  useSignedUrl: vi.fn().mockReturnValue(undefined),
}));

import { phaseOf, isReportPending } from '../../components/patient/RadiologyPanel';
import { Investigation } from '../../types';

const makeInv = (overrides: Partial<Investigation> = {}): Investigation => ({
  id: 'inv1',
  date: '2026-07-01',
  type: 'X-Ray',
  findings: 'Implant in situ',
  imageUrl: '',
  ...overrides,
});

describe('phaseOf', () => {
  it('uses the explicit phase when set, ignoring dates', () => {
    expect(phaseOf(makeInv({ phase: 'postop', date: '2026-01-01' }), '2026-06-01')).toBe('postop');
    expect(phaseOf(makeInv({ phase: 'preop', date: '2026-12-01' }), '2026-06-01')).toBe('preop');
  });

  it('infers phase from the surgery date when phase is unset', () => {
    expect(phaseOf(makeInv({ date: '2026-05-31' }), '2026-06-01')).toBe('preop');
    expect(phaseOf(makeInv({ date: '2026-06-01' }), '2026-06-01')).toBe('postop'); // day-of counts as post-op
    expect(phaseOf(makeInv({ date: '2026-06-02' }), '2026-06-01')).toBe('postop');
  });

  it('returns undefined when there is no surgery date to compare against', () => {
    expect(phaseOf(makeInv(), undefined)).toBeUndefined();
  });
});

describe('isReportPending', () => {
  it('is pending when findings are empty or whitespace', () => {
    expect(isReportPending(makeInv({ findings: '' }))).toBe(true);
    expect(isReportPending(makeInv({ findings: '   ' }))).toBe(true);
  });

  it('is not pending once findings text exists', () => {
    expect(isReportPending(makeInv({ findings: 'No fracture' }))).toBe(false);
  });
});
