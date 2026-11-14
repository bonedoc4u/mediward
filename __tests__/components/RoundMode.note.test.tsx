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
const draftText = (name: string): string | null => {
  const raw = localStorage.getItem(draftKeyFor(name));
  return raw === null ? null : (JSON.parse(raw) as { text: string }).text;
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  sessionStorage.setItem('mediward_round_ward', 'Female Ward');
  state.saveRound.mockResolvedValue({ status: 'saved' });
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
    expect(draftText('Asha')).toBe('Wound dry. Hb 9.8.');
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
    expect(opts).toEqual({ quiet: true, baseNoteAt: null });
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
    state.saveRound.mockResolvedValue({ status: 'queued' });
    render(<RoundMode />);
    fireEvent.change(noteBox(), { target: { value: 'Pin sites clean.' } });
    await act(async () => { done(); });
    await act(async () => { fireEvent.click(screen.getByLabelText('Jump to Asha, Bed 04')); });

    expect(screen.getByText(/Kept on this phone/)).toBeInTheDocument();
    expect(noteBox().value).toBe('Pin sites clean.');
    expect(draftText('Asha')).toBe('Pin sites clean.');
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

// Audit DATA-04: Dr R saved a note for the same patient while this doctor was typing.
describe('Round Mode — someone else wrote the note first', () => {
  const THEIRS = { roundNote: 'Drain removed. Start physio.', roundNoteBy: 'Dr R', roundNoteAt: '2026-11-13T04:20:00.5+00:00' };
  /**
   * Type a note for Asha and press Done (which moves on to Bina); the server
   * refuses the note because of THEIRS; then go back to Asha.
   */
  async function conflictOnAsha() {
    state.saveRound.mockResolvedValueOnce({ status: 'conflict', server: THEIRS });
    render(<RoundMode />);
    fireEvent.change(noteBox(), { target: { value: 'Wound dry.' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Done/ })); });
    await act(async () => { fireEvent.click(screen.getByLabelText('Jump to Asha, Bed 04')); });
  }

  it('says the note is not saved, shows their note, and keeps mine in the box and on the phone', async () => {
    await conflictOnAsha();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Your note is not saved. Dr R wrote a note first');
    expect(alert).toHaveTextContent('Drain removed. Start physio.');
    expect(noteBox().value).toBe('Wound dry.');
    expect(draftText('Asha')).toBe('Wound dry.');
    expect(screen.queryByText(/^Saved/)).not.toBeInTheDocument();
  });

  it('"Keep both" saves their note followed by mine, against THEIR version', async () => {
    await conflictOnAsha();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Keep both' })); });

    const [, round, opts] = lastSave();
    expect(round.roundNote).toBe('Drain removed. Start physio.\n\nWound dry.');
    expect(opts.baseNoteAt).toBe(THEIRS.roundNoteAt);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(draftText('Asha')).toBeNull();
  });

  it('"Use mine only" saves my text against their version', async () => {
    await conflictOnAsha();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Use mine only' })); });
    const [, round, opts] = lastSave();
    expect(round.roundNote).toBe('Wound dry.');
    expect(opts.baseNoteAt).toBe(THEIRS.roundNoteAt);
  });

  it('"Use theirs only" drops my draft, shows their note, and sends nothing', async () => {
    await conflictOnAsha();
    const callsBefore = state.saveRound.mock.calls.length;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Use theirs only' })); });

    expect(state.saveRound.mock.calls.length).toBe(callsBefore);
    expect(noteBox().value).toBe('Drain removed. Start physio.');
    expect(draftText('Asha')).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('pressing Done again while unresolved saves the orders but never sends my note over theirs', async () => {
    await conflictOnAsha();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Done/ })); });
    const [, round] = lastSave();
    expect('roundNote' in round).toBe(false);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('if I have already moved to the next bed, tells me which bed and marks it in the strip', async () => {
    let answer!: (r: unknown) => void;
    state.saveRound.mockReturnValueOnce(new Promise(resolve => { answer = resolve; }));
    render(<RoundMode />);
    fireEvent.change(noteBox(), { target: { value: 'Wound dry.' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Done/ })); });
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Bina');

    await act(async () => { answer({ status: 'conflict', server: THEIRS }); });

    expect(state.toast.warning).toHaveBeenCalledTimes(1);
    const message = state.toast.warning.mock.calls[0][0] as string;
    expect(message).toContain('Bed 04');
    expect(message).toContain('NOT saved');
    expect(message).toContain('Dr R');
    expect(screen.getByLabelText('Note not saved — needs your decision')).toBeInTheDocument();
    expect(draftText('Asha')).toBe('Wound dry.');
  });

  it('on the last patient, the "Round complete" screen lists the note that still needs a decision', async () => {
    state.patients = [patient('04', 'Asha')];
    state.saveRound.mockResolvedValueOnce({ status: 'conflict', server: THEIRS });
    render(<RoundMode />);
    fireEvent.change(noteBox(), { target: { value: 'Wound dry.' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Done/ })); });

    expect(screen.getByText('Round Complete')).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('1 note still needs you');
    expect(alert).toHaveTextContent('Asha');
    expect(state.toast.warning).toHaveBeenCalledTimes(1);

    // Tapping it goes back to that patient, with the choice waiting.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Asha/ })); });
    expect(screen.getByRole('alert')).toHaveTextContent('Dr R wrote a note first');
    expect(noteBox().value).toBe('Wound dry.');
  });
});
