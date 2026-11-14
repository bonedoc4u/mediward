// validate.ts — pure request checks for admin-create-user.
// No Deno or URL imports here, so the same file runs in the edge function and
// in the app's vitest suite (__tests__/adminCreateUserValidation.test.ts).

/** Roles a hospital admin may hand out. 'superadmin' is deliberately absent. */
export const HOSPITAL_ROLES = ['admin', 'resident', 'house_surgeon', 'attending'] as const;

/** Mirrors utils/passwordPolicy.ts and the Supabase Auth setting. */
export const PASSWORD_MIN_LENGTH = 10;

export interface Caller {
  role: string;
  hospital_id: string | null;
}

export interface NewUserRequest {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  role?: unknown;
  hospitalId?: unknown;
}

export interface Rejection {
  status: 400 | 403;
  error: string;
}

/**
 * Returns null when the request may proceed, otherwise the response to send.
 *
 * The function creates the user with the service role, which bypasses every
 * database access rule — so THIS is the only place that can stop a hospital
 * admin from creating a super-admin (who can see every hospital) or a user in
 * someone else's hospital.
 */
export function checkNewUserRequest(caller: Caller | null, body: NewUserRequest): Rejection | null {
  if (!caller || !['admin', 'superadmin'].includes(caller.role)) {
    return { status: 403, error: 'Forbidden: admin role required' };
  }

  const { email, password, name, role, hospitalId } = body;
  if (!email || !password || !name || !role || !hospitalId) {
    return { status: 400, error: 'Missing required fields: email, password, name, role, hospitalId' };
  }
  if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string'
    || typeof role !== 'string' || typeof hospitalId !== 'string') {
    return { status: 400, error: 'Invalid field types' };
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { status: 400, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` };
  }

  const isSuperadmin = caller.role === 'superadmin';

  if (role === 'superadmin') {
    if (!isSuperadmin) return { status: 403, error: 'Forbidden: only a super-admin can create a super-admin' };
  } else if (!(HOSPITAL_ROLES as readonly string[]).includes(role)) {
    return { status: 400, error: `Unknown role "${role}"` };
  }

  // Superadmin can create users for any hospital; admin only for their own.
  if (!isSuperadmin && caller.hospital_id !== hospitalId) {
    return { status: 403, error: 'Forbidden: cannot create users for another hospital' };
  }

  return null;
}
