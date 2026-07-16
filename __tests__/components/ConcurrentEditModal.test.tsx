import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ConcurrentEditModal from '../../components/ConcurrentEditModal';
import { ConcurrentEditConflict } from '../../contexts/PatientContext';
import { Patient, PatientStatus, PacStatus, Gender, Ward } from '../../types';

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  bed: '5',
  ward: 'Ortho A' as Ward,
  ipNo: 'IP001',
  name: 'Ravi Kumar',
  mobile: '9876543210',
  age: 52,
  gender: Gender.Male,
  diagnosis: 'Intertrochanteric fracture',
  comorbidities: [],
  doa: '2024-01-15',
  pacStatus: PacStatus.Fit,
  patientStatus: PatientStatus.Fit,
  dailyRounds: [],
  investigations: [],
  labResults: [],
  todos: [],
  ...overrides,
});

const makeConflict = (overrides: Partial<ConcurrentEditConflict> = {}): ConcurrentEditConflict => ({
  localPatient: makePatient({ dos: '2026-07-15' }),
  remotePatient: makePatient({ dos: undefined }),
  ...overrides,
});

afterEach(() => {
  document.body.style.overflow = '';
});

// Regression: the dialog used to render in-tree (wherever a save happened to fail),
// so a fixed-position ancestor from whatever screen was open at that moment could
// end up stacked on top of it, or the page underneath could still capture a touch
// meant for a button. It now portals to <body> at the app's highest z-index and
// locks background scroll while open.

describe('ConcurrentEditModal', () => {
  it('renders as a direct child of document.body (portal), not nested in the caller tree', () => {
    const { baseElement } = render(
      <div id="app-root">
        <ConcurrentEditModal conflict={makeConflict()} onResolve={vi.fn()} />
      </div>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.closest('#app-root')).toBeNull();
    expect(dialog.parentElement?.parentElement).toBe(baseElement);
  });

  it('locks body scroll while open and restores it on unmount', () => {
    document.body.style.overflow = 'auto';
    const { unmount } = render(
      <ConcurrentEditModal conflict={makeConflict()} onResolve={vi.fn()} />,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('calls onResolve("remote") when "Use server version" is clicked', () => {
    const onResolve = vi.fn();
    render(<ConcurrentEditModal conflict={makeConflict()} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole('button', { name: /use server version/i }));
    expect(onResolve).toHaveBeenCalledWith('remote');
  });

  it('calls onResolve("local") when "Force-save my version" is clicked', () => {
    const onResolve = vi.fn();
    render(<ConcurrentEditModal conflict={makeConflict()} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole('button', { name: /force-save my version/i }));
    expect(onResolve).toHaveBeenCalledWith('local');
  });

  it('calls onResolve("remote") when the backdrop is tapped', () => {
    const onResolve = vi.fn();
    const { baseElement } = render(
      <ConcurrentEditModal conflict={makeConflict()} onResolve={onResolve} />,
    );
    const backdrop = baseElement.querySelector('.bg-black\\/60');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onResolve).toHaveBeenCalledWith('remote');
  });
});
