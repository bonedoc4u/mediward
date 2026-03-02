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
import { getUserCount, upsertAppUser, findUserByEmail, createAuthUser } from '../services/userService';
import { generateId } from '../utils/sanitize';
import { hashPassword } from '../utils/crypto';
import { supabase } from '../lib/supabase';
import { toast } from '../utils/toast';

// ─── Legacy SHA-256 (fallback for accounts not yet on Supabase Auth) ───
// TODO: Remove hashPassword import + usage after LEGACY_AUTH_DEADLINE passes.
// All users should have migrated to Supabase Auth by then via the auto-migration on login.
const LEGACY_AUTH_DEADLINE = new Date('2026-04-02').getTime(); // 30 days from 2026-03-03

const DEFAULT_USERS: { email: string; password: string; name: string; role: UserRole }[] = [
  { email: 'dr.ortho@hospital.com', password: 'Ortho@2024', name: 'Dr. Akhil',     role: 'admin'    },
  { email: 'resident@hospital.com', password: 'Res@2024',   name: 'Dr. Priya Nair', role: 'resident' },
];

const SESSION_DURATION   = 8 * 60 * 60 * 1000; // 8 hours
const WARN_BEFORE_EXPIRY = 5 * 60 * 1000;       // warn 5 min before expiry

// ─── Context Shape ───
interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ─── Provider ───
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = loadFromStorage<AuthUser>('session');
    if (saved && saved.sessionExpiry > Date.now()) return saved;
    removeFromStorage('session');
    return null;
  });

  // ─── Seed Default Users (only if table is genuinely empty) ───
  useEffect(() => {
    const seedUsers = async () => {
      const count = await getUserCount();
      // null = query failed (RLS or network) — skip seeding; we can't tell if empty
      if (count === null || count > 0) return;

      for (const u of DEFAULT_USERS) {
        const err = await createAuthUser(u.email, u.password, u.name, u.role);
        if (err) {
          // Auth signup failed (email confirm required, etc.) — use legacy hash
          const hash = await hashPassword(u.password);
          await upsertAppUser({
            id:           generateId(),
            email:        u.email,
            name:         u.name,
            role:         u.role,
            hospitalId:   '00000000-0000-0000-0000-000000000001',
            passwordHash: hash,
          });
        }
      }
    };
    seedUsers().catch(err => console.error('[Auth] Failed to seed users:', err));
  }, []);

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
    window.location.hash = '#/dashboard';
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      login,
      logout,
      isAuthenticated: !!user && user.sessionExpiry > Date.now(),
    }}>
      {children}
    </AuthContext.Provider>
  );
};
