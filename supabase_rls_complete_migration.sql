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

-- Any authenticated user can read (needed for login role lookup + team management)
DROP POLICY IF EXISTS "app_users_select" ON public.app_users;
CREATE POLICY "app_users_select" ON public.app_users
  FOR SELECT TO authenticated USING (true);

-- Also allow anon SELECT so the login flow (before session exists) can look up roles
DROP POLICY IF EXISTS "app_users_select_anon" ON public.app_users;
CREATE POLICY "app_users_select_anon" ON public.app_users
  FOR SELECT TO anon USING (true);

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
--   • app_users: anyone can read (for login); only admins can modify
--   • ward_config / lab_type_config: authenticated read; admin write
--   • hospital_config: anon + authenticated read; admin write
--   • All backed by Supabase Auth (auth.uid())
