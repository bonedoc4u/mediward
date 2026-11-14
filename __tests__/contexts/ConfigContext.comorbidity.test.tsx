/**
 * Regression tests for the comorbidity preset save (audit SEC-06 step 4).
 *
 * Two things were wrong, and the database role rules would have turned both
 * into silent data loss:
 *  1. Adding a preset from the Add patient form saved the WHOLE hospital
 *     settings row from the phone's copy. A non-admin may change only the
 *     preset list, so the save must send only that.
 *  2. "Comorbidity list saved" was shown before the server answered, and a
 *     refusal was only written to the console.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  updateComorbidityMap: vi.fn(),
  upsertHospitalConfig: vi.fn(),
  fetchHospitalConfig: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Test Resident', email: 'r@test', role: 'resident', hospitalId: 'h-1', sessionExpiry: Date.now() + 1e6 },
    viewingHospitalId: null,
  }),
}));

vi.mock('../../lib/supabase', () => {
  const channel: Record<string, unknown> = {};
  channel.on = () => channel;
  channel.subscribe = () => channel;
  return { supabase: { channel: () => channel, removeChannel: vi.fn(), from: vi.fn() } };
});

vi.mock('../../services/configService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/configService')>()),
  fetchWards: vi.fn().mockResolvedValue([]),
  fetchLabTypes: vi.fn().mockResolvedValue([]),
  fetchUnitChiefs: vi.fn().mockResolvedValue({}),
  fetchMedications: vi.fn().mockResolvedValue([]),
  fetchDepartmentTemplate: vi.fn().mockResolvedValue(null),
  fetchHospitalConfig: mocks.fetchHospitalConfig,
  updateComorbidityMap: mocks.updateComorbidityMap,
  upsertHospitalConfig: mocks.upsertHospitalConfig,
}));
vi.mock('../../utils/toast', () => ({ toast: mocks.toast }));

import { ConfigProvider, useConfig } from '../../contexts/ConfigContext';

const STORED = [{ short: 'HTN', full: 'Hypertension' }];
const EDITED = [...STORED, { short: 'CKD', full: 'Chronic kidney disease' }];

const Harness: React.FC = () => {
  const { comorbidityMap, saveComorbidityMap, hospitalName } = useConfig();
  return (
    <div>
      <p data-testid="hospital">{hospitalName}</p>
      <ul>{comorbidityMap.map(c => <li key={c.short}>{c.short}</li>)}</ul>
      <button onClick={() => { void saveComorbidityMap(EDITED); }}>add CKD</button>
    </div>
  );
};

async function renderConfig() {
  render(<ConfigProvider><Harness /></ConfigProvider>);
  await waitFor(() => expect(screen.getByTestId('hospital')).toHaveTextContent('Test Hospital'));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.fetchHospitalConfig.mockResolvedValue({
    hospitalName: 'Test Hospital', department: 'DEPARTMENT OF ORTHOPAEDICS', units: ['OR1'], comorbidityMap: STORED,
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ConfigContext.saveComorbidityMap', () => {
  it('sends only the preset list, never the whole settings row', async () => {
    mocks.updateComorbidityMap.mockResolvedValue(true);
    await renderConfig();

    await act(async () => { screen.getByText('add CKD').click(); });

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith('Comorbidity list saved'));
    expect(mocks.updateComorbidityMap).toHaveBeenCalledWith(EDITED);
    expect(mocks.upsertHospitalConfig).not.toHaveBeenCalled();
    expect(screen.getByText('CKD')).toBeInTheDocument();
  });

  it('says "saved" only after the server has answered', async () => {
    let answer!: (saved: boolean) => void;
    mocks.updateComorbidityMap.mockReturnValue(new Promise<boolean>(resolve => { answer = resolve; }));
    await renderConfig();

    await act(async () => { screen.getByText('add CKD').click(); });
    expect(mocks.toast.success).not.toHaveBeenCalled();

    await act(async () => { answer(true); });
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled());
  });

  it('a refusal for the role: the list goes back, and the user is told why', async () => {
    mocks.updateComorbidityMap.mockRejectedValue(
      new Error('updateComorbidityMap: ROLE_FORBIDDEN: your role cannot change hospital settings'));
    await renderConfig();

    await act(async () => { screen.getByText('add CKD').click(); });

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('Your role cannot change this.'));
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(screen.queryByText('CKD')).not.toBeInTheDocument();
    expect(screen.getByText('HTN')).toBeInTheDocument();
  });

  it('a failed save (no connection): the list goes back and the message says NOT saved', async () => {
    mocks.updateComorbidityMap.mockRejectedValue(new Error('updateComorbidityMap: TypeError: Failed to fetch'));
    await renderConfig();

    await act(async () => { screen.getByText('add CKD').click(); });

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    expect(mocks.toast.error.mock.calls[0][0]).toContain('NOT saved');
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(screen.queryByText('CKD')).not.toBeInTheDocument();
  });

  it('first set-up (no settings row yet): falls back to creating the row', async () => {
    mocks.updateComorbidityMap.mockResolvedValue(false);
    mocks.upsertHospitalConfig.mockResolvedValue(undefined);
    await renderConfig();

    await act(async () => { screen.getByText('add CKD').click(); });

    await waitFor(() => expect(mocks.upsertHospitalConfig).toHaveBeenCalledTimes(1));
    expect(mocks.upsertHospitalConfig.mock.calls[0][0].comorbidityMap).toEqual(EDITED);
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled());
  });
});
