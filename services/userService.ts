/**
 * userService.ts
 * All Supabase reads/writes for the app_users table.
 * Handles snake_case (DB) ↔ camelCase (app) mapping.
 */

import { supabase } from '../lib/supabase';
import { StoredUser, UserRole } from '../types';

// ─── DB row shape ───
interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  password_hash?: string; // excluded from most SELECT queries; only present in upsert writes
  ward: string | null;
  unit: string | null;
  hospital_id: string;
}

function rowToUser(row: UserRow): StoredUser {
  return {
    id:           row.id,
    email:        row.email,
    name:         row.name,
    role:         row.role as UserRole,
    passwordHash: row.password_hash ?? '', // password_hash not fetched by SELECT queries
    ward:         (row.ward ?? undefined) as StoredUser['ward'],
    unit:         row.unit ?? undefined,
    hospitalId:   row.hospital_id ?? '00000000-0000-0000-0000-000000000001',
  };
}

// ─── Public API ───

/** Fetch all users ordered by creation time (excludes password_hash). */
export async function fetchAllUsers(): Promise<StoredUser[]> {
  const { data, error } = await supabase
    .from('app_users')
    .select('id, email, name, role, ward, unit, hospital_id, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`fetchAllUsers: ${error.message}`);
  return (data as UserRow[]).map(rowToUser);
}

/**
 * Count total users (used to decide whether to seed).
 * Returns null when the query fails (RLS block, network error, etc.)
 * so callers can distinguish "0 users" from "unknown" and skip seeding
 * when the result is uncertain.
 */
export async function getUserCount(): Promise<number | null> {
  const { count, error } = await supabase
    .from('app_users')
    .select('*', { count: 'exact', head: true });

  if (error) return null;
  return count ?? 0;
}

/**
 * Find a single user by email.
 * Uses the security-definer RPC which:
 *   - Works for both anon (legacy login) and authenticated callers
 *   - Never returns password_hash
 */
export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const { data, error } = await supabase
    .rpc('get_app_user_by_email', { p_email: email.toLowerCase() });

  if (error || !data || (data as unknown[]).length === 0) return null;
  const row = (data as UserRow[])[0];
  return rowToUser(row);
}

/**
 * Server-side password verification — never exposes the hash to the client.
 * The hash is computed client-side from the plaintext and sent to a
 * SECURITY DEFINER function that compares it inside the DB.
 */
export async function verifyAppUserPassword(email: string, hash: string): Promise<boolean> {
  const { data, error } = await supabase
    .rpc('verify_app_user_password', { p_email: email.toLowerCase(), p_hash: hash });
  if (error) return false;
  return data === true;
}

/** Insert or update a user row. Conflicts on email (the stable unique key). */
export async function upsertAppUser(user: StoredUser): Promise<void> {
  const { error } = await supabase
    .from('app_users')
    .upsert(
      {
        id:            user.id,
        email:         user.email.toLowerCase(),
        name:          user.name,
        role:          user.role,
        password_hash: user.passwordHash,
        ward:          user.ward ?? null,
        unit:          user.unit ?? null,
        hospital_id:   user.hospitalId,
      },
      { onConflict: 'email' }
    );

  if (error) throw new Error(`upsertAppUser (${user.email}): ${error.message}`);
}

/** Permanently delete a user by id. */
export async function removeAppUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('app_users')
    .delete()
    .eq('id', userId);

  if (error) throw new Error(`removeAppUser (${userId}): ${error.message}`);
}

/**
 * Create a new user via the admin-create-user Edge Function.
 *
 * Why an Edge Function instead of supabase.auth.signUp():
 *   - signUp() requires email confirmation by default — the new staff member
 *     can't login until they click a link they didn't know to expect.
 *   - The Edge Function uses the service role to call auth.admin.createUser()
 *     with email_confirm: true, so users are immediately active with the
 *     password the admin set. No email loop. No session clobbering.
 *
 * Returns an error string on failure, or null on success.
 */
export async function createAuthUser(
  email: string,
  password: string,
  name: string,
  role: UserRole,
  ward?: string,
  unit?: string,
  hospitalId?: string,
): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 'You must be logged in to create users.';

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const url = `${supabaseUrl}/functions/v1/admin-create-user`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify({
      email:      email.trim().toLowerCase(),
      password,
      name:       name.trim(),
      role,
      ward:       ward  ?? null,
      unit:       unit  ?? null,
      hospitalId: hospitalId ?? '00000000-0000-0000-0000-000000000001',
    }),
  });

  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) return (json as { error?: string }).error ?? `HTTP ${res.status}`;
  return null;
}
