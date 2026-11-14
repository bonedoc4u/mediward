/**
 * PatientContext.saveRound with the round note:
 *  - reports honestly whether the server has it ('saved') or the phone does ('queued'),
 *  - an orders-only save never drops or blanks the note,
 *  - a failed save is queued exactly once.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Patient, PatientStatus, PacStatus, Gender, DailyRound } from '../../types';

const mocks = vi.hoisted(() => ({
  upsertRound: vi.fn(),
  fetchActivePatientsPage: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', name: 'Test Resident', email: 'r@test', role: 'resident', hospitalId: 'h-1', sessionExpiry: Date.now() + 1e6 },
    viewingHospitalId: null,
    selectedUnit: null,
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
}));
vi.mock('../../services/roundsService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/roundsService')>()),
  upsertRound: mocks.upsertRound,
}));
vi.mock('../../services/auditLog', () => ({ logAuditEvent: vi.fn() }));
vi.mock('../../services/pushNotifications', () => ({
  registerServiceWorker: vi.fn().mockResolvedValue(undefined),
  requestNotificationPermission: vi.fn().mockResolvedValue(false),
  checkAndNotifyAlerts: vi.fn(),
}));
vi.mock('../../utils/toast', () => ({ toast: mocks.toast }));
vi.mock('../../utils/capacitorInit', () => ({ hapticSuccess: vi.fn() }));

import { PatientProvider, usePatients } from '../../contexts/PatientContext';
import { getQueue, clearMainQueue, clearDeadLetterQueue } from '../../services/syncQueue';

const DATE = '2026-11-13';
const STAMP = { roundNote: 'Wound dry.', roundNoteBy: 'Test Resident', roundNoteAt: '2026-11-13T04:11:00Z' };

const basePatient: Patient = {
  ipNo: 'TEST-01', name: 'Patient A', mobile: '', age: 68, gender: Gender.Female, ward: 'Female Ward', bed: '04',
  diagnosis: '# NOF', comorbidities: [], doa: '2026-11-10', hospitalId: 'h-1', version: 1,
  pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [], todos: [],
};

let api!: ReturnType<typeof usePatients>;
const Harness: React.FC = () => {
  api = usePatients();
  const today = api.patients[0]?.dailyRounds.find(r => r.date === DATE);
  return (
    <div>
      <p data-testid="loaded">{api.patients.length}</p>
      <p data-testid="note">{today?.roundNote ?? '(none)'}</p>
      <p data-testid="by">{today?.roundNoteBy ?? '(nobody)'}</p>
      <p data-testid="orders">{(today?.todos ?? []).map(t => t.task).join(',')}</p>
    </div>
  );
};

async function renderWard(rounds: DailyRound[] = []) {
  mocks.fetchActivePatientsPage.mockResolvedValue({ patients: [{ ...basePatient, dailyRounds: rounds }], hasMore: false });
  render(<PatientProvider><Harness /></PatientProvider>);
  await screen.findByText('1');
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  clearMainQueue();
  clearDeadLetterQueue();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PatientContext.saveRound', () => {
  it("resolves 'saved' and shows the author the database recorded", async () => {
    mocks.upsertRound.mockResolvedValue(STAMP);
    await renderWard();

    let result: string | undefined;
    await act(async () => { result = await api.saveRound('TEST-01', { date: DATE, note: '# NOF', todos: [], roundNote: 'Wound dry.' }); });

    expect(result).toBe('saved');
    expect(screen.getByTestId('note')).toHaveTextContent('Wound dry.');
    expect(screen.getByTestId('by')).toHaveTextContent('Test Resident');
    expect(getQueue()).toHaveLength(0);
  });

  it('an orders-only save keeps the note and its author on screen', async () => {
    mocks.upsertRound.mockResolvedValue(STAMP);
    await renderWard([{ date: DATE, note: '# NOF', todos: [], ...STAMP }]);

    await act(async () => {
      await api.saveRound('TEST-01', { date: DATE, note: '# NOF', todos: [{ id: 't1', task: 'Repeat Hb', isDone: false }] });
    });

    expect(mocks.upsertRound.mock.calls[0][2].roundNote).toBeUndefined();
    expect(screen.getByTestId('note')).toHaveTextContent('Wound dry.');
    expect(screen.getByTestId('by')).toHaveTextContent('Test Resident');
    expect(screen.getByTestId('orders')).toHaveTextContent('Repeat Hb');
  });

  it("resolves 'queued', queues the note exactly once, and keeps it on screen when the server cannot be reached", async () => {
    mocks.upsertRound.mockRejectedValue(new Error('upsertRound(TEST-01): TypeError: Failed to fetch'));
    await renderWard();

    let result: string | undefined;
    await act(async () => { result = await api.saveRound('TEST-01', { date: DATE, note: '# NOF', todos: [], roundNote: 'Pin sites clean.' }); });

    expect(result).toBe('queued');
    const rounds = getQueue().filter(op => op.type === 'upsert_round');
    expect(rounds).toHaveLength(1);
    expect(rounds[0].payload).toEqual({
      patient_ip_no: 'TEST-01', hospital_id: 'h-1', date: DATE, note: '# NOF', todos: [], round_note: 'Pin sites clean.',
    });
    expect(screen.getByTestId('note')).toHaveTextContent('Pin sites clean.');
    expect(mocks.toast.warning).toHaveBeenCalledTimes(1);
  });

  it('a queued orders-only save carries no round_note, so replaying it later cannot blank a note', async () => {
    mocks.upsertRound.mockRejectedValue(new Error('TypeError: Failed to fetch'));
    await renderWard();
    await act(async () => { await api.saveRound('TEST-01', { date: DATE, note: '# NOF', todos: [] }); });
    expect('round_note' in (getQueue()[0].payload as object)).toBe(false);
  });

  it('quiet mode leaves the message to the screen that asked for it', async () => {
    mocks.upsertRound.mockRejectedValue(new Error('TypeError: Failed to fetch'));
    await renderWard();
    await act(async () => { await api.saveRound('TEST-01', { date: DATE, note: '# NOF', todos: [], roundNote: 'x' }, { quiet: true }); });
    expect(mocks.toast.warning).not.toHaveBeenCalled();
  });
});
