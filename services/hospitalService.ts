/**
 * hospitalService.ts
 * Handles hospital registration and multi-tenant setup.
 * The register_hospital() RPC in Supabase creates the hospital row,
 * initial hospital_config, and the first admin user atomically.
 */



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
 * Registers a new hospital and its first admin user via the register-hospital
 * Edge Function.
 *
 * Why an Edge Function instead of signUp() + RPC:
 *   - signUp() may require email confirmation, blocking the admin from logging
 *     in on day one. The Edge Function uses the service role so the account is
 *     immediately active — no email loop.
 *   - The RPC is still called server-side inside the function for atomicity.
 *
 * Always returns requiresEmailConfirm: false because the Edge Function
 * creates the account with email_confirm: true.
 */
export async function registerHospital(
  params: RegisterHospitalParams,
): Promise<RegisterHospitalResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const url = `${supabaseUrl}/functions/v1/register-hospital`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify({
        hospitalName:  params.hospitalName,
        department:    params.department,
        units:         params.units,
        adminName:     params.adminName,
        adminEmail:    params.adminEmail,
        adminPassword: params.adminPassword,
        inviteCode:    params.inviteCode,
      }),
    });
  } catch {
    return { hospitalId: '', requiresEmailConfirm: false, error: 'Network error. Check your connection.' };
  }

  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as {
    hospitalId?: string;
    requiresEmailConfirm?: boolean;
    error?: string;
  };

  if (!res.ok || json.error) {
    return { hospitalId: '', requiresEmailConfirm: false, error: json.error ?? `HTTP ${res.status}` };
  }

  return {
    hospitalId:           json.hospitalId ?? '',
    requiresEmailConfirm: false,  // Edge Function uses email_confirm: true
  };
}
