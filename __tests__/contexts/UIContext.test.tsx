import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UIProvider, useUI } from '../../contexts/UIContext';
import { ViewMode } from '../../types';

const loadAllPatients = vi.fn().mockResolvedValue(undefined);

// Stable references — a fresh object/array literal returned from these mocks
// on every call would give UIContext's `patients`/`user`-dependent effects a
// new identity every render, causing an infinite effect loop (this crashed
// the Vitest worker outright before being fixed).
const stableUser = { id: 'u1', unit: undefined };
const stablePatients: never[] = [];

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: stableUser }),
}));

vi.mock('../../contexts/PatientContext', () => ({
  usePatients: () => ({ patients: stablePatients, loadAllPatients }),
}));

function NavProbe({ view }: { view: ViewMode }) {
  const { navigateTo } = useUI();
  return <button onClick={() => navigateTo(view)}>go</button>;
}

function renderNav(view: ViewMode) {
  render(
    <UIProvider>
      <NavProbe view={view} />
    </UIProvider>,
  );
  fireEvent.click(screen.getByText('go'));
}

describe('UIContext navigateTo — full patient list loading', () => {
  beforeEach(() => {
    loadAllPatients.mockClear();
  });

  it('loads all patients (including discharged) when entering Admission List', () => {
    renderNav('admissions');
    expect(loadAllPatients).toHaveBeenCalled();
  });

  it('loads all patients when entering Master List', () => {
    renderNav('master');
    expect(loadAllPatients).toHaveBeenCalled();
  });

  it('loads all patients when entering Discharge', () => {
    renderNav('discharge');
    expect(loadAllPatients).toHaveBeenCalled();
  });

  it('does not load all patients when entering the dashboard', () => {
    renderNav('dashboard');
    expect(loadAllPatients).not.toHaveBeenCalled();
  });
});
