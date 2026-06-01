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
import { toast } from '../utils/toast';
import { clearDisclaimerAccepted } from '../components/ClinicalDisclaimer';
import { clearPatientCache } from '../services/patientCache';

const SESSION_DURATION   = 8 * 60 * 60 * 1000;  // 8 hours absolute limit
const WARN_BEFORE_EXPIRY = 5 * 60 * 1000;        // warn 5 min before absolute expiry

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
  logout: () => void;
  isAuthenticated: boolean;
  /** Superadmin: ID of the hospital workspace currently being viewed (null = own hospital). */
  viewingHospitalId: string | null;
  /** Superadmin: display name of the hospital being viewed. */
  viewingHospitalName: string | null;
  /** Set the hospital workspace the superadmin is viewing. Pass null to exit. */
  setViewingHospital: (id: string | null, name?: string) => void;
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

  const setViewingHospital = useCallback((id: string | null, name?: string) => {
    setViewingHospitalId(id);
    setViewingHospitalName(id ? (name ?? null) : null);
  }, []);

  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = loadFromStorage<AuthUser>('session');
    if (saved && saved.sessionExpiry > Date.now()) return saved;
    removeFromStorage('session');
    return null;
  });

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ─── Session Expiry Timers ───
  useEffect(() => {
    if (!user) return;

    const msUntilExpiry = user.sessionExpiry - Date.now();
    if (msUntilExpiry <= 0) {
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

  // ─── Supabase auth state listener (catches server-side token expiry / revocation) ───
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        if (event === 'SIGNED_OUT') {
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

      // Check hospital approval status (superadmin bypasses this check)
      if (found.role !== 'superadmin') {
        const { data: hosp } = await supabase
          .from('hospitals')
          .select('status')
          .eq('id', found.hospitalId)
          .maybeSingle();

        if (hosp?.status === 'pending') {
          await supabase.auth.signOut().catch(() => {});
          return { success: false, error: 'Your hospital registration is pending approval. You will be notified once approved.' };
        }
        if (hosp?.status === 'rejected') {
          await supabase.auth.signOut().catch(() => {});
          return { success: false, error: 'Your hospital registration was not approved. Contact support.' };
        }
        if (hosp?.status === 'suspended') {
          await supabase.auth.signOut().catch(() => {});
          return { success: false, error: 'Your hospital account has been suspended. Contact support.' };
        }
      }

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
      return { success: true };
    }

    // Supabase Auth failed — no legacy fallback.
    return { success: false, error: authError?.message ?? 'Invalid email or password.' };
  }, []);

  // ─── Logout ───
  const logout = useCallback(() => {
    if (user) {
      logAuditEvent(user.id, user.name, 'LOGOUT', 'session', user.id, 'User logged out');
      clearPatientCache(user.hospitalId); // clear hospital-scoped cache so next user can't read it
    }
    supabase.auth.signOut().catch(() => {});
    setUser(null);
    removeFromStorage('session');
    clearDisclaimerAccepted(); // next user on this device must re-accept
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
      logout,
      isAuthenticated: !!user && user.sessionExpiry > Date.now(),
      viewingHospitalId,
      viewingHospitalName,
      setViewingHospital,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
