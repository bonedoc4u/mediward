import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockState = vi.hoisted(() => ({
  result: { data: null as any, error: null as any },
}));

vi.mock('../../lib/supabase', () => {
  const createBuilder = () => {
    const b: Record<string, any> = {
      then(onFulfilled: (v: any) => any) {
        return Promise.resolve(mockState.result).then(onFulfilled);
      },
    };
    for (const m of ['select', 'eq', 'insert', 'update', 'order', 'gte', 'lte', 'single']) {
      b[m] = vi.fn().mockReturnValue(b);
    }
    return b;
  };

  return {
    supabase: { from: vi.fn().mockImplementation(createBuilder) },
  };
});

import { supabase } from '../../lib/supabase';
import { stopMedication, recordAdministration } from '../../services/marService';

beforeEach(() => {
  mockState.result = { data: null, error: null };
  vi.clearAllMocks();
  const createBuilder = () => {
    const b: Record<string, any> = {
      then(onFulfilled: (v: any) => any) {
        return Promise.resolve(mockState.result).then(onFulfilled);
      },
    };
    for (const m of ['select', 'eq', 'insert', 'update', 'order', 'gte', 'lte', 'single']) {
      b[m] = vi.fn().mockReturnValue(b);
    }
    return b;
  };
  vi.mocked(supabase.from).mockImplementation(createBuilder as any);
});

// Regression: both functions used to discard the Supabase response entirely,
// so an RLS-blocked or otherwise failed write looked identical to success —
// e.g. "Stop" on a medication silently left it active while the UI removed it
// from the list, or a dose administration silently went unrecorded.

describe('stopMedication', () => {
  it('resolves when the update succeeds', async () => {
    mockState.result = { data: null, error: null };
    await expect(stopMedication('med-1')).resolves.toBeUndefined();
  });

  it('throws a descriptive error instead of silently no-op-ing when the update fails', async () => {
    mockState.result = { data: null, error: { message: 'permission denied' } };
    await expect(stopMedication('med-1')).rejects.toThrow('stopMedication');
    await expect(stopMedication('med-1')).rejects.toThrow('permission denied');
  });
});

describe('recordAdministration', () => {
  const admin = {
    hospitalId: 'h1', medicationId: 'med-1', patientIpNo: 'IP001',
    status: 'given' as const, administeredAt: '2024-01-15T08:00:00Z',
  };

  it('resolves when the insert succeeds', async () => {
    mockState.result = { data: null, error: null };
    await expect(recordAdministration(admin)).resolves.toBeUndefined();
  });

  it('throws a descriptive error instead of silently dropping the dose record when the insert fails', async () => {
    mockState.result = { data: null, error: { message: 'permission denied' } };
    await expect(recordAdministration(admin)).rejects.toThrow('recordAdministration');
    await expect(recordAdministration(admin)).rejects.toThrow('permission denied');
  });
});
