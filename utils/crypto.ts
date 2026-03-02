/**
 * Legacy SHA-256 password hashing.
 * Used for accounts not yet migrated to Supabase Auth.
 * TODO: Remove after LEGACY_AUTH_DEADLINE (2026-04-02).
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'mediward_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
