/**
 * Round Mode: the round note (audit UX-01) and the allergy line.
 * Before this change no screen had a note field; "saving a round" stored a
 * copy of the diagnosis.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { Patient, PatientStatus, PacStatus, Gender, DailyRound } from '../../types';
import { localYmd, todayYmd } from '../../utils/dates';

const state = vi.hoisted(() => ({
  patients: [] as unknown[],
  updatePatient: vi.fn(),
  saveRound: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('../../contexts/AppContext', () => ({
  useApp: () => ({
    patients: state.patients, updatePatient: state.updatePatient, saveRound: state.saveRound,
    navigateTo: vi.fn(), sessionExpired: false, logout: vi.fn(),
  }),
  usePatients: () => ({ forceReconnect: vi.fn() }),
  useConfig: () => ({ icuWardNames: new Set<string>(), customTodoShortcuts: [] }),
}));
vi.mock('../../hooks/useSaveRoundNote', () => ({
  useSaveRoundNote: () => ({ conflict: null, resolveConflict: vi.fn(), dismissConflict: vi.fn() }),
}));
vi.mock('../../hooks/useNetworkQuality', () => ({ useNetworkQuality: () => ({ quality: 'good' }) }));
vi.mock('../../components/PacFlowChart', () => ({ default: () => null }));
vi.mock('../../components/RoundModeOfflineBanner', () => ({ RoundModeOfflineBanner: () => null }));
vi.mock('../../components/RoundConflictModal', () => ({ RoundConflictModal: () => null }));
vi.mock('../../utils/capacitorInit', () => ({ hapticTap: () => Promise.resolve() }));
vi.mock('../../utils/toast', () => ({ toast: state.toast }));

import RoundMode from '../../components/RoundMode';

const TODAY = todayYmd();
const YESTERDAY = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return localYmd(d); })();
const DIAGNOSIS = '# Neck of femur (R)';

const patient = (bed: string, name: string, over: Partial<Patient> = {}): Patient => ({
  ipNo: `IP-${name}`, name, mobile: '', age: 68, gender: Gender.Female, ward: 'Female Ward', bed,
  diagnosis: DIAGNOSIS, comorbidities: [], doa: '2026-11-08',
  pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [], todos: [], ...over,
});
const legacyRound = (date: string): DailyRound => ({ date, note: DIAGNOSIS, todos: [], roundNote: '' });

const noteBox = () => screen.getByLabelText("Today's note") as HTMLTextAreaElement;
const done = () => fireEvent.click(screen.getByRole('button', { name: /^Done/ }));
const lastSave = () => state.saveRound.mock.calls[state.saveRound.mock.calls.length - 1];
const draftKeyFor = (name: string) => `mediward_round_draft_${TODAY}_IP-${name}`;

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  sessionStorage.setItem('mediward_round_ward', 'Female Ward');
  state.saveRound.mockResolvedValue('saved');
  state.patients = [
    patient('04', 'Asha', {
      drugAllergies: ['Penicillin', 'NSAIDs'],
      dailyRounds: [{ date: YESTERDAY, note: DIAGNOSIS, todos: [], roundNote: 'Wound dry. Repeat Hb.', roundNoteBy: 'Dr R' }],
    }),
    patient('06', 'Bina', { dailyRounds: [legacyRound(YESTERDAY)] }),
  ];
});

describe('Round Mode — reading', () => {
  it('shows drug allergies under the patient header', () => {
    render(<RoundMode />);
    expect(screen.getByRole('note')).toHaveTextContent('Allergy: Penicillin, NSAIDs');
  });

  it('shows no allergy line for a patient without allergies', () => {
    render(<RoundMode />);
    fireEvent.click(screen.getByLabelText('Jump to Bina, Bed 06'));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it("shows yesterday's note with its author, above today's empty note", () => {
    render(<RoundMode />);
    expect(screen.getByText('Wound dry. Repeat Hb.')).toBeInTheDocument();
    expect(screen.getByText(/Yesterday · Dr R/)).toBeInTheDocument();
    expect(noteBox().value).toBe('');
  });

  // Every row written by older versions holds the diagnosis in `note`.
  it('does not present the old diagnosis copy as a note', () => {
    render(<RoundMode />);
    fireEvent.click(screen.getByLabelText('Jump to Bina, Bed 06'));
    expect(screen.queryByText('Copy forward')).not.toBeInTheDocument();
    expect(screen.getByText('No note for today yet')).toBeInTheDocument();
  });

  it('Copy forward puts the last note into today and marks it unsaved', () => {
    render(<RoundMode />);
    fireEvent.click(screen.getByText('Copy forward'));
    expect(noteBox().value).toBe('Wound dry. Repeat Hb.');
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
  });
});

describe('Round Mode — writing', () => {
  it('typing is kept on the phone at once and shown as not saved', () => {
    render(<RoundMode />);
    fireEvent.change(noteBox(), { target: { value: 'Wound dry. Hb 9.8.' } });
    expect(localStorage.getItem(draftKeyFor('Asha'))).toBe('Wound dry. Hb 9.8.');
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
    expect(state.saveRound).not.toHaveBeenCalled();
  });

  it('Done saves the note for this patient, quietly, and moves to the next bed', async () => {
    render(<RoundMode />);
    fireEvent.change(noteBox(), { target: { value: '  Wound dry. Hb 9.8.  ' } });
    await act(async () => { done(); });

    // Exactly one request: saving and moving on must not send the note twice.
    expect(state.saveRound).toHaveBeenCalledTimes(1);
    const [ipNo, round, opts] = lastSave();
    expect(ipNo).toBe('IP-Asha');
    expect(round).toEqual({ date: TODAY, note: DIAGNOSIS, todos: [], roundNote: 'Wound dry. Hb 9.8.' });
    expect(opts).toEqual({ quiet: true });
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Bina');
    // The server confirmed, so the phone's draft copy is no longer needed.
    await waitFor(() => expect(localStorage.getItem(draftKeyFor('Asha'))).toBeNull());
  });

  // Protects a colleague's note this phone has not loaded yet.
  it('Done without touching the note saves the orders only — no roundNote key at all', async () => {
    render(<RoundMode />);
    await act(async () => { done(); });
    const [, round] = lastSave();
    expect(round).toEqual({ date: TODAY, note: DIAGNOSIS, todos: [] });
    expect('roundNote' in round).toBe(false);
  });

  it('when the server cannot be reached, says the note is kept on this phone and keeps the draft', async () => {
    state.saveRound.mockResolvedValue('queued');
    render(<RoundMode />);
    fireEvent.change(noteBox(), { target: { value: 'Pin sites clean.' } });
    await act(async () => { done(); });
    await act(async () => { fireEvent.click(screen.getByLabelText('Jump to Asha, Bed 04')); });

    expect(screen.getByText(/Kept on this phone/)).toBeInTheDocument();
    expect(noteBox().value).toBe('Pin sites clean.');
    expect(localStorage.getItem(draftKeyFor('Asha'))).toBe('Pin sites clean.');
  });

  it('leaving a patient another way with an unsent note sends it instead of leaving a silent draft', async () => {
    render(<RoundMode />);
    fireEvent.change(noteBox(), { target: { value: 'Afebrile.' } });
    await act(async () => { fireEvent.click(screen.getByLabelText('Jump to Bina, Bed 06')); });

    expect(state.saveRound).toHaveBeenCalledTimes(1);
    expect(lastSave()[0]).toBe('IP-Asha');
    expect(lastSave()[1].roundNote).toBe('Afebrile.');
    expect(noteBox().value).toBe('');   // Bina's box, not Asha's text
  });

  it('a draft survives closing and reopening the app', () => {
    const first = render(<RoundMode />);
    fireEvent.change(noteBox(), { target: { value: 'Half a sentence' } });
    first.unmount();

    render(<RoundMode />);
    expect(noteBox().value).toBe('Half a sentence');
    expect(screen.getByText('Not saved yet')).toBeInTheDocument();
  });

  it('a quick phrase is added to the note', () => {
    render(<RoundMode />);
    fireEvent.click(screen.getByRole('button', { name: '+ Afebrile' }));
    expect(noteBox().value).toBe('Afebrile. ');
  });

  it('ticking an order does not pop a toast over the Done button', () => {
    state.patients = [patient('04', 'Asha', { todos: [{ id: 't1', task: 'Repeat Hb', isDone: false }] })];
    render(<RoundMode />);
    fireEvent.click(screen.getByText('Repeat Hb'));
    expect(state.updatePatient).toHaveBeenCalledWith(expect.objectContaining({ ipNo: 'IP-Asha' }), { quiet: true });
  });
});
