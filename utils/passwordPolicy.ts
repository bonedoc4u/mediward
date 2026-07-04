/**
 * passwordPolicy.ts — client-side mirror of the Supabase Auth password policy
 * (Dashboard/Management API: password_min_length = 10, required characters =
 * lowercase + uppercase + digit, set 2026-07-04). Keep the two in sync: if the
 * server policy changes, update this file, and vice versa.
 *
 * HaveIBeenPwned leaked-password protection is a Supabase Pro feature and is
 * NOT active on the current plan — this length/class policy is the free-tier
 * compensating control.
 */

export const PASSWORD_MIN_LENGTH = 10;

/** Returns a human-readable error, or null if the password passes policy. */
export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include a lowercase letter, an uppercase letter, and a number.';
  }
  return null;
}
