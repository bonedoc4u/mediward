// admin-create-user Edge Function — deployed to Supabase (verify_jwt: true).
// THIS FILE IS THE SOURCE OF TRUTH for the deployed function (v3, 2026-07-06).
// It was previously deployed-only, which is how the password_hash leftover
// survived the June auth cleanup greps. Deploy changes with:
//   supabase functions deploy admin-create-user
//
// Deno runtime — excluded from the app's tsc/eslint gates (see tsconfig.json).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'No authorization header' }, 401);
    }

    // Verify caller identity via their JWT
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user: caller }, error: callerErr } = await userClient.auth.getUser();
    if (callerErr || !caller) return json({ error: 'Unauthorized' }, 401);

    // Caller must be admin or superadmin
    const { data: profile } = await userClient
      .from('app_users')
      .select('role, hospital_id')
      .eq('id', caller.id)
      .single();

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      return json({ error: 'Forbidden: admin role required' }, 403);
    }

    const body = await req.json();
    const { email, password, name, role, ward, unit, hospitalId } = body;

    if (!email || !password || !name || !role || !hospitalId) {
      return json({ error: 'Missing required fields: email, password, name, role, hospitalId' }, 400);
    }
    if (password.length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400);
    }

    // Superadmin can create users for any hospital; admin only for their own
    if (profile.role === 'admin' && profile.hospital_id !== hospitalId) {
      return json({ error: 'Forbidden: cannot create users for another hospital' }, 403);
    }

    // Use service role to create the user — bypasses email confirmation
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email:         email.toLowerCase().trim(),
      password,
      email_confirm: true,          // user is immediately active — no email loop
      user_metadata: { name },
    });

    if (createErr) return json({ error: createErr.message }, 400);
    const userId = created.user.id;

    // Insert into app_users
    // NOTE: password_hash column was dropped (migration 20240901000000) — do not add it back.
    const { error: dbErr } = await admin
      .from('app_users')
      .upsert({
        id:          userId,
        email:       email.toLowerCase().trim(),
        name:        name.trim(),
        role,
        ward:        ward  ?? null,
        unit:        unit  ?? null,
        hospital_id: hospitalId,
      }, { onConflict: 'email' });

    if (dbErr) {
      // Roll back auth user so there is no orphaned account
      await admin.auth.admin.deleteUser(userId);
      return json({ error: dbErr.message }, 500);
    }

    return json({ userId });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
