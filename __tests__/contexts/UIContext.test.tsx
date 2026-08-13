import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

const originalHash = window.location.hash;

describe('UIContext — full patient list loading', () => {
  beforeEach(() => {
    loadAllPatients.mockClear();
  });

  afterEach(() => {
    // currentView's initializer reads window.location.hash directly, so a
    // hash left over from one test would leak into the next test's mount.
    window.location.hash = originalHash;
  });

  describe('on direct landing (mount, no navigation)', () => {
    // currentView's useState initializer reads window.location.hash before
    // navigateTo is ever called — the common case of opening the app
    // straight to a view, or reloading while already on it. Setting the
    // hash before render simulates landing directly on that view.
    function renderLanding(view: ViewMode) {
      window.location.hash = `#/${view}`;
      render(<UIProvider><div /></UIProvider>);
    }

    it('loads all patients when landing directly on the dashboard', () => {
      renderLanding('dashboard');
      expect(loadAllPatients).toHaveBeenCalled();
    });

    it('loads all patients when landing directly on Pending List', () => {
      renderLanding('pending');
      expect(loadAllPatients).toHaveBeenCalled();
    });

    it('loads all patients when landing directly on Went Home', () => {
      renderLanding('wenthome');
      expect(loadAllPatients).toHaveBeenCalled();
    });

    it('does NOT load all patients when landing on a non-list view', () => {
      renderLanding('rounds');
      expect(loadAllPatients).not.toHaveBeenCalled();
    });
  });

  describe('via navigateTo', () => {
    // Start from a view outside needsFullPatientList so the mount-time
    // effect above doesn't also fire and confound the navigateTo-specific
    // assertion below.
    function renderNav(view: ViewMode) {
      window.location.hash = '#/rounds';
      render(
        <UIProvider>
          <NavProbe view={view} />
        </UIProvider>,
      );
      loadAllPatients.mockClear(); // discard any mount-time call before the click under test
      fireEvent.click(screen.getByText('go'));
    }

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

    it('loads all patients when navigating to the dashboard', () => {
      // Regression: a paginated first page silently hid active patients from
      // their own ward's tab once a hospital passed the page size — a fully
      // active inpatient (not discharged, not gone home) could sit just past
      // the "50 most recently created" cutoff and vanish from the dashboard
      // while still showing correctly in Master List.
      renderNav('dashboard');
      expect(loadAllPatients).toHaveBeenCalled();
    });

    it('loads all patients when navigating to Pending List', () => {
      renderNav('pending');
      expect(loadAllPatients).toHaveBeenCalled();
    });

    it('loads all patients when navigating to Went Home', () => {
      renderNav('wenthome');
      expect(loadAllPatients).toHaveBeenCalled();
    });

    it('does NOT load all patients when navigating to a non-list view', () => {
      renderNav('labs');
      expect(loadAllPatients).not.toHaveBeenCalled();
    });
  });
});
