import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';

const mockSignOut = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: mockSignOut,
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
    },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
}));

const mockClearBiometric = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../services/biometricAuthService', () => ({
  clearBiometricCredential: mockClearBiometric,
}));

// Must resolve (not a bare vi.fn(), which returns undefined) — the
// profile-refresh effect calls .then() on this unconditionally whenever
// `user` is non-null, i.e. in the "still valid" case below.
vi.mock('../../services/userService', () => ({ findUserByEmail: vi.fn().mockResolvedValue(null) }));
vi.mock('../../services/auditLog', () => ({ logAuditEvent: vi.fn() }));
vi.mock('../../services/patientCache', () => ({ clearPatientCache: vi.fn() }));
vi.mock('../../components/ClinicalDisclaimer', () => ({ clearDisclaimerAccepted: vi.fn() }));

const Probe: React.FC = () => {
  useAuth();
  return null;
};

beforeEach(() => {
  mockSignOut.mockClear();
  mockClearBiometric.mockClear();
  localStorage.clear();
});

describe('AuthProvider boot with an expired stored session', () => {
  it('signs out of Supabase and clears the biometric credential, not just the local session', async () => {
    const expired = {
      version: 1,
      timestamp: new Date().toISOString(),
      data: {
        id: 'u1', email: 'doc@hospital.com', name: 'Dr. Test',
        role: 'resident', hospitalId: 'h1',
        sessionExpiry: Date.now() - 1000, // already expired
      },
    };
    localStorage.setItem('mediward_session', JSON.stringify(expired));

    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockClearBiometric).toHaveBeenCalled();
    });
  });

  it('does NOT sign out when the stored session is still valid', async () => {
    const valid = {
      version: 1,
      timestamp: new Date().toISOString(),
      data: {
        id: 'u1', email: 'doc@hospital.com', name: 'Dr. Test',
        role: 'resident', hospitalId: 'h1',
        sessionExpiry: Date.now() + 60_000, // still valid for another minute
      },
    };
    localStorage.setItem('mediward_session', JSON.stringify(valid));

    render(<AuthProvider><Probe /></AuthProvider>);

    // Give any stray async work a tick, then confirm signOut was never called.
    await new Promise(r => setTimeout(r, 10));
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
