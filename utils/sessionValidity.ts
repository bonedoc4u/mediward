import { AuthUser } from '../types';

/**
 * Pure check for whether a locally-stored AuthUser is still within its
 * absolute session window. Kept separate from AuthContext.tsx and
 * deliberately trivial so this exact boundary condition — the thing a bug
 * here would silently widen — is directly unit-tested, not just exercised
 * incidentally through a full component render.
 */
export function isSessionValid(session: AuthUser | null, now: number): boolean {
  return session !== null && session.sessionExpiry > now;
}
