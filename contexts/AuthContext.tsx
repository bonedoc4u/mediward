/**
 * AuthContext.tsx
 * Handles authentication, session management, and user seeding.
 * Isolated from patient/UI state so auth changes don't trigger
 * patient-list or navigation re-renders.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthUser } from '../types';
import { loadFromStorage, saveToStorage, removeFromStorage } from '../services/persistence';
import { logAuditEvent } from '../services/auditLog';
import { findUserByEmail } from '../services/userService';
import { supabase } from '../lib/supabase';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { toast } from '../utils/toast';
import { clearDisclaimerAccepted } from '../components/ClinicalDisclaimer';
import { clearPatientCache } from '../services/patientCache';
import { isSessionValid } from '../utils/sessionValidity';
import {
  clearBiometricCredential,
  isBiometricAvailable,
  promptBiometric,
  storeBiometricCredential,
  loadBiometricCredential,
  isBiometricCredentialValid,
} from '../services/biometricAuthService';

const SESSION_DURATION   = 8 * 60 * 60 * 1000;  // 8 hours absolute limit
const WARN_BEFORE_EXPIRY = 5 * 60 * 1000;        // warn 5 min before absolute expiry
// Require re-auth if the screen/tab was hidden for longer than this.
// 10 minutes: long enough for normal app-switching (calls, messages, checking another app)
// but short enough to protect PHI if the device is left unattended on a ward.
const LOCK_REAUTH_AFTER_MS = 10 * 60 * 1000; // 10 minutes

// Clinical roles need long inactivity windows — a ward round on a 30-bed unit
// takes 90–120 min, and an OT case can run 3–4 hours. The old 30-min timeout
// caused silent logouts mid-round. Admin roles keep a tighter window because
// they typically work at a desk rather than carrying a tablet on rounds.
function getInactivityLimits(role: AuthUser['role'] | undefined): { limit: number; warn: number } {
  switch (role) {
    case 'attending':
    case 'resident':
      return { limit: 4 * 60 * 60 * 1000, warn: (4 * 60 - 5) * 60 * 1000 };  // 4 h / warn at 3h55m
    case 'house_surgeon':
      return { limit: 2 * 60 * 60 * 1000, warn: (2 * 60 - 5) * 60 * 1000 };  // 2 h / warn at 1h55m
    default:
      return { limit: 60 * 60 * 1000,     warn: 55 * 60 * 1000 };              // 1 h / warn at 55m
  }
}

// ─── Context Shape ───
interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  /** Verify the current user's password without extending the session (used by lock screen). */
  verifyPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
  /** True when the user arrived via a password-reset email link. App should show ResetPasswordPage. */
  isRecoveryMode: boolean;
  /** True when the screen was locked/hidden and the user must re-authenticate. */
  isLocked: boolean;
  /** Dismiss the lock screen (called after successful re-auth). */
  unlock: () => void;
  /** Fingerprint unlock for an already-valid, backgrounded session — no server call. Returns whether it succeeded. */
  unlockWithBiometric: () => Promise<boolean>;
  /** Fingerprint sign-in after a real logout/expiry, using a stored, boundary-limited credential. */
  loginWithBiometric: () => Promise<{ success: boolean; error?: string }>;
  /** True right after a successful password login on a device that supports biometrics and has none enrolled yet. */
  offerBiometricEnrollment: boolean;
  /** Store the pending login's credential for future fingerprint sign-in. */
  enrollBiometric: () => Promise<void>;
  /** Decline the one-time enrollment offer without storing anything. */
  dismissBiometricOffer: () => void;
  /** Superadmin: ID of the hospital workspace currently being viewed (null = own hospital). */
  viewingHospitalId: string | null;
  /** Superadmin: display name of the hospital being viewed. */
  viewingHospitalName: string | null;
  /** Set the hospital workspace the superadmin is viewing. Pass null to exit. */
  setViewingHospital: (id: string | null, name?: string) => void;
  /** Department chosen by superadmin after login. Null = picker not yet shown. */
  selectedDepartment: string | null;
  /** Unit chosen by admin after login. 'all' = no filter. Null = picker not yet shown. */
  selectedUnit: string | null;
  setSelectedDepartment: (dept: string) => void;
  setSelectedUnit: (unit: string) => void;
  /** Reset workspace selection so the picker shows again on next render. */
  clearWorkspaceSelection: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ─── Provider ───
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [viewingHospitalId, setViewingHospitalId] = useState<string | null>(null);
  const [viewingHospitalName, setViewingHospitalName] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const hiddenAtRef = React.useRef<number | null>(null);

  const [offerBiometricEnrollment, setOfferBiometricEnrollment] = useState(false);
  // Holds the just-issued refresh token + this login's sessionExpiry between
  // the moment login() succeeds and the moment the user responds to the
  // "enable fingerprint?" prompt (enrollBiometric() consumes this). Not
  // React state — nothing needs to re-render when this changes.
  const pendingBiometricEnrollmentRef = React.useRef<{ refreshToken: string; expiresAt: number } | null>(null);

  // Workspace selection: persisted across page reloads but cleared on logout.
  const [selectedDepartment, setSelectedDepartmentState] = useState<string | null>(
    () => localStorage.getItem('mw_dept'),
  );
  const [selectedUnit, setSelectedUnitState] = useState<string | null>(
    () => localStorage.getItem('mw_unit'),
  );

  const setSelectedDepartment = useCallback((dept: string) => {
    setSelectedDepartmentState(dept);
    localStorage.setItem('mw_dept', dept);
  }, []);

  const setSelectedUnit = useCallback((unit: string) => {
    setSelectedUnitState(unit);
    localStorage.setItem('mw_unit', unit);
  }, []);

  const clearWorkspaceSelection = useCallback(() => {
    setSelectedDepartmentState(null);
    setSelectedUnitState(null);
    localStorage.removeItem('mw_dept');
    localStorage.removeItem('mw_unit');
  }, []);

  // Detect password-reset links at initialisation time.
  // Supabase fires PASSWORD_RECOVERY on onAuthStateChange, but that listener
  // is registered asynchronously after React mounts — the event can fire
  // before the listener is ready and gets silently dropped.
  // Parsing the URL hash synchronously here catches it reliably.
  const [isRecoveryMode, setIsRecoveryMode] = useState<boolean>(() => {
    const hash = window.location.hash;         // e.g. #access_token=xxx&type=recovery
    const search = window.location.search;     // PKCE flow: ?code=xxx (Supabase sets type param too)
    const combined = hash + search;
    return combined.includes('type=recovery');
  });

  const setViewingHospital = useCallback((id: string | null, name?: string) => {
    setViewingHospitalId(id);
    setViewingHospitalName(id ? (name ?? null) : null);
  }, []);

  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = loadFromStorage<AuthUser>('session');
    if (isSessionValid(saved, Date.now())) return saved;
    if (saved) {
      // A session was found but had already expired by the time the app
      // reopened — clean up fully, not just the local copy, so a
      // lingering Supabase session (persistSession/autoRefreshToken are
      // both on by default, see lib/supabase.ts) can't silently keep
      // itself alive past this app's own 8-hour cutoff. Fire-and-forget,
      // matching every other teardown path in this file (the timer-based
      // expiry, inactivity logout, and explicit logout all do the same).
      //
      // Skipped specifically when the boot URL is a password-recovery
      // link: Supabase's client saves the recovery session before firing
      // PASSWORD_RECOVERY, and signOut() here would run after that save,
      // revoking the just-established recovery session and breaking the
      // reset flow for exactly the "had a stale expired session sitting
      // around" case this cleanup targets. isRecoveryMode is computed
      // synchronously above (its own useState initializer runs first),
      // so it's safe to read directly here.
      if (!isRecoveryMode) {
        supabase.auth.signOut().catch(() => {});
        clearBiometricCredential().catch(() => {});
      }
    }
    removeFromStorage('session');
    return null;
  });

  // ─── Profile refresh on every app open ───────────────────────────────────
  // localStorage session can be stale: unit/role/name may have changed while
  // the user was offline or logged out. Re-fetch from app_users on every mount
  // so a newly-assigned unit is always current without requiring a re-login.
  // Runs silently in the background — the cached session is shown immediately
  // while this resolves, then patched if anything differs.
  useEffect(() => {
    if (!user?.email) return;
    findUserByEmail(user.email).then(fresh => {
      if (!fresh) return;
      const changed =
        fresh.unit       !== user.unit       ||
        fresh.role       !== user.role       ||
        fresh.name       !== user.name       ||
        fresh.ward       !== user.ward       ||
        fresh.hospitalId !== user.hospitalId; // patch stale sessions that predate hospitalId field
      if (!changed) return;
      const updated: AuthUser = {
        ...user,
        unit:       fresh.unit,
        role:       fresh.role,
        name:       fresh.name,
        ward:       fresh.ward,
        hospitalId: fresh.hospitalId,
      };
      setUser(updated);
      saveToStorage('session', updated);
    }).catch(() => {}); // silently ignore offline / RLS errors
   
  }, []); // intentionally run only on mount (app open)

  // ─── JWT role verification — prevents localStorage role tampering ───
  // The role in localStorage can be modified by a browser extension or XSS.
  // On mount, re-derive the role from app_metadata that the DB trigger embeds
  // into the JWT (sync_role_to_jwt trigger). If they differ, the JWT wins.
  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      const jwtRole = session.user.app_metadata?.role as AuthUser['role'] | undefined;
      if (jwtRole && jwtRole !== user.role) {
        console.warn('[Auth] Role mismatch: localStorage=%s, JWT=%s — using JWT', user.role, jwtRole);
        const corrected = { ...user, role: jwtRole };
        setUser(corrected);
        saveToStorage('session', corrected);
      }
    });
  // Only run on login (user.id change), not on every render
   
  }, [user?.id]);

  // ─── Session Expiry Timers ───
  useEffect(() => {
    if (!user) return;

    const msUntilExpiry = user.sessionExpiry - Date.now();
    if (msUntilExpiry <= 0) {
      // Same narrow race the initializer above now also covers (session
      // was valid at initializer-time by a few ms, expired by the time
      // this effect actually runs) — same fix, for the same reason,
      // including the isRecoveryMode guard (see the initializer's comment).
      if (!isRecoveryMode) {
        supabase.auth.signOut().catch(() => {});
        clearBiometricCredential().catch(() => {});
      }
      setUser(null);
      removeFromStorage('session');
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const warnIn = msUntilExpiry - WARN_BEFORE_EXPIRY;
    if (warnIn > 0) {
      timers.push(setTimeout(() => {
        toast.warning('⚠️ Session expires in 5 minutes. Save your work.');
      }, warnIn));
    }
    timers.push(setTimeout(() => {
      toast.warning('Session expired. Please log in again.');
      supabase.auth.signOut().catch(() => {});
      clearBiometricCredential().catch(() => {});
      pendingBiometricEnrollmentRef.current = null;
      setOfferBiometricEnrollment(false);
      setUser(null);
      removeFromStorage('session');
      window.location.hash = '#/dashboard';
    }, msUntilExpiry));

    return () => timers.forEach(clearTimeout);
  }, [user]);

  // ─── Inactivity Timeout (role-based → auto-logout) ───
  useEffect(() => {
    if (!user) return;

    const { limit, warn } = getInactivityLimits(user.role);
    let warnTimer: ReturnType<typeof setTimeout>;
    let logoutTimer: ReturnType<typeof setTimeout>;

    const limitMinutes = Math.round(limit / 60_000);
    const warnMinutes  = Math.round(warn  / 60_000);

    const reset = () => {
      clearTimeout(warnTimer);
      clearTimeout(logoutTimer);
      warnTimer = setTimeout(() => {
        toast.warning(`⚠️ No activity for ${warnMinutes} minutes. You will be logged out in 5 minutes.`);
      }, warn);
      logoutTimer = setTimeout(() => {
        toast.warning(`Logged out after ${limitMinutes} minutes of inactivity.`);
        supabase.auth.signOut().catch(() => {});
        clearBiometricCredential().catch(() => {});
        pendingBiometricEnrollmentRef.current = null;
        setOfferBiometricEnrollment(false);
        setUser(null);
        removeFromStorage('session');
        clearDisclaimerAccepted();
        window.location.hash = '#/dashboard';
      }, limit);
    };

    const EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'] as const;
    EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset(); // start timer immediately

    return () => {
      clearTimeout(warnTimer);
      clearTimeout(logoutTimer);
      EVENTS.forEach(e => window.removeEventListener(e, reset));
    };
  }, [user]);

  // ─── Screen-lock detection: re-auth required after hidden > 10 min ─────
  // Protects PHI on shared ward tablets/phones left unattended.
  // Only locks after LOCK_REAUTH_AFTER_MS of continuous background time,
  // so normal app-switching (calls, messages, notifications) doesn't interrupt work.
  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        // Refresh Supabase JWT on app-focus so RLS stays valid during long sessions.
        // JWT expires in 1h but our app session is 8h — without this, DB writes
        // silently fail with auth errors after the first hour of inactivity.
        supabase.auth.getSession().catch(() => {});

        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (hiddenAt !== null && Date.now() - hiddenAt > LOCK_REAUTH_AFTER_MS) {
          setIsLocked(true);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

  const unlock = useCallback(() => setIsLocked(false), []);

  // Lock-screen unlock via fingerprint — the session is already valid while
  // locked, so unlike loginWithBiometric this never touches Supabase at
  // all, exactly mirroring how the existing password-based verifyPassword
  // path is really just a local "prove you're still you" gate.
  const unlockWithBiometric = useCallback(async (): Promise<boolean> => {
    if (!(await isBiometricAvailable())) return false;
    const ok = await promptBiometric('Unlock MediWard');
    if (ok) unlock();
    return ok;
  }, [unlock]);

  const enrollBiometric = useCallback(async () => {
    const pending = pendingBiometricEnrollmentRef.current;
    if (pending) {
      await storeBiometricCredential(pending.refreshToken, pending.expiresAt);
      pendingBiometricEnrollmentRef.current = null;
    }
    setOfferBiometricEnrollment(false);
  }, []);

  const dismissBiometricOffer = useCallback(() => {
    pendingBiometricEnrollmentRef.current = null;
    setOfferBiometricEnrollment(false);
  }, []);

  // ─── Live session sync — watch the logged-in user's app_users row ───
  // When an admin changes unit/role in TeamManagement, Supabase fires a realtime
  // UPDATE on app_users. We pick it up here and update the session immediately
  // so the user sees the correct ward filter without having to log out.
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`session_user_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_users', filter: `id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { unit?: string | null; role?: string; name?: string };
          setUser(prev => {
            if (!prev) return prev;
            const updated: AuthUser = {
              ...prev,
              unit:  row.unit  ?? undefined,
              role:  (row.role as AuthUser['role']) ?? prev.role,
              name:  row.name ?? prev.name,
            };
            saveToStorage('session', updated);
            return updated;
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  // ─── Supabase auth state listener (catches server-side token expiry / revocation) ───
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User clicked the password reset link in their email.
        // Surface the reset form instead of the login page.
        setIsRecoveryMode(true);
      } else if (event === 'TOKEN_REFRESHED' && session?.refresh_token) {
        // Supabase rotates the refresh token on every use, including its
        // own background autoRefreshToken cycle (roughly hourly, since the
        // JWT itself only lives 1h) — the token captured at enrollment time
        // goes stale long before the stored credential's expiresAt (which
        // can be up to 8h out). Keep the STORED token current as it
        // rotates so a later biometric login always presents a live one.
        // expiresAt is deliberately left untouched — the safety-critical
        // session-boundary anchor must never move, only the token value.
        loadBiometricCredential().then(existing => {
          if (existing) {
            storeBiometricCredential(session.refresh_token, existing.expiresAt).catch(() => {});
          }
        });
      } else if (event === 'SIGNED_OUT') {
        setIsRecoveryMode(false);
        // If Supabase revokes the session externally (e.g. admin force-logout, token expiry),
        // clear our local session too so the user is redirected to login.
        setUser(prev => {
          if (prev) {
            removeFromStorage('session');
            toast.warning('Your session has expired. Please log in again.');
            window.location.hash = '#/dashboard';
          }
          return null;
        });
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ─── Login ───
  const login = useCallback(async (
    email: string,
    password: string,
  ): Promise<{ success: boolean; error?: string }> => {

    // Step 1: Try Supabase Auth (must complete first — sets the JWT so RLS-gated
    // tables like app_users become readable in the next call)
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (!authError && authData.user) {
      const found = await findUserByEmail(email);
      if (!found) return { success: false, error: 'User role not configured. Contact admin.' };

      const session: AuthUser = {
        id:            authData.user.id,
        email:         found.email,
        name:          found.name,
        role:          found.role,
        ward:          found.ward,
        unit:          found.unit,
        hospitalId:    found.hospitalId,
        sessionExpiry: Date.now() + SESSION_DURATION,
      };
      setUser(session);
      saveToStorage('session', session);
      logAuditEvent(session.id, session.name, 'LOGIN', 'session', session.id, `Login: ${email}`);

      // Offer fingerprint sign-in once per fresh password login, if this
      // device supports it and nothing is enrolled for it yet. The refresh
      // token comes straight from this same signInWithPassword response —
      // no extra Supabase call needed. expiresAt is deliberately the exact
      // same session.sessionExpiry just computed above, not a separately
      // derived value, so the stored credential's window can never drift
      // from the real session's window.
      if (authData.session?.refresh_token) {
        const existingCredential = await loadBiometricCredential();
        if (!isBiometricCredentialValid(existingCredential, Date.now()) && await isBiometricAvailable()) {
          pendingBiometricEnrollmentRef.current = {
            refreshToken: authData.session.refresh_token,
            expiresAt: session.sessionExpiry,
          };
          setOfferBiometricEnrollment(true);
        }
      }

      return { success: true };
    }

    // Supabase Auth failed — no legacy fallback.
    return { success: false, error: authError?.message ?? 'Invalid email or password.' };
  }, []);

  // Cold-start sign-in via fingerprint — no session currently exists (a
  // real logout/expiry already happened). Gated by a stored refresh token
  // whose expiresAt was captured from a real password login's own
  // sessionExpiry (see login()'s enrollment step above) and is NEVER
  // extended here — a successful fingerprint check re-establishes a
  // Supabase session but the resulting AuthUser keeps the credential's
  // original expiresAt, not Date.now() + SESSION_DURATION.
  const loginWithBiometric = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const credential = await loadBiometricCredential();
    if (!isBiometricCredentialValid(credential, Date.now())) {
      await clearBiometricCredential();
      return { success: false, error: 'expired' };
    }

    if (!(await isBiometricAvailable())) return { success: false, error: 'unavailable' };
    const ok = await promptBiometric('Sign in to MediWard');
    if (!ok) return { success: false, error: 'cancelled' };

    try {
      // credential is narrowed to non-null here — isBiometricCredentialValid
      // is a type predicate (see services/biometricAuthService.ts), so no `!`
      // assertion is needed.
      const { data, error } = await supabase.auth.refreshSession({ refresh_token: credential.refreshToken });
      if (error || !data.session) {
        const isNetworkBlip = isAuthRetryableFetchError(error);
        if (!isNetworkBlip) {
          // A real rejection (revoked, or genuinely past Supabase's own
          // refresh-token lifetime), not a connectivity blip — this
          // credential is dead, clear it so the fingerprint button stops
          // being offered.
          await clearBiometricCredential();
        }
        return { success: false, error: isNetworkBlip ? 'network' : 'Please log in again.' };
      }

      const email = data.session.user.email;
      if (!email) {
        await clearBiometricCredential();
        return { success: false, error: 'Please log in again.' };
      }

      const found = await findUserByEmail(email);
      if (!found) return { success: false, error: 'User role not configured. Contact admin.' };

      const session: AuthUser = {
        id:            data.session.user.id,
        email:         found.email,
        name:          found.name,
        role:          found.role,
        ward:          found.ward,
        unit:          found.unit,
        hospitalId:    found.hospitalId,
        sessionExpiry: credential.expiresAt, // anchored to the ORIGINAL login, never extended
      };
      setUser(session);
      saveToStorage('session', session);
      logAuditEvent(session.id, session.name, 'LOGIN', 'session', session.id, `Fingerprint login: ${email}`);
      return { success: true };
    } catch (err) {
      // supabase.auth.refreshSession can reject (not just resolve with an
      // error) on unexpected failures — turn that into a normal failure
      // result instead of an unhandled promise rejection so the UI (Task 4)
      // always gets a { success: false } it can render, never a crash.
      return { success: false, error: err instanceof Error ? err.message : 'Please log in again.' };
    }
  }, []);

  // ─── Verify password without extending session (lock screen re-auth) ───
  // Uses signInWithPassword only to confirm credentials. Does NOT update
  // sessionExpiry so the original 8-hour absolute limit is preserved.
  const verifyPassword = useCallback(async (
    password: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user?.email) return { success: false, error: 'No active session.' };
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
    if (error) return { success: false, error: 'Incorrect password.' };
    return { success: true };
  }, [user?.email]);

  // ─── Logout ───
  const logout = useCallback(() => {
    if (user) {
      logAuditEvent(user.id, user.name, 'LOGOUT', 'session', user.id, 'User logged out');
      clearPatientCache(user.hospitalId); // clear hospital-scoped cache so next user can't read it
    }
    supabase.auth.signOut().catch(() => {});
    clearBiometricCredential().catch(() => {});
    pendingBiometricEnrollmentRef.current = null;
    setOfferBiometricEnrollment(false);
    setUser(null);
    setIsLocked(false);
    removeFromStorage('session');
    clearWorkspaceSelection();
    clearDisclaimerAccepted(); // next user on this device must re-accept
    // Clear sessionStorage (patient form drafts, etc.) so next user on a shared tablet
    // cannot see a prior user's in-progress admission form (L-2 audit fix)
    try { sessionStorage.clear(); } catch { /* ignore */ }
    // Purge SW caches so the next user on a shared tablet cannot read cached patient data
    if ('caches' in window) {
      caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
    }
    window.location.hash = '#/dashboard';
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      login,
      verifyPassword,
      logout,
      isAuthenticated: !!user && user.sessionExpiry > Date.now(),
      isRecoveryMode,
      isLocked,
      unlock,
      unlockWithBiometric,
      loginWithBiometric,
      offerBiometricEnrollment,
      enrollBiometric,
      dismissBiometricOffer,
      viewingHospitalId,
      viewingHospitalName,
      setViewingHospital,
      selectedDepartment,
      selectedUnit,
      setSelectedDepartment,
      setSelectedUnit,
      clearWorkspaceSelection,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
