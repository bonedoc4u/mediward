/**
 * Regression test for audit finding SAFE-01: Round Mode showed "the patient
 * at position N". When the live list changed, position N became a different
 * patient while the doctor was typing an order for the first one.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Patient, PatientStatus, PacStatus, Gender } from '../../types';

const state = vi.hoisted(() => ({
  patients: [] as unknown[],
  updatePatient: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('../../contexts/AppContext', () => ({
  useApp: () => ({
    patients: state.patients, updatePatient: state.updatePatient, saveRound: vi.fn().mockResolvedValue({ status: 'saved' }),
    navigateTo: vi.fn(), sessionExpired: false, logout: vi.fn(),
  }),
  usePatients: () => ({ forceReconnect: vi.fn() }),
  useConfig: () => ({ icuWardNames: new Set<string>(), customTodoShortcuts: [] }),
}));
// Round Mode asks the role table which controls to switch on.
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Test Resident', email: 'r@test', role: 'resident', hospitalId: 'h-1', sessionExpiry: Date.now() + 1e6 } }),
}));
vi.mock('../../hooks/useNetworkQuality', () => ({ useNetworkQuality: () => ({ quality: 'good' }) }));
vi.mock('../../components/PacFlowChart', () => ({ default: () => null }));
vi.mock('../../components/RoundModeOfflineBanner', () => ({ RoundModeOfflineBanner: () => null }));
vi.mock('../../utils/capacitorInit', () => ({ hapticTap: () => Promise.resolve() }));
vi.mock('../../utils/toast', () => ({ toast: state.toast }));

import RoundMode from '../../components/RoundMode';
import { startRoundAt } from '../../utils/roundPosition';

const patient = (bed: string, name: string): Patient => ({
  ipNo: `IP-${name}`, name, mobile: '', age: 50, gender: Gender.Male, ward: 'Male Ward', bed,
  diagnosis: `# fracture of ${name}`, comorbidities: [], doa: '2026-11-10', dos: '2026-11-11',
  pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [], todos: [],
});

const A = patient('02', 'Asha');
const B = patient('04', 'Babu');
const C = patient('06', 'Chitra');
const onScreen = () => screen.getByRole('heading', { level: 3 }).textContent;

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem('mediward_round_ward', 'Male Ward');
  state.patients = [A, B, C];
});

describe('Round Mode keeps the same patient on screen', () => {
  it('stays on Babu when a colleague admits a patient into an earlier bed', () => {
    const { rerender } = render(<RoundMode />);
    fireEvent.click(screen.getByLabelText('Jump to Babu, Bed 04'));
    expect(onScreen()).toBe('Babu');

    // Realtime: a new admission in bed 01 sorts to the front of the list.
    state.patients = [patient('01', 'Newcomer'), A, B, C];
    rerender(<RoundMode />);

    expect(onScreen()).toBe('Babu');
    expect(state.toast.warning).not.toHaveBeenCalled();
  });

  it('an order typed for Babu is added to Babu after the list changes', () => {
    const { rerender } = render(<RoundMode />);
    fireEvent.click(screen.getByLabelText('Jump to Babu, Bed 04'));
    fireEvent.change(screen.getByPlaceholderText('New order / task…'), { target: { value: 'Repeat Hb' } });

    state.patients = [patient('01', 'Newcomer'), A, B, C];
    rerender(<RoundMode />);
    fireEvent.keyDown(screen.getByPlaceholderText('New order / task…'), { key: 'Enter' });

    expect(state.updatePatient).toHaveBeenCalledTimes(1);
    const saved = state.updatePatient.mock.calls[0][0] as Patient;
    expect(saved.ipNo).toBe('IP-Babu');
    expect(saved.todos.map(t => t.task)).toEqual(['Repeat Hb']);
  });

  it('says so, and drops the half-typed order, when the patient on screen leaves the list', async () => {
    const { rerender } = render(<RoundMode />);
    fireEvent.click(screen.getByLabelText('Jump to Babu, Bed 04'));
    fireEvent.change(screen.getByPlaceholderText('New order / task…'), { target: { value: 'Repeat Hb' } });

    // A colleague discharges Babu.
    state.patients = [A, C];
    await act(async () => { rerender(<RoundMode />); });

    expect(onScreen()).toBe('Chitra');
    expect(state.toast.warning).toHaveBeenCalledTimes(1);
    expect(state.toast.warning.mock.calls[0][0]).toContain('Bed 06');
    expect(state.toast.warning.mock.calls[0][0]).toContain('Chitra');
    expect((screen.getByPlaceholderText('New order / task…') as HTMLInputElement).value).toBe('');
  });

  it('up and down arrow keys no longer change the patient; left and right do', () => {
    vi.useFakeTimers();
    render(<RoundMode />);
    expect(onScreen()).toBe('Asha');

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(onScreen()).toBe('Asha');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onScreen()).toBe('Babu');
    vi.useRealTimers();
  });

  it('a vertical scroll that drifts sideways does not change the patient', () => {
    const { container } = render(<RoundMode />);
    const root = container.firstElementChild as HTMLElement;

    fireEvent.touchStart(root, { touches: [{ clientX: 200, clientY: 600 }] });
    fireEvent.touchEnd(root, { changedTouches: [{ clientX: 130, clientY: 300 }] });
    expect(onScreen()).toBe('Asha');

    fireEvent.touchStart(root, { touches: [{ clientX: 300, clientY: 400 }] });
    fireEvent.touchEnd(root, { changedTouches: [{ clientX: 150, clientY: 410 }] });
    expect(onScreen()).toBe('Babu');
  });

  // "Write today's note" on the patient page.
  it('opens on the patient another screen asked for, in that patient\'s ward', () => {
    sessionStorage.clear();
    startRoundAt(C);
    render(<RoundMode />);
    expect(onScreen()).toBe('Chitra');
  });
});
