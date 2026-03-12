/**
 * AuthContext.tsx
 * Handles authentication, session management, and user seeding.
 * Isolated from patient/UI state so auth changes don't trigger
 * patient-list or navigation re-renders.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthUser, UserRole } from '../types';
import { loadFromStorage, saveToStorage, removeFromStorage } from '../services/persistence';
import { logAuditEvent } from '../services/auditLog';
import { findUserByEmail, createAuthUser } from '../services/userService';
import { hashPassword } from '../utils/crypto';
import { supabase } from '../lib/supabase';
import { toast } from '../utils/toast';
import { clearDisclaimerAccepted } from '../components/ClinicalDisclaimer';

// ─── Legacy SHA-256 (fallback for accounts not yet on Supabase Auth) ───
// TODO: Remove hashPassword import + usage after LEGACY_AUTH_DEADLINE passes.
// All users should have migrated to Supabase Auth by then via the auto-migration on login.
const LEGACY_AUTH_DEADLINE = new Date('2026-03-26').getTime(); // 14-day forced migration window (shortened from Apr 2)

const SESSION_DURATION    = 8 * 60 * 60 * 1000;  // 8 hours absolute limit
const WARN_BEFORE_EXPIRY  = 5 * 60 * 1000;        // warn 5 min before expiry
const INACTIVITY_LIMIT    = 30 * 60 * 1000;        // auto-logout after 30 min no interaction
const INACTIVITY_WARN     = 25 * 60 * 1000;        // warn at 25 min

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

  // ─── Inactivity Timeout (30 min no interaction → auto-logout) ───
  useEffect(() => {
    if (!user) return;

    let warnTimer: ReturnType<typeof setTimeout>;
    let logoutTimer: ReturnType<typeof setTimeout>;

    const reset = () => {
      clearTimeout(warnTimer);
      clearTimeout(logoutTimer);
      warnTimer = setTimeout(() => {
        toast.warning('⚠️ No activity for 25 minutes. You will be logged out in 5 minutes.');
      }, INACTIVITY_WARN);
      logoutTimer = setTimeout(() => {
        toast.warning('Logged out due to inactivity.');
        supabase.auth.signOut().catch(() => {});
        setUser(null);
        removeFromStorage('session');
        clearDisclaimerAccepted();
        window.location.hash = '#/dashboard';
      }, INACTIVITY_LIMIT);
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

  // ─── Login ───
  const login = useCallback(async (
    email: string,
    password: string,
  ): Promise<{ success: boolean; error?: string }> => {

    // Step 1: Try Supabase Auth (new accounts)
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

    // Step 2: Legacy SHA-256 fallback — disabled after LEGACY_AUTH_DEADLINE
    if (Date.now() > LEGACY_AUTH_DEADLINE) {
      return {
        success: false,
        error: 'Your account requires a password reset. Contact your administrator.',
      };
    }

    const found = await findUserByEmail(email);
    if (!found) return { success: false, error: 'Invalid email or password.' };

    const hash = await hashPassword(password);
    if (hash !== found.passwordHash) return { success: false, error: 'Invalid email or password.' };

    // Auto-migrate: create Supabase Auth account so future logins skip this branch
    createAuthUser(email, password, found.name, found.role, found.ward, found.unit).catch(() => {});

    const session: AuthUser = {
      id:            found.id,
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
    logAuditEvent(session.id, session.name, 'LOGIN', 'session', session.id, `Login (legacy): ${email}`);
    return { success: true };
  }, []);

  // ─── Logout ───
  const logout = useCallback(() => {
    if (user) {
      logAuditEvent(user.id, user.name, 'LOGOUT', 'session', user.id, 'User logged out');
    }
    supabase.auth.signOut().catch(() => {});
    setUser(null);
    removeFromStorage('session');
    clearDisclaimerAccepted(); // next user on this device must re-accept
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
