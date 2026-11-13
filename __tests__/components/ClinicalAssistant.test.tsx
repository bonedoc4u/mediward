/**
 * The Clinical Assistant used to be a floating, draggable circle fixed over
 * the page; it covered ward tabs, POD numbers and status badges (audit UX-08).
 * It is now an ordinary header button that opens a panel.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Patient, PatientStatus, PacStatus, Gender } from '../../types';

vi.mock('../../contexts/AppContext', () => ({ useConfig: () => ({ department: 'Orthopaedics' }) }));
vi.mock('../../lib/supabase', () => ({
  // No session: the assistant falls back to its built-in rules, no network.
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: null } }) } },
}));

import AssistantButton from '../../components/AssistantButton';
import AiClinicalAssistant from '../../components/AiClinicalAssistant';

const patient: Patient = {
  ipNo: 'TEST-0001', name: 'Patient A', mobile: '', age: 68, gender: Gender.Female, ward: 'Female Ward', bed: '04',
  diagnosis: '# Neck of femur (R)', comorbidities: [], doa: '2026-11-08',
  pacStatus: PacStatus.Pending, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [],
  todos: [{ id: 't1', task: 'Repeat Hb', isDone: false }],
};

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });

describe('AssistantButton', () => {
  it('is a real, named button with a 44px target', () => {
    const onClick = vi.fn();
    render(<AssistantButton tone="dark" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Clinical Assistant' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.className).toMatch(/min-w-11 min-h-11/);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is laid out in the header, not fixed over the page', () => {
    render(<AssistantButton tone="light" onClick={() => {}} />);
    const button = screen.getByRole('button', { name: 'Clinical Assistant' });
    expect(button.className).not.toMatch(/\bfixed\b/);
    expect(button.style.position).toBe('');
  });
});

describe('AiClinicalAssistant panel', () => {
  it('draws nothing at all while closed — no floating button', () => {
    const { container } = render(<AiClinicalAssistant patients={[patient]} open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByLabelText('Clinical Assistant')).not.toBeInTheDocument();
  });

  it('shows the panel and runs the analysis when opened', async () => {
    render(<AiClinicalAssistant patients={[patient]} open onClose={() => {}} />);
    expect(screen.getByText('Clinical Assistant')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/ACTION ITEMS? FOUND/i)).toBeInTheDocument());
  });

  it('closes through the callback it is given', async () => {
    const onClose = vi.fn();
    const { container } = render(<AiClinicalAssistant patients={[patient]} open onClose={onClose} />);
    await waitFor(() => expect(screen.getByText(/ACTION ITEMS? FOUND/i)).toBeInTheDocument());
    fireEvent.click(container.querySelector('.absolute.inset-0')!);   // the dimmed backdrop
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
