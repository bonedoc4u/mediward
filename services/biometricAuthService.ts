/**
 * biometricAuthService.ts — device fingerprint/Face ID for two flows:
 * unlocking an already-valid but backgrounded session (no server call
 * needed), and signing back in without retyping credentials after a real
 * logout/expiry (gated by a stored Supabase refresh token). See
 * docs/superpowers/specs/2026-08-07-biometric-login-design.md for the full
 * design, especially why the stored credential's expiresAt must always be
 * copied from the ORIGINAL password login's sessionExpiry, never a fresh
 * window computed at biometric-check time.
 */
import { AndroidBiometryStrength, BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { saveToStorage, loadFromStorage, removeFromStorage } from './persistence';

export interface BiometricCredential {
  refreshToken: string;
  expiresAt: number;
  /** The Supabase user id that enrolled this credential — the TOKEN_REFRESHED
   *  rotation handler in AuthContext.tsx only updates the stored token when
   *  this matches the currently-refreshing session, so a credential can
   *  never silently get re-pointed at a different account on a shared
   *  device. */
  userId: string;
}

const STORAGE_KEY = 'biometric_credential';

/**
 * Pure boundary check — the one piece of this feature that MUST be
 * correct, kept trivial and directly testable on purpose. A credential is
 * only usable strictly before its expiresAt, matching how a real session's
 * sessionExpiry is checked elsewhere in this app (AuthContext.tsx).
 *
 * Written as a type predicate (not a plain boolean) so every call site
 * gets TypeScript's narrowing for free — after `if (isBiometricCredentialValid(x, now))`,
 * `x` is known non-null with no `!` assertion needed.
 */
export function isBiometricCredentialValid(
  credential: BiometricCredential | null,
  now: number,
): credential is BiometricCredential {
  return credential !== null && credential.expiresAt > now;
}

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const result = await BiometricAuth.checkBiometry();
    // Require STRONG biometry (Class 3 on Android) — this gates access to
    // patient data, and Android's weak tier can include camera-based face
    // unlock that isn't suitable for that. iOS is unaffected: iOS only has
    // strong biometry, so isAvailable and strongBiometryIsAvailable are
    // always identical there.
    return result.strongBiometryIsAvailable;
  } catch {
    return false;
  }
}

export async function promptBiometric(reason: string): Promise<boolean> {
  try {
    await BiometricAuth.authenticate({ reason, androidBiometryStrength: AndroidBiometryStrength.strong });
    return true;
  } catch {
    // Covers both a genuine failure and a user cancel — both fall back to
    // the password/email form already visible underneath, so callers don't
    // need to distinguish them.
    return false;
  }
}

export async function storeBiometricCredential(refreshToken: string, expiresAt: number, userId: string): Promise<void> {
  saveToStorage<BiometricCredential>(STORAGE_KEY, { refreshToken, expiresAt, userId });
}

export async function loadBiometricCredential(): Promise<BiometricCredential | null> {
  return loadFromStorage<BiometricCredential>(STORAGE_KEY);
}

export async function clearBiometricCredential(): Promise<void> {
  removeFromStorage(STORAGE_KEY);
}
