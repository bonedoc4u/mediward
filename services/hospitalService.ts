/**
 * hospitalService.ts
 * Handles hospital registration and multi-tenant setup.
 * The register_hospital() RPC in Supabase creates the hospital row,
 * initial hospital_config, and the first admin user atomically.
 */

import { supabase } from '../lib/supabase';

export interface RegisterHospitalParams {
  hospitalName: string;
  department: string;
  units: string[];
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  inviteCode: string;
}

export interface RegisterHospitalResult {
  hospitalId: string;
  requiresEmailConfirm: boolean;
  error?: string;
}

/**
 * Registers a new hospital and its first admin user.
 *
 * Steps:
 *   1. Create a Supabase Auth account for the admin
 *   2. Call the register_hospital() DB function to atomically create:
 *      - The hospital row
 *      - The hospital_config row (with initial department/units)
 *      - The admin's app_users row (linked to the new hospital)
 *
 * Returns requiresEmailConfirm=true if Supabase requires email verification
 * before the account can log in.
 */
export async function registerHospital(
  params: RegisterHospitalParams,
): Promise<RegisterHospitalResult> {
  // Step 1: Create Supabase Auth account
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: params.adminEmail,
    password: params.adminPassword,
  });

  if (authError) {
    return { hospitalId: '', requiresEmailConfirm: false, error: authError.message };
  }
  if (!authData.user) {
    return { hospitalId: '', requiresEmailConfirm: false, error: 'Failed to create account.' };
  }

  // Step 2: Call register_hospital RPC to set up hospital + admin
  const { data: hospitalId, error: rpcError } = await supabase.rpc('register_hospital', {
    p_hospital_name: params.hospitalName,
    p_department:    params.department,
    p_units:         params.units,
    p_admin_name:    params.adminName,
    p_admin_email:   params.adminEmail.toLowerCase(),
    p_auth_user_id:  authData.user.id,
    p_invite_code:   params.inviteCode.trim().toUpperCase(),
  });

  if (rpcError) {
    // Parse known error codes from the RPC
    const msg = rpcError.message ?? '';
    if (msg.includes('INVALID_INVITE'))
      return { hospitalId: '', requiresEmailConfirm: false, error: 'Invite code is invalid, already used, or does not match the selected college and department.' };
    if (msg.includes('INVITE_REQUIRED'))
      return { hospitalId: '', requiresEmailConfirm: false, error: 'An invite code is required to register.' };
    if (msg.includes('DUPLICATE_WORKSPACE'))
      return { hospitalId: '', requiresEmailConfirm: false, error: 'A workspace for this department already exists at this college.' };
    return { hospitalId: '', requiresEmailConfirm: false, error: rpcError.message };
  }

  const requiresEmailConfirm = !authData.session;
  return { hospitalId: hospitalId as string, requiresEmailConfirm };
}
