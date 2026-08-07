import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';
import { findUserByEmail } from '../../services/userService';

const mockSignOut = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
const mockRefreshSession = vi.hoisted(() => vi.fn());
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: mockSignOut,
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
      refreshSession: mockRefreshSession,
    },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
}));

// The native plugin biometricAuthService.ts imports at module scope — stub
// it out so vi.importActual() below (needed to test against the REAL
// isBiometricCredentialValid) doesn't try to touch actual native code.
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: { checkBiometry: vi.fn(), authenticate: vi.fn() },
}));

const mockClearBiometric           = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockLoadBiometricCredential  = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockStoreBiometricCredential = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockIsBiometricAvailable     = vi.hoisted(() => vi.fn().mockResolvedValue(false));
const mockPromptBiometric          = vi.hoisted(() => vi.fn().mockResolvedValue(false));

// isBiometricCredentialValid is kept as the REAL implementation (pure,
// already covered in Task 1's biometricAuthService.test.ts) — testing
// loginWithBiometric's boundary logic against the real predicate is more
// meaningful than re-mocking it. Everything else here touches storage/native
// APIs, so those stay mocked.
vi.mock('../../services/biometricAuthService', async () => {
  const actual = await vi.importActual<typeof import('../../services/biometricAuthService')>(
    '../../services/biometricAuthService',
  );
  return {
    ...actual,
    clearBiometricCredential: mockClearBiometric,
    loadBiometricCredential: mockLoadBiometricCredential,
    storeBiometricCredential: mockStoreBiometricCredential,
    isBiometricAvailable: mockIsBiometricAvailable,
    promptBiometric: mockPromptBiometric,
  };
});

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
  mockRefreshSession.mockReset();
  mockLoadBiometricCredential.mockReset().mockResolvedValue(null);
  mockStoreBiometricCredential.mockReset().mockResolvedValue(undefined);
  mockIsBiometricAvailable.mockReset().mockResolvedValue(false);
  mockPromptBiometric.mockReset().mockResolvedValue(false);
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

  describe('and an in-progress password-recovery link', () => {
    const originalHash = window.location.hash;

    afterEach(() => {
      // isRecoveryMode is read from window.location.hash at boot — reset it
      // so this doesn't leak into other tests in this file.
      window.location.hash = originalHash;
    });

    it('does NOT sign out of Supabase or clear the biometric credential, even though the stored session is expired', async () => {
      // Matches AuthContext.tsx's own check: combined hash+search includes 'type=recovery'.
      window.location.hash = '#access_token=xxx&type=recovery';

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

      // Give any stray async work a tick — there's nothing to waitFor here,
      // since the whole point is that signOut/clearBiometric must NOT fire.
      // Calling supabase.auth.signOut() during an active recovery flow would
      // revoke the just-established recovery session and break password reset.
      await new Promise(r => setTimeout(r, 10));
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(mockClearBiometric).not.toHaveBeenCalled();
    });
  });
});

describe('loginWithBiometric session boundary', () => {
  it('anchors sessionExpiry to the stored credential, never a fresh session window', async () => {
    // Deliberately NOT close to Date.now() + 8h, so this test would fail
    // loudly (a wildly different number, not an off-by-a-few-ms flake) if
    // this ever regressed to computing a fresh expiry instead of reusing
    // the stored credential's original one.
    const originalExpiresAt = Date.now() + 60_000;
    mockLoadBiometricCredential.mockResolvedValue({ refreshToken: 'stored-refresh-token', expiresAt: originalExpiresAt });
    mockIsBiometricAvailable.mockResolvedValue(true);
    mockPromptBiometric.mockResolvedValue(true);
    mockRefreshSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', email: 'doc@hospital.com' } } },
      error: null,
    });
    vi.mocked(findUserByEmail).mockResolvedValue({
      id: 'u1', email: 'doc@hospital.com', name: 'Dr. Test', role: 'resident', hospitalId: 'h1',
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    let loginResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      loginResult = await result.current.loginWithBiometric();
    });

    expect(loginResult?.success).toBe(true);
    expect(result.current.user?.sessionExpiry).toBe(originalExpiresAt);
  });
});
