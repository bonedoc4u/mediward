/**
 * The phone ward card (audit UX-05, UX-06).
 * Before: two comorbidities then "+N more", procedure in small grey text with
 * no date, no allergy, no last note, and a red bed badge for every ICU bed.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import PatientCard from '../../src/features/ward/PatientCard';
import { Patient, PatientStatus, PacStatus, Gender, DailyRound } from '../../types';

const TODAY = '2026-11-13';
const DIAGNOSIS = 'Polytrauma: # pelvis, # distal radius (L)';

const patient = (over: Partial<Patient> = {}): Patient => ({
  ipNo: 'TEST-0005', name: 'Patient E (long name to test wrapping on a small phone screen)', mobile: '',
  age: 61, gender: Gender.Male, ward: 'Ortho ICU', bed: '24-03',
  diagnosis: DIAGNOSIS, procedure: 'Ex-fix pelvis + ORIF radius', dos: '2026-11-10',
  comorbidities: ['T2DM', 'HTN', 'CKD 3', 'IHD'], doa: '2026-11-10',
  pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [], todos: [], ...over,
});
const round = (date: string, over: Partial<DailyRound> = {}): DailyRound =>
  ({ date, note: DIAGNOSIS, todos: [], roundNote: '', ...over });

describe('PatientCard — the five things a round is run from', () => {
  it('shows every comorbidity, never "+N more"', () => {
    render(<PatientCard patient={patient()} today={TODAY} />);
    const list = screen.getByLabelText('Comorbidities');
    for (const c of ['T2DM', 'HTN', 'CKD 3', 'IHD']) expect(within(list).getByText(c)).toBeInTheDocument();
    expect(screen.queryByText(/more/i)).not.toBeInTheDocument();
  });

  it('shows the procedure with the date of surgery', () => {
    render(<PatientCard patient={patient()} today={TODAY} />);
    expect(screen.getByText('Ex-fix pelvis + ORIF radius · 10 Nov')).toBeInTheDocument();
  });

  it('shows the post-op day (day of surgery counts as 1) and hides it before surgery', () => {
    const { rerender } = render(<PatientCard patient={patient()} today={TODAY} />);
    expect(screen.getByText('POD').nextSibling).toHaveTextContent('4');
    rerender(<PatientCard patient={patient({ dos: undefined, procedure: undefined })} today={TODAY} />);
    expect(screen.queryByText('POD')).not.toBeInTheDocument();
  });

  it('shows the whole name and the short bed number', () => {
    render(<PatientCard patient={patient()} today={TODAY} />);
    expect(screen.getByText('Patient E (long name to test wrapping on a small phone screen)')).toBeInTheDocument();
    expect(screen.getByText('03')).toBeInTheDocument();
  });

  it('shows drug allergies', () => {
    render(<PatientCard patient={patient({ drugAllergies: ['Penicillin', 'NSAIDs'] })} today={TODAY} />);
    expect(screen.getByRole('note')).toHaveTextContent('Allergy: Penicillin, NSAIDs');
  });

  it('has no allergy line when there are none', () => {
    render(<PatientCard patient={patient({ drugAllergies: [] })} today={TODAY} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});

describe('PatientCard — the last round note', () => {
  it("shows yesterday's note with who wrote it when not yet rounded today", () => {
    const rounds = [round('2026-11-12', { roundNote: 'Pin sites clean. Continue IV antibiotics.', roundNoteBy: 'Dr R' })];
    render(<PatientCard patient={patient({ dailyRounds: rounds })} today={TODAY} />);
    expect(screen.getByText('Not rounded today')).toBeInTheDocument();
    expect(screen.getByText(/Yesterday · Dr R/)).toBeInTheDocument();
    expect(screen.getByText(/Pin sites clean\. Continue IV antibiotics\./)).toBeInTheDocument();
  });

  it("shows today's note once the patient has been rounded", () => {
    const rounds = [
      round('2026-11-12', { roundNote: 'Old note.' }),
      round(TODAY, { roundNote: 'Wrist swelling settling.', roundNoteAt: new Date(2026, 10, 13, 9, 40).toISOString() }),
    ];
    render(<PatientCard patient={patient({ dailyRounds: rounds })} today={TODAY} />);
    expect(screen.getByText('Rounded today · 09:40')).toBeInTheDocument();
    expect(screen.getByText('Wrist swelling settling.')).toBeInTheDocument();
    expect(screen.queryByText(/Old note/)).not.toBeInTheDocument();
  });

  // Rows written by older versions hold a copy of the diagnosis in `note`.
  it('never shows the old diagnosis copy as a note', () => {
    render(<PatientCard patient={patient({ dailyRounds: [round('2026-11-12')] })} today={TODAY} />);
    expect(screen.getAllByText(DIAGNOSIS)).toHaveLength(1);   // the diagnosis line only
    expect(screen.queryByText(/Yesterday/)).not.toBeInTheDocument();
  });
});

describe('PatientCard — red means the patient, not the ward', () => {
  it('an ICU patient who is stable gets the normal bed badge', () => {
    render(<PatientCard patient={patient({ ward: 'Ortho ICU', patientStatus: PatientStatus.Fit })} today={TODAY} />);
    expect(screen.getByText('03')).not.toHaveAttribute('data-critical');
    expect(screen.getByText('03').className).not.toMatch(/critical|red/);
  });

  it('a patient marked Critical gets the red badge and a Critical label, in any ward', () => {
    render(<PatientCard patient={patient({ ward: 'Male Ward', patientStatus: PatientStatus.Critical })} today={TODAY} />);
    expect(screen.getByText('03')).toHaveAttribute('data-critical', 'true');
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });
});

describe('PatientCard — actions', () => {
  it('tapping the card opens the patient; lab and edit are separate 44px buttons', () => {
    const onOpen = vi.fn(); const onEdit = vi.fn(); const onAddLab = vi.fn();
    render(<PatientCard patient={patient({ name: 'Patient E' })} today={TODAY} onOpen={onOpen} onEdit={onEdit} onAddLab={onAddLab} />);

    fireEvent.click(screen.getByText(DIAGNOSIS));
    expect(onOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Edit Patient E'));
    fireEvent.click(screen.getByLabelText('Add lab result for Patient E'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onAddLab).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);   // the icon buttons do not also open the patient
    expect(screen.getByLabelText('Edit Patient E').className).toMatch(/w-11 h-11/);
  });

  it('shows PAC Pending before surgery and no PAC label after it', () => {
    const { rerender } = render(<PatientCard patient={patient({ dos: undefined, procedure: undefined, pacStatus: PacStatus.Pending })} today={TODAY} />);
    expect(screen.getByText('PAC Pending')).toBeInTheDocument();
    rerender(<PatientCard patient={patient()} today={TODAY} />);
    expect(screen.queryByText(/^PAC /)).not.toBeInTheDocument();
  });

  it('renders the extra row it is given (surgery-date control on the pending list)', () => {
    render(<PatientCard patient={patient()} today={TODAY} footer={<button>Assign surgery date</button>} />);
    expect(screen.getByRole('button', { name: 'Assign surgery date' })).toBeInTheDocument();
  });
});
