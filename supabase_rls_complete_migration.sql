-- ================================================================
-- MediWard RLS Complete Migration
-- Covers app_users, ward_config, lab_type_config, hospital_config
-- Run AFTER supabase_auth_migration.sql (authenticated-only patients/labs/imaging)
-- Safe to run multiple times (DROP POLICY IF EXISTS guards)
-- ================================================================

-- ─── Helper: is the requesting user an admin? ───
-- Used by write policies on config tables.
-- Relies on app_users.id matching auth.uid() (true after Supabase Auth migration).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE id = auth.uid() AND role = 'admin'
  )
$$;

-- ================================================================
-- app_users
-- ================================================================
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- ─── SECURITY FIX: Remove dangerous anon read policy ───
-- The old "app_users_select_anon" USING (true) exposed ALL user data
-- (emails, names, roles, password_hash, hospital_id) to unauthenticated
-- callers. Replaced with a SECURITY DEFINER RPC below.
DROP POLICY IF EXISTS "app_users_select_anon" ON public.app_users;
DROP POLICY IF EXISTS "app_users_anon_read" ON public.app_users;

-- Authenticated users can read users within their own hospital only
DROP POLICY IF EXISTS "app_users_select" ON public.app_users;
CREATE POLICY "app_users_select" ON public.app_users
  FOR SELECT TO authenticated
  USING (
    hospital_id = public.get_my_hospital_id()
    OR public.is_admin()
  );

-- ─── Anon login lookup RPC (SECURITY DEFINER) ───
-- Returns ONLY {id, role, hospital_id} for a given email.
-- No direct table SELECT for anon — prevents enumeration attacks.
CREATE OR REPLACE FUNCTION public.lookup_user_for_login(p_email TEXT)
RETURNS TABLE(id UUID, role TEXT, hospital_id UUID)
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT au.id, au.role, au.hospital_id
  FROM public.app_users au
  WHERE au.email = p_email
  LIMIT 1
$$;

-- Grant execute to anon so the login flow can call this RPC
GRANT EXECUTE ON FUNCTION public.lookup_user_for_login(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.lookup_user_for_login(TEXT) TO authenticated;

-- Only admins can create/update/delete users
DROP POLICY IF EXISTS "app_users_insert" ON public.app_users;
CREATE POLICY "app_users_insert" ON public.app_users
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "app_users_update" ON public.app_users;
CREATE POLICY "app_users_update" ON public.app_users
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "app_users_delete" ON public.app_users;
CREATE POLICY "app_users_delete" ON public.app_users
  FOR DELETE TO authenticated USING (public.is_admin());

-- ================================================================
-- ward_config
-- ================================================================
ALTER TABLE public.ward_config ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read ward config
DROP POLICY IF EXISTS "ward_config_select" ON public.ward_config;
CREATE POLICY "ward_config_select" ON public.ward_config
  FOR SELECT TO authenticated USING (true);

-- Admins only for writes
DROP POLICY IF EXISTS "ward_config_insert" ON public.ward_config;
CREATE POLICY "ward_config_insert" ON public.ward_config
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ward_config_update" ON public.ward_config;
CREATE POLICY "ward_config_update" ON public.ward_config
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ward_config_delete" ON public.ward_config;
CREATE POLICY "ward_config_delete" ON public.ward_config
  FOR DELETE TO authenticated USING (public.is_admin());

-- ================================================================
-- lab_type_config
-- ================================================================
ALTER TABLE public.lab_type_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lab_type_config_select" ON public.lab_type_config;
CREATE POLICY "lab_type_config_select" ON public.lab_type_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "lab_type_config_insert" ON public.lab_type_config;
CREATE POLICY "lab_type_config_insert" ON public.lab_type_config
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "lab_type_config_update" ON public.lab_type_config;
CREATE POLICY "lab_type_config_update" ON public.lab_type_config
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "lab_type_config_delete" ON public.lab_type_config;
CREATE POLICY "lab_type_config_delete" ON public.lab_type_config
  FOR DELETE TO authenticated USING (public.is_admin());

-- ================================================================
-- hospital_config  (created by supabase_hospital_config_migration.sql)
-- ================================================================
ALTER TABLE public.hospital_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hospital_config_select" ON public.hospital_config;
CREATE POLICY "hospital_config_select" ON public.hospital_config
  FOR SELECT TO authenticated USING (true);

-- Anon can also read hospital_config (needed before login for branding)
DROP POLICY IF EXISTS "hospital_config_select_anon" ON public.hospital_config;
CREATE POLICY "hospital_config_select_anon" ON public.hospital_config
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "hospital_config_insert" ON public.hospital_config;
CREATE POLICY "hospital_config_insert" ON public.hospital_config
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "hospital_config_update" ON public.hospital_config;
CREATE POLICY "hospital_config_update" ON public.hospital_config
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─── Index on app_users.role for fast is_admin() lookups ───
CREATE INDEX IF NOT EXISTS app_users_role_idx ON public.app_users(role);

-- ─── Done ───
-- After this migration:
--   • app_users: authenticated same-hospital read; anon uses lookup_user_for_login() RPC
--   • ward_config / lab_type_config: authenticated read; admin write
--   • hospital_config: anon + authenticated read; admin write
--   • All backed by Supabase Auth (auth.uid())

-- ================================================================
-- Superadmin cross-hospital viewing (Bug #4 fix)
-- ================================================================
-- Allows superadmin to set a session-level hospital context for
-- viewing another hospital's data through RLS.
CREATE OR REPLACE FUNCTION public.set_viewing_hospital(p_hospital_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only admins can switch hospital context
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admin users can switch hospital context';
  END IF;
  PERFORM set_config('app.viewing_hospital_id', p_hospital_id::TEXT, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_viewing_hospital(UUID) TO authenticated;

-- Update get_my_hospital_id to check for superadmin override
CREATE OR REPLACE FUNCTION public.get_my_hospital_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_hospital_id UUID;
  v_viewing TEXT;
BEGIN
  -- Check if admin has set a viewing hospital override
  BEGIN
    v_viewing := current_setting('app.viewing_hospital_id', true);
  EXCEPTION WHEN OTHERS THEN
    v_viewing := NULL;
  END;

  IF v_viewing IS NOT NULL AND v_viewing != '' AND public.is_admin() THEN
    RETURN v_viewing::UUID;
  END IF;

  -- Default: return the user's own hospital_id
  SELECT hospital_id INTO v_hospital_id
  FROM public.app_users
  WHERE id = auth.uid();

  RETURN v_hospital_id;
END;
$$;
