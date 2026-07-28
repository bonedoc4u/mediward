/**
 * Regression tests for the "Add Patient prefilled with the previous patient"
 * bug: a 500ms debounce draft-save could fire AFTER the modal's close-wipe
 * removed the sessionStorage draft, resurrecting the just-saved patient as a
 * draft for the next admission. Also covers the edit-mode step-navigation
 * leak (setStep wrote drafts while editing an existing patient).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent, screen } from '@testing-library/react';

vi.mock('../contexts/AppContext', () => ({
  useConfig: () => ({
    wards: [{ name: 'Ortho A', active: true, sortOrder: 1, unit: [], isIcu: false }],
    unitOptions: ['OR1', 'OR2'],
  }),
  useAuth: () => ({
    user: { id: 'u1', name: 'Test Doc', role: 'resident', unit: 'OR2', hospitalId: 'h1' },
  }),
  usePatients: () => ({
    renamePatientIpNo: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock('../hooks/useComorbidityPresets', () => ({
  useComorbidityPresets: () => ({ comorbidityMap: {}, saveComorbidityMap: vi.fn() }),
}));
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import AddPatientModal from '../components/AddPatientModal';

const STEP_KEY = 'mediward_admit_step';

beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers();
  // jsdom doesn't implement scrollIntoView (used by the step-change effect)
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
});

const noop = () => {};

describe('AddPatientModal draft persistence', () => {
  it('a pending debounce save must NOT resurrect the draft after close', () => {
    const { rerender, container } = render(
      <AddPatientModal isOpen={true} onClose={noop} onSave={noop} initialData={null} />,
    );

    // Let the initial mount debounce settle.
    act(() => { vi.advanceTimersByTime(600); });

    // User types (state change → schedules a fresh 500ms debounce write)…
    const ipInput = container.querySelectorAll('input[type="text"]')[1] as HTMLInputElement;
    act(() => { fireEvent.change(ipInput, { target: { value: 'IP123' } }); });

    // …and the modal closes (save/cancel) within 500ms of the keystroke.
    rerender(
      <AddPatientModal isOpen={false} onClose={noop} onSave={noop} initialData={null} />,
    );

    // The close-wipe must win: any timer still pending would fire now.
    act(() => { vi.advanceTimersByTime(1000); });

    expect(sessionStorage.getItem(STEP_KEY)).toBeNull();
  });

  it('editing an existing patient never writes a draft', () => {
    const patient = {
      ipNo: 'IP999', name: 'Previous Patient', mobile: '9876543210', age: 60,
      gender: 'Male', ward: 'Ortho A', bed: '7', diagnosis: 'Old diagnosis',
      comorbidities: [], doa: '2026-07-01', pacStatus: 'PAC Fit',
      patientStatus: 'Fit', dailyRounds: [], investigations: [],
      labResults: [], todos: [],
    } as never;

    render(
      <AddPatientModal isOpen={true} onClose={noop} onSave={noop} initialData={patient} />,
    );
    act(() => { vi.advanceTimersByTime(2000); });

    // Navigating steps used to write the edited patient into the draft key.
    act(() => { fireEvent.click(screen.getByText(/Next/)); });
    act(() => { vi.advanceTimersByTime(2000); });

    expect(sessionStorage.getItem(STEP_KEY)).toBeNull();
  });
});
