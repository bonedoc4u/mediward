import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';

const mockSignOut = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
const mockRefreshSession = vi.hoisted(() => vi.fn());
const mockSignInWithPassword = vi.hoisted(() => vi.fn());
// A real vi.fn() (not an inline anonymous one) so tests can reach into
// .mock.calls to grab the callback AuthContext.tsx registers with it, and
// invoke that callback directly to simulate a Supabase-emitted auth event
// (e.g. TOKEN_REFRESHED) without needing a real Supabase client.
const mockOnAuthStateChange = vi.hoisted(() =>
  vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
);
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signOut: mockSignOut,
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: mockOnAuthStateChange,
      signInWithPassword: mockSignInWithPassword,
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
  // Real runtime enum in the plugin — biometricAuthService.ts imports the
  // value (not just the type), so vi.importActual() below needs it present.
  AndroidBiometryStrength: { weak: 0, strong: 1 },
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

// Hoisted (not an inline factory value) so beforeEach can reset it —
// otherwise a resolved value set by one test (e.g. the loginWithBiometric
// test below) would leak into whichever test runs next.
const mockFindUserByEmail = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock('../../services/userService', () => ({ findUserByEmail: mockFindUserByEmail }));
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
  mockSignInWithPassword.mockReset();
  mockLoadBiometricCredential.mockReset().mockResolvedValue(null);
  mockStoreBiometricCredential.mockReset().mockResolvedValue(undefined);
  mockIsBiometricAvailable.mockReset().mockResolvedValue(false);
  mockPromptBiometric.mockReset().mockResolvedValue(false);
  // Must resolve (not a bare vi.fn(), which returns undefined) — the
  // profile-refresh effect calls .then() on this unconditionally whenever
  // `user` is non-null, i.e. in the "still valid" case below.
  mockFindUserByEmail.mockReset().mockResolvedValue(null);
  mockOnAuthStateChange.mockReset().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
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

describe('inactivity auto-logout is a deliberately SOFT logout', () => {
  // The whole cold-start half of biometric login depends on this: any scope
  // of supabase.auth.signOut() destroys the CURRENT session's refresh token
  // server-side, and the stored biometric credential's expiresAt is copied
  // from the same session's sessionExpiry — so signing out here would kill
  // the credential and the token behind it together, in exactly the case
  // the feature exists for. This path must therefore clear ONLY this app's
  // own local session state.
  afterEach(() => {
    vi.useRealTimers();
  });

  // Boots a valid 'resident' session (4 h inactivity limit) whose absolute
  // expiry is 8 h out, so the ABSOLUTE-expiry timer cannot be what fires
  // during the inactivity window.
  function bootValidResidentSession(absoluteExpiry: number) {
    localStorage.setItem('mediward_session', JSON.stringify({
      version: 1,
      timestamp: new Date().toISOString(),
      data: {
        id: 'u1', email: 'doc@hospital.com', name: 'Dr. Test',
        role: 'resident', hospitalId: 'h1',
        sessionExpiry: absoluteExpiry,
      },
    }));
    return renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });
  }

  it('with a credential stored: clears the local session but does NOT call signOut() or clearBiometricCredential()', async () => {
    vi.useFakeTimers();
    const absoluteExpiry = Date.now() + 8 * 60 * 60 * 1000;
    // A credential's expiresAt is always copied from the same session's
    // sessionExpiry — that invariant is what makes signOut() here fatal.
    mockLoadBiometricCredential.mockResolvedValue({
      refreshToken: 'tok', expiresAt: absoluteExpiry, userId: 'u1',
    });

    const { result } = bootValidResidentSession(absoluteExpiry);
    expect(result.current.user).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000 + 1_000);
    });

    // Local session state IS torn down...
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('mediward_session')).toBeNull();

    // ...but the Supabase session and the stored credential are left alive.
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockClearBiometric).not.toHaveBeenCalled();
  });

  it('with a credential stored: the preserved session is still torn down for real at the credential\'s expiresAt', async () => {
    // The bound the soft logout depends on. The "Session Expiry Timers"
    // effect is keyed on [user], so it cancels itself the instant the soft
    // logout nulls `user` — an independent, ref-held deadline has to carry
    // the absolute boundary from there. Without it the Supabase session
    // would stay live indefinitely.
    vi.useFakeTimers();
    const absoluteExpiry = Date.now() + 8 * 60 * 60 * 1000;
    mockLoadBiometricCredential.mockResolvedValue({
      refreshToken: 'tok', expiresAt: absoluteExpiry, userId: 'u1',
    });

    const { result } = bootValidResidentSession(absoluteExpiry);

    // 4 h: inactivity soft logout fires, `user` becomes null, nothing signed out.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000 + 1_000);
    });
    expect(result.current.user).toBeNull();
    expect(mockSignOut).not.toHaveBeenCalled();

    // Another 4 h, i.e. past the ORIGINAL 8 h absolute deadline, with `user`
    // null the whole way. The real teardown must still happen.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    });
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockClearBiometric).toHaveBeenCalled();
  });

  it('with NO credential stored: does the full signOut() teardown like every other path', async () => {
    // Nothing to preserve and no future benefit — skipping signOut() for a
    // user who never enrolled would just orphan a live session for nothing.
    vi.useFakeTimers();
    mockLoadBiometricCredential.mockResolvedValue(null);

    const { result } = bootValidResidentSession(Date.now() + 8 * 60 * 60 * 1000);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000 + 1_000);
    });

    expect(result.current.user).toBeNull();
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('still does a full signOut() + credential clear when the 8h ABSOLUTE limit fires', async () => {
    vi.useFakeTimers();

    const valid = {
      version: 1,
      timestamp: new Date().toISOString(),
      data: {
        id: 'u1', email: 'doc@hospital.com', name: 'Dr. Test',
        // 'admin' gets the 1-hour inactivity window, but we set the absolute
        // expiry shorter still so the absolute timer is unambiguously the
        // one that fires — that boundary is untouched by the soft-logout fix.
        role: 'admin', hospitalId: 'h1',
        sessionExpiry: Date.now() + 30 * 60 * 1000,
      },
    };
    localStorage.setItem('mediward_session', JSON.stringify(valid));

    renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 1_000);
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockClearBiometric).toHaveBeenCalled();
  });
});

describe('orphaned-credential deadline survives the app being closed', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sweeps immediately on boot when no local session exists and the credential is already past its deadline', async () => {
    // The app was closed during the "soft logged out, credential preserved"
    // window and reopened after the original absolute deadline. Nothing is
    // left to re-arm a timer from — the boot check has to do the teardown.
    mockLoadBiometricCredential.mockResolvedValue({
      refreshToken: 'tok', expiresAt: Date.now() - 1_000, userId: 'u1',
    });
    // No 'mediward_session' in localStorage: the inactivity path removed it,
    // so the existing boot-time expired-session sweep can't cover this.
    expect(localStorage.getItem('mediward_session')).toBeNull();

    renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    // Only a microtask flush — the sweep must be immediate, not scheduled.
    await act(async () => {});

    expect(mockSignOut).toHaveBeenCalled();
    expect(mockClearBiometric).toHaveBeenCalled();
  });

  it('re-arms (does not sweep) when reopened BEFORE the deadline, then sweeps when it arrives', async () => {
    vi.useFakeTimers();
    mockLoadBiometricCredential.mockResolvedValue({
      refreshToken: 'tok', expiresAt: Date.now() + 60_000, userId: 'u1',
    });

    renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(59_000); });
    expect(mockSignOut).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockClearBiometric).toHaveBeenCalled();
  });

  it('is disarmed by a fresh password login, so a stale timer cannot sign out the new session', async () => {
    // The race this guards: an armed deadline from a previous soft logout
    // firing against a legitimate, newly-authenticated session. A password
    // login mints a fresh 8h window, well past the old 60s deadline, so the
    // two are cleanly distinguishable here.
    vi.useFakeTimers();
    mockLoadBiometricCredential.mockResolvedValue({
      refreshToken: 'tok', expiresAt: Date.now() + 60_000, userId: 'u1',
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });
    await act(async () => {}); // let the boot check arm the deadline

    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'u1' }, session: { refresh_token: 'fresh-token' } },
      error: null,
    });
    mockFindUserByEmail.mockResolvedValue({
      id: 'u1', email: 'doc@hospital.com', name: 'Dr. Test', role: 'resident', hospitalId: 'h1',
    });

    await act(async () => {
      await result.current.login('doc@hospital.com', 'correct-horse');
    });
    expect(result.current.user).not.toBeNull();

    // Past the OLD deadline, nowhere near the new session's 8h window.
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(result.current.user).not.toBeNull();
  });
});

describe('loginWithBiometric session boundary', () => {
  it('anchors sessionExpiry to the stored credential, never a fresh session window', async () => {
    // Deliberately NOT close to Date.now() + 8h, so this test would fail
    // loudly (a wildly different number, not an off-by-a-few-ms flake) if
    // this ever regressed to computing a fresh expiry instead of reusing
    // the stored credential's original one.
    const originalExpiresAt = Date.now() + 60_000;
    mockLoadBiometricCredential.mockResolvedValue({ refreshToken: 'stored-refresh-token', expiresAt: originalExpiresAt, userId: 'u1' });
    mockIsBiometricAvailable.mockResolvedValue(true);
    mockPromptBiometric.mockResolvedValue(true);
    mockRefreshSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', email: 'doc@hospital.com' } } },
      error: null,
    });
    mockFindUserByEmail.mockResolvedValue({
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

// Grabs the callback AuthContext.tsx's onAuthStateChange effect registered
// for the most recently rendered provider, so tests can simulate Supabase
// emitting an auth event without a real client.
function latestAuthStateChangeHandler(): (event: string, session: unknown) => void {
  const calls = mockOnAuthStateChange.mock.calls;
  return calls[calls.length - 1][0];
}

describe('TOKEN_REFRESHED biometric credential rotation (Fix A regression coverage)', () => {
  it('updates the stored token but leaves expiresAt untouched when the refresh belongs to the SAME user who enrolled', async () => {
    const originalExpiresAt = Date.now() + 60_000;
    mockLoadBiometricCredential.mockResolvedValue({
      refreshToken: 'old-token', expiresAt: originalExpiresAt, userId: 'user-1',
    });

    renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });
    const handler = latestAuthStateChangeHandler();

    await act(async () => {
      handler('TOKEN_REFRESHED', { refresh_token: 'rotated-token', user: { id: 'user-1' } });
      // Flush the loadBiometricCredential().then() microtask chain.
      await new Promise(r => setTimeout(r, 0));
    });

    expect(mockStoreBiometricCredential).toHaveBeenCalledWith('rotated-token', originalExpiresAt, 'user-1');
  });

  it('leaves the stored credential untouched when the refresh belongs to a DIFFERENT user (mismatched userId)', async () => {
    const originalExpiresAt = Date.now() + 60_000;
    mockLoadBiometricCredential.mockResolvedValue({
      refreshToken: 'old-token', expiresAt: originalExpiresAt, userId: 'user-1',
    });

    renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });
    const handler = latestAuthStateChangeHandler();

    await act(async () => {
      // A different user's session started refreshing on this device —
      // e.g. user-1 was externally signed out without their credential
      // being cleared, and user-2 subsequently logged in.
      handler('TOKEN_REFRESHED', { refresh_token: 'someone-elses-token', user: { id: 'user-2' } });
      await new Promise(r => setTimeout(r, 0));
    });

    expect(mockStoreBiometricCredential).not.toHaveBeenCalled();
  });
});

describe('SIGNED_OUT teardown', () => {
  it('clears the stored credential and any unanswered enrollment offer', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });
    const handler = latestAuthStateChangeHandler();

    await act(async () => {
      // e.g. an admin force-logout — an external revocation that doesn't go
      // through any of AuthContext.tsx's own signOut() call sites. By the
      // time this fires the refresh token is already destroyed, so keeping
      // the credential would only leave a dead one (and a dangling offer)
      // behind for whoever logs in next on this device.
      handler('SIGNED_OUT', null);
      await new Promise(r => setTimeout(r, 0));
    });

    expect(mockClearBiometric).toHaveBeenCalled();
    expect(result.current.offerBiometricEnrollment).toBe(false);
  });
});

describe('loginWithBiometric identity re-check', () => {
  it('refuses (and clears the credential) when the refreshed session belongs to a different user', async () => {
    mockLoadBiometricCredential.mockResolvedValue({
      refreshToken: 'stored-refresh-token', expiresAt: Date.now() + 60_000, userId: 'user-1',
    });
    mockIsBiometricAvailable.mockResolvedValue(true);
    mockPromptBiometric.mockResolvedValue(true);
    mockRefreshSession.mockResolvedValue({
      // Same device, but the refresh resolved to a DIFFERENT Supabase user
      // than the one that enrolled this credential.
      data: { session: { user: { id: 'user-2', email: 'other@hospital.com' } } },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    let loginResult: { success: boolean; error?: string } | undefined;
    await act(async () => {
      loginResult = await result.current.loginWithBiometric();
    });

    expect(loginResult).toEqual({ success: false, error: 'Please log in again.' });
    expect(mockClearBiometric).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
  });
});
