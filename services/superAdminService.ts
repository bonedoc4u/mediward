/**
 * superAdminService.ts
 * Super-admin operations: list all hospitals, approve/reject/suspend.
 * All functions require role = 'superadmin' — enforced by RLS + is_superadmin().
 */

import { supabase } from '../lib/supabase';

export interface HospitalRow {
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  status: string;
  trialEndsAt: string | null;
  createdAt: string;
  adminEmail?: string;
  adminName?: string;
}

/** Fetch all hospitals with their admin user's name and email. */
export async function fetchAllHospitals(): Promise<HospitalRow[]> {
  const { data, error } = await supabase
    .from('hospitals')
    .select('id, name, slug, plan, status, trial_ends_at, created_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`fetchAllHospitals: ${error.message}`);

  const hospitals = (data ?? []) as Array<{
    id: string; name: string; slug: string | null; plan: string;
    status: string; trial_ends_at: string | null; created_at: string;
  }>;

  // Fetch the admin user for each hospital
  const { data: users } = await supabase
    .from('app_users')
    .select('hospital_id, email, name')
    .eq('role', 'admin');

  const adminByHospital: Record<string, { email: string; name: string }> = {};
  for (const u of users ?? []) {
    const row = u as { hospital_id: string; email: string; name: string };
    if (!adminByHospital[row.hospital_id]) {
      adminByHospital[row.hospital_id] = { email: row.email, name: row.name };
    }
  }

  return hospitals.map(h => ({
    id:          h.id,
    name:        h.name,
    slug:        h.slug,
    plan:        h.plan,
    status:      h.status,
    trialEndsAt: h.trial_ends_at,
    createdAt:   h.created_at,
    adminEmail:  adminByHospital[h.id]?.email,
    adminName:   adminByHospital[h.id]?.name,
  }));
}

/** Set hospital status to 'active'. */
export async function approveHospital(hospitalId: string): Promise<void> {
  const { error } = await supabase
    .from('hospitals')
    .update({ status: 'active' })
    .eq('id', hospitalId);
  if (error) throw new Error(`approveHospital: ${error.message}`);
}

/** Set hospital status to 'rejected'. */
export async function rejectHospital(hospitalId: string): Promise<void> {
  const { error } = await supabase
    .from('hospitals')
    .update({ status: 'rejected' })
    .eq('id', hospitalId);
  if (error) throw new Error(`rejectHospital: ${error.message}`);
}

/** Toggle hospital between 'active' and 'suspended'. */
export async function toggleSuspendHospital(hospitalId: string, currentStatus: string): Promise<void> {
  const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
  const { error } = await supabase
    .from('hospitals')
    .update({ status: newStatus })
    .eq('id', hospitalId);
  if (error) throw new Error(`toggleSuspendHospital: ${error.message}`);
}
