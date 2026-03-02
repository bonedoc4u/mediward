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
  password_hash: string;
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
    passwordHash: row.password_hash,
    ward:         (row.ward ?? undefined) as StoredUser['ward'],
    unit:         row.unit ?? undefined,
    hospitalId:   row.hospital_id ?? '00000000-0000-0000-0000-000000000001',
  };
}

// ─── Public API ───

/** Fetch all users ordered by creation time. */
export async function fetchAllUsers(): Promise<StoredUser[]> {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
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

/** Find a single user by email (returns null if not found). */
export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (error || !data) return null;
  return rowToUser(data as UserRow);
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
 * Create a new user in both Supabase Auth and app_users.
 * Used by TeamManagement when an admin adds a new team member.
 * Returns an error string on failure, or null on success.
 */
export async function createAuthUser(
  email: string,
  password: string,
  name: string,
  role: UserRole,
  ward?: string,
  unit?: string,
): Promise<string | null> {
  // Step 1: Create Supabase Auth account
  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
  if (authError) return authError.message;
  if (!authData.user) return 'Failed to create auth account.';

  // Step 2: Store role/name/unit in app_users (keyed by Supabase Auth UID)
  const { error: dbError } = await supabase.from('app_users').upsert(
    {
      id:            authData.user.id,
      email:         email.toLowerCase(),
      name,
      role,
      password_hash: '', // Supabase Auth handles passwords now
      ward:          ward ?? null,
      unit:          unit ?? null,
    },
    { onConflict: 'email' },
  );

  if (dbError) return dbError.message;
  return null;
}
