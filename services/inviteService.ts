/**
 * inviteService.ts
 * Invite-code management for invite-only hospital registration.
 *
 * Flow:
 *   1. Superadmin creates invite for (college, department) → gets a code like "XKVT-2MNP-8JQH"
 *   2. Superadmin sends the code to the department admin (WhatsApp/email)
 *   3. Registrant enters the code on the registration form
 *   4. validateInvite() checks code, college, department match and not used
 *   5. register_hospital() RPC marks the invite as used atomically
 */

import { supabase } from '../lib/supabase';

export interface Invite {
  id: string;
  code: string;
  college: string;
  department: string;
  used: boolean;
  usedByHospitalId: string | null;
  createdAt: string;
}

/** Generates a cryptographically secure human-readable code like "XKVT-2MNP-8JQH". */
export function generateInviteCode(): string {
  // Excludes O, 0, I, 1 to prevent confusion
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = (n: number) => {
    const buf = new Uint32Array(n);
    crypto.getRandomValues(buf);
    return Array.from(buf, v => chars[v % chars.length]).join('');
  };
  return `${seg(4)}-${seg(4)}-${seg(4)}`;
}

/** Create and persist a new invite. Superadmin only (enforced by RLS). */
export async function createInvite(college: string, department: string): Promise<Invite> {
  const code = generateInviteCode();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('invites')
    .insert({ code, college, department, created_by: user?.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToInvite(data);
}

/** Fetch all invites. Superadmin only (enforced by RLS). */
export async function fetchInvites(): Promise<Invite[]> {
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToInvite);
}

/** Delete (revoke) an unused invite. Superadmin only. */
export async function deleteInvite(id: string): Promise<void> {
  const { error } = await supabase.from('invites').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Validate invite before registration.
 * Returns null if valid, or an error message string if invalid.
 * Runs as anon — no auth required.
 */
export async function validateInvite(
  code: string,
  college: string,
  department: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('invites')
    .select('college, department, used')
    .eq('code', code.trim().toUpperCase())
    .maybeSingle();

  if (error || !data) return 'Invalid invite code. Please check and try again.';
  if (data.used) return 'This invite code has already been used.';
  if ((data.college as string).toLowerCase() !== college.toLowerCase())
    return 'This invite code is not valid for the selected college.';
  if ((data.department as string).toLowerCase() !== department.toLowerCase())
    return 'This invite code is not valid for the selected department.';
  return null;
}

function rowToInvite(row: Record<string, unknown>): Invite {
  return {
    id:               row.id as string,
    code:             row.code as string,
    college:          row.college as string,
    department:       row.department as string,
    used:             row.used as boolean,
    usedByHospitalId: row.used_by_hospital_id as string | null,
    createdAt:        row.created_at as string,
  };
}
