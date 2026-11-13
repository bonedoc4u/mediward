/**
 * Audit finding SEC-06: role limits were only button-deep. These tests drive
 * the central save functions directly, the way any screen (or a forgotten
 * button) would, and check that each role can do exactly what the role table
 * says.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { Patient, PatientStatus, PacStatus, Gender, LabResult } from '../../types';

const auth = vi.hoisted(() => ({ role: 'attending' as string }));
const mocks = vi.hoisted(() => ({
  upsertPatient: vi.fn(),
  removePatient: vi.fn(),
  fetchPatientById: vi.fn(),
  fetchActivePatientsPage: vi.fn(),
  insertLab: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Test User', email: 't@test', role: auth.role, hospitalId: 'h-1', sessionExpiry: Date.now() + 1e6 },
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
  fetchPatientById: mocks.fetchPatientById,
  upsertPatient: mocks.upsertPatient,
  removePatient: mocks.removePatient,
}));
vi.mock('../../services/labsService', () => ({ insertLab: mocks.insertLab, deleteLab: vi.fn() }));
vi.mock('../../services/auditLog', () => ({ logAuditEvent: vi.fn() }));
vi.mock('../../services/pushNotifications', () => ({
  registerServiceWorker: vi.fn().mockResolvedValue(undefined),
  requestNotificationPermission: vi.fn().mockResolvedValue(false),
  checkAndNotifyAlerts: vi.fn(),
}));
vi.mock('../../utils/toast', () => ({ toast: mocks.toast }));
vi.mock('../../utils/capacitorInit', () => ({ hapticSuccess: vi.fn() }));

import { PatientProvider, usePatients } from '../../contexts/PatientContext';
import { getMainQueueSize, clearMainQueue } from '../../services/syncQueue';

const REFUSED = 'Your role cannot change this.';

const stored: Patient = {
  ipNo: 'TEST-01', name: 'Patient A', mobile: '', age: 50, gender: Gender.Male, ward: 'Male Ward', bed: '01',
  diagnosis: '# NOF right', comorbidities: [], drugAllergies: ['Penicillin'], doa: '2026-11-10',
  hospitalId: 'h-1', version: 1, pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [],
  todos: [{ id: 't1', task: 'Check Hb', isDone: false }],
} as Patient;

const lab: LabResult = { id: 'l1', date: '2026-11-13', type: 'Hb', value: 9.8 } as LabResult;

const Harness: React.FC = () => {
  const { patients, updatePatient, addPatient, deletePatient, addLabResult } = usePatients();
  const a = patients.find(p => p.ipNo === 'TEST-01');
  return (
    <div>
      <p data-testid="diagnosis">{a?.diagnosis}</p>
      <p data-testid="status">{a?.patientStatus}</p>
      <p data-testid="order">{a?.todos[0]?.isDone ? 'done' : 'open'}</p>
      <p data-testid="labs">{a?.labResults.length}</p>
      <p data-testid="count">{patients.length}</p>
      {a && <>
        <button onClick={() => updatePatient({ ...a, todos: [{ ...a.todos[0], isDone: true }] }, { quiet: true })}>tick order</button>
        <button onClick={() => updatePatient({ ...a, diagnosis: '# changed' })}>change diagnosis</button>
        <button onClick={() => updatePatient({ ...a, todos: [], drugAllergies: [] })}>orders and allergies</button>
        <button onClick={() => updatePatient({ ...a, patientStatus: PatientStatus.Discharged, dod: '2026-11-13' })}>discharge</button>
        <button onClick={() => addLabResult('TEST-01', lab)}>add lab</button>
        <button onClick={() => deletePatient('TEST-01')}>remove</button>
      </>}
      <button onClick={() => addPatient({ ...stored, ipNo: 'TEST-99', name: 'Patient New', version: undefined })}>admit</button>
    </div>
  );
};

async function renderAs(role: string) {
  auth.role = role;
  render(<PatientProvider><Harness /></PatientProvider>);
  await waitFor(() => expect(screen.getByTestId('diagnosis')).toHaveTextContent('# NOF right'));
}
const press = (name: string) => act(async () => { screen.getByText(name).click(); });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  clearMainQueue();
  mocks.fetchActivePatientsPage.mockResolvedValue({ patients: [stored], hasMore: false });
  mocks.upsertPatient.mockResolvedValue(2);
  mocks.insertLab.mockResolvedValue(undefined);
  mocks.removePatient.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('attending — round notes and orders only', () => {
  it('ticks an order, and the save sends only the orders column', async () => {
    await renderAs('attending');
    await press('tick order');

    expect(screen.getByTestId('order')).toHaveTextContent('done');
    expect(mocks.upsertPatient).toHaveBeenCalledTimes(1);
    expect(mocks.upsertPatient.mock.calls[0][2]).toEqual(['todos']);
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it('cannot change the diagnosis: nothing is sent and the screen keeps the stored value', async () => {
    await renderAs('attending');
    await press('change diagnosis');

    expect(mocks.upsertPatient).not.toHaveBeenCalled();
    expect(screen.getByTestId('diagnosis')).toHaveTextContent('# NOF right');
    expect(mocks.toast.error).toHaveBeenCalledWith(REFUSED);
  });

  it('cannot slip an allergy change in beside an order change', async () => {
    await renderAs('attending');
    await press('orders and allergies');
    expect(mocks.upsertPatient).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(REFUSED);
  });

  it.each([['discharge'], ['add lab'], ['remove'], ['admit']])('cannot %s', async action => {
    await renderAs('attending');
    await press(action);

    expect(mocks.upsertPatient).not.toHaveBeenCalled();
    expect(mocks.insertLab).not.toHaveBeenCalled();
    expect(mocks.removePatient).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(REFUSED);
    expect(screen.getByTestId('status')).toHaveTextContent('Fit');
    expect(screen.getByTestId('labs')).toHaveTextContent('0');
    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });
});

describe('house surgeon — add and edit, no discharge, no removal', () => {
  it('edits the diagnosis with a full save', async () => {
    await renderAs('house_surgeon');
    await press('change diagnosis');
    expect(mocks.upsertPatient).toHaveBeenCalledTimes(1);
    expect(mocks.upsertPatient.mock.calls[0][2]).toBeUndefined();     // whole record
    expect(screen.getByTestId('diagnosis')).toHaveTextContent('# changed');
  });

  it('adds a lab result', async () => {
    await renderAs('house_surgeon');
    await press('add lab');
    expect(screen.getByTestId('labs')).toHaveTextContent('1');
    expect(mocks.insertLab).toHaveBeenCalledTimes(1);
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it.each([['discharge'], ['remove']])('cannot %s', async action => {
    await renderAs('house_surgeon');
    await press(action);
    expect(mocks.upsertPatient).not.toHaveBeenCalled();
    expect(mocks.removePatient).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(REFUSED);
    expect(screen.getByTestId('status')).toHaveTextContent('Fit');
  });
});

describe('resident — may discharge, may not remove', () => {
  it('discharges', async () => {
    await renderAs('resident');
    await press('discharge');
    expect(mocks.upsertPatient).toHaveBeenCalledTimes(1);
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it('cannot remove a patient record', async () => {
    await renderAs('resident');
    await press('remove');
    expect(mocks.removePatient).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith(REFUSED);
  });
});

describe('admin', () => {
  it('removes a patient record', async () => {
    await renderAs('admin');
    await press('remove');
    await waitFor(() => expect(mocks.removePatient).toHaveBeenCalledWith('TEST-01'));
  });
});

// The app and the database can disagree for a moment: an old app version, or
// a role an admin changed a minute ago. Then the database refuses.
describe('when the database refuses a save because of the role', () => {
  it('says so, puts the stored record back on screen, and does not queue the change for retry', async () => {
    mocks.upsertPatient.mockRejectedValue(new Error('upsertPatient (TEST-01): ROLE_FORBIDDEN: role attending may change only the orders of a patient'));
    mocks.fetchPatientById.mockResolvedValue({ ...stored, version: 5 });
    await renderAs('resident');

    await press('change diagnosis');

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(REFUSED));
    await waitFor(() => expect(screen.getByTestId('diagnosis')).toHaveTextContent('# NOF right'));
    expect(getMainQueueSize()).toBe(0);
    expect(mocks.toast.warning).not.toHaveBeenCalled();     // no "Saved locally — will sync"
  });

  it('a refused admission does not stay on the ward list', async () => {
    mocks.upsertPatient.mockRejectedValue(new Error('upsertPatient (TEST-99): ROLE_FORBIDDEN: role attending may not add patients'));
    mocks.fetchPatientById.mockResolvedValue(null);
    await renderAs('resident');

    await press('admit');

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(REFUSED));
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));
    expect(getMainQueueSize()).toBe(0);
  });
});
