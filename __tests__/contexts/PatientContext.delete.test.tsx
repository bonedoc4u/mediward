/**
 * Regression test for audit finding DATA-06.
 *
 * deletePatient() used to take the patient off the ward list immediately and
 * only show a message if the server refused. The patient then stayed hidden
 * although still admitted. A patient must leave the list only after the
 * server confirms the removal.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { Patient, PatientStatus, PacStatus, Gender } from '../../types';

const mocks = vi.hoisted(() => ({
  removePatient: vi.fn(),
  fetchActivePatientsPage: vi.fn(),
  logAuditEvent: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Test Admin', email: 'a@test', role: 'admin', hospitalId: 'h-1', sessionExpiry: Date.now() + 1e6 },
    viewingHospitalId: null,
    selectedUnit: 'all',
  }),
}));

vi.mock('../../lib/supabase', () => {
  const channel: Record<string, unknown> = {};
  channel.on = () => channel;
  channel.subscribe = () => channel;
  return { supabase: { channel: () => channel, removeChannel: vi.fn(), from: vi.fn() } };
});

vi.mock('../../services/patientService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/patientService')>()),
  fetchActivePatientsPage: mocks.fetchActivePatientsPage,
  fetchActivePatients: vi.fn().mockResolvedValue([]),
  fetchAllPatients: vi.fn().mockResolvedValue([]),
  removePatient: mocks.removePatient,
}));
vi.mock('../../services/auditLog', () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock('../../services/pushNotifications', () => ({
  registerServiceWorker: vi.fn().mockResolvedValue(undefined),
  requestNotificationPermission: vi.fn().mockResolvedValue(false),
  checkAndNotifyAlerts: vi.fn(),
}));
vi.mock('../../utils/toast', () => ({ toast: mocks.toast }));
vi.mock('../../utils/capacitorInit', () => ({ hapticSuccess: vi.fn() }));

import { PatientProvider, usePatients } from '../../contexts/PatientContext';

const patient = (ipNo: string, name: string): Patient => ({
  ipNo, name, mobile: '', age: 50, gender: Gender.Male, ward: 'Male Ward', bed: ipNo.slice(-2),
  diagnosis: '# test', comorbidities: [], doa: '2026-11-10', hospitalId: 'h-1', version: 1,
  pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [], todos: [],
});

const Harness: React.FC = () => {
  const { patients, deletePatient } = usePatients();
  return (
    <div>
      <ul>{patients.map(p => <li key={p.ipNo}>{p.name}</li>)}</ul>
      <button onClick={() => deletePatient('TEST-01')}>delete A</button>
    </div>
  );
};

async function renderWard() {
  render(<PatientProvider><Harness /></PatientProvider>);
  await screen.findByText('Patient A');
  await screen.findByText('Patient B');
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.fetchActivePatientsPage.mockResolvedValue({
    patients: [patient('TEST-01', 'Patient A'), patient('TEST-02', 'Patient B')], hasMore: false,
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PatientContext.deletePatient', () => {
  it('keeps the patient on the ward list when the server refuses the removal', async () => {
    mocks.removePatient.mockRejectedValue(new Error('removePatient (TEST-01): TypeError: Failed to fetch'));
    await renderWard();

    await act(async () => { screen.getByText('delete A').click(); });

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    expect(screen.getByText('Patient A')).toBeInTheDocument();
    expect(mocks.toast.error.mock.calls[0][0]).toContain('NOT removed');
    expect(mocks.toast.success).not.toHaveBeenCalled();
    // Nothing was deleted, so nothing may be written to the audit trail as deleted.
    expect(mocks.logAuditEvent).not.toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'DELETE', expect.anything(), expect.anything(), expect.anything());
  });

  it('removes the patient only after the server has confirmed', async () => {
    let confirm!: () => void;
    mocks.removePatient.mockReturnValue(new Promise<void>(resolve => { confirm = resolve; }));
    await renderWard();

    await act(async () => { screen.getByText('delete A').click(); });
    // Request sent, no answer yet: the patient is still on the list.
    expect(mocks.removePatient).toHaveBeenCalledWith('TEST-01');
    expect(screen.getByText('Patient A')).toBeInTheDocument();

    await act(async () => { confirm(); });

    await waitFor(() => expect(screen.queryByText('Patient A')).not.toBeInTheDocument());
    expect(screen.getByText('Patient B')).toBeInTheDocument();
    expect(mocks.toast.success).toHaveBeenCalledWith('Patient A removed');
    expect(mocks.logAuditEvent).toHaveBeenCalledWith('u-1', 'Test Admin', 'DELETE', 'patient', 'TEST-01', 'Removed: Patient A');
  });
});
