/**
 * Patient page building blocks (audit UX-07): the round-notes timeline, the
 * orders card, and the slim identity bar that carries the allergy line.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import RoundNotesTimeline from '../../src/features/patient/RoundNotesTimeline';
import OrdersCard, { openForLabel } from '../../src/features/patient/OrdersCard';
import StickyPatientHeader from '../../components/patient/StickyPatientHeader';
import { DailyRound, Patient, PatientStatus, PacStatus, Gender } from '../../types';

const TODAY = '2026-11-13';
const DIAGNOSIS = '# Neck of femur (R)';
const round = (date: string, roundNote = '', over: Partial<DailyRound> = {}): DailyRound =>
  ({ date, note: DIAGNOSIS, todos: [], roundNote, ...over });
const at = (h: number, m: number) => new Date(2026, 10, 13, h, m).toISOString();

describe('RoundNotesTimeline', () => {
  const rounds = [
    round('2026-11-10', 'Post-op. Vitals stable.', { roundNoteBy: 'Dr S', roundNoteAt: at(18, 5) }),
    round(TODAY, 'Wound dry. Hb 9.8.', { roundNoteBy: 'Dr R', roundNoteAt: at(9, 20) }),
    round('2026-11-12', 'Hb 9.2 — repeat.', { roundNoteBy: 'Dr R', roundNoteAt: at(9, 41) }),
    round('2026-11-11'),   // rounded, but no note written: an old row with only the diagnosis copy
  ];

  it('lists real notes newest first, each with day, author and time', () => {
    render(<RoundNotesTimeline rounds={rounds} today={TODAY} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map(li => li.querySelector('p')!.textContent)).toEqual([
      'Today · Dr R · 09:20',
      'Yesterday · Dr R · 09:41',
      '10 Nov · Dr S · 18:05',
    ]);
    expect(within(items[0]).getByText('Wound dry. Hb 9.8.')).toBeInTheDocument();
  });

  // The old "Rounds History" printed the stored diagnosis copy for every day.
  it('never shows the diagnosis copy from older rows as a note', () => {
    render(<RoundNotesTimeline rounds={[round('2026-11-12'), round('2026-11-11')]} today={TODAY} />);
    expect(screen.queryByText(DIAGNOSIS)).not.toBeInTheDocument();
    expect(screen.getByText('No round notes yet.')).toBeInTheDocument();
  });

  it('does not change the order of the list it is given', () => {
    const original = rounds.map(r => r.date);
    render(<RoundNotesTimeline rounds={rounds} today={TODAY} />);
    expect(rounds.map(r => r.date)).toEqual(original);
  });

  it('offers "Write today\'s note" until there is one, then "Edit today\'s note"', () => {
    const onWrite = vi.fn();
    const { rerender } = render(<RoundNotesTimeline rounds={[rounds[2]]} today={TODAY} onWriteToday={onWrite} />);
    fireEvent.click(screen.getByRole('button', { name: "Write today's note" }));
    expect(onWrite).toHaveBeenCalledTimes(1);
    rerender(<RoundNotesTimeline rounds={rounds} today={TODAY} onWriteToday={onWrite} />);
    expect(screen.getByRole('button', { name: "Edit today's note" })).toBeInTheDocument();
  });

  it('has no write button for a user who cannot write', () => {
    render(<RoundNotesTimeline rounds={rounds} today={TODAY} />);
    expect(screen.queryByRole('button', { name: /today's note/ })).not.toBeInTheDocument();
  });

  it('shows three notes and opens the rest on request', () => {
    const many = ['09', '10', '11', '12', '13'].map(d => round(`2026-11-${d}`, `Note of ${d}`));
    render(<RoundNotesTimeline rounds={many} today={TODAY} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 5 notes' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });
});

describe('OrdersCard', () => {
  it('says how long an order has been open', () => {
    expect(openForLabel(TODAY, TODAY)).toBe('today');
    expect(openForLabel('2026-11-11', TODAY)).toBe('open 2 d');
    expect(openForLabel('2026-10-31', '2026-11-01')).toBe('open 1 d');
    expect(openForLabel(undefined, TODAY)).toBe('');
    expect(openForLabel('11/11/2026', TODAY)).toBe('');
  });

  it('lists open orders first with their age, then done orders', () => {
    render(<OrdersCard today={TODAY} todos={[
      { id: 'a', task: 'Physio review', isDone: true, addedDate: '2026-11-11' },
      { id: 'b', task: 'Nephrology opinion', isDone: false, addedDate: '2026-11-11' },
      { id: 'c', task: 'Repeat Hb', isDone: false, addedDate: TODAY },
      { id: 'd', task: '   ', isDone: false },
    ]} />);
    expect(screen.getByText('Orders · 2 open')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem').map(li => li.textContent);
    expect(items).toEqual(['Nephrology opinionopen 2 d', 'Repeat Hbtoday', 'Physio review']);
  });

  it('draws nothing when there are no orders', () => {
    const { container } = render(<OrdersCard today={TODAY} todos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('StickyPatientHeader (the identity bar)', () => {
  const patient: Patient = {
    ipNo: 'TEST-0001', name: 'Patient A', mobile: '', age: 68, gender: Gender.Female, ward: 'Female Ward', bed: '04',
    diagnosis: DIAGNOSIS, comorbidities: [], doa: '2026-11-08', pod: 4,
    pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
    dailyRounds: [], investigations: [], labResults: [], todos: [],
  };
  const status = { bg: 'bg-x', text: 'text-x', dot: 'bg-y' };

  it('carries the allergies with the identity', () => {
    render(<StickyPatientHeader patient={{ ...patient, drugAllergies: ['Penicillin', 'NSAIDs'] }} statusLabel="Fit" statusColor={status} visible />);
    expect(screen.getByText('Allergy: Penicillin, NSAIDs')).toBeInTheDocument();
    expect(screen.getByText('Patient A')).toBeInTheDocument();
  });

  it('has no allergy line when there are none', () => {
    render(<StickyPatientHeader patient={{ ...patient, drugAllergies: [' '] }} statusLabel="Fit" statusColor={status} visible />);
    expect(screen.queryByText(/Allergy/)).not.toBeInTheDocument();
  });

  // On a phone the full page scrolls on the window, so a sticky bar scrolled away.
  it('is pinned to the screen on the full page, and left sticky inside a sheet', () => {
    const { rerender } = render(<StickyPatientHeader patient={patient} statusLabel="Fit" statusColor={status} visible pinToViewport />);
    expect(screen.getByTestId('patient-identity-bar').className).toContain('patient-identity-bar--page');
    rerender(<StickyPatientHeader patient={patient} statusLabel="Fit" statusColor={status} visible />);
    expect(screen.getByTestId('patient-identity-bar').className).not.toContain('patient-identity-bar--page');
  });
});
