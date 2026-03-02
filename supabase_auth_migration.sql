-- ================================================================
-- MediWard Auth Migration: Supabase Auth + Secure RLS
-- Run AFTER creating Supabase Auth accounts for all existing users.
-- See instructions below before running.
-- ================================================================
--
-- BEFORE RUNNING THIS SQL:
-- 1. Go to Supabase → Authentication → Settings
--    → Disable "Email Confirmations" (for internal hospital use)
-- 2. Go to Supabase → Authentication → Users → Add user
--    Create accounts for each existing user (same email + new password)
--    OR: existing users will auto-create via app on first login
-- 3. THEN run this SQL to tighten RLS to authenticated-only
--
-- ================================================================

-- ─── Update patients table: require authenticated ───
DROP POLICY IF EXISTS "Allow all for anon" ON public.patients;
DROP POLICY IF EXISTS "Authenticated users only" ON public.patients;
CREATE POLICY "Authenticated users only" ON public.patients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Update labs table ───
DROP POLICY IF EXISTS "Allow all for anon" ON public.labs;
DROP POLICY IF EXISTS "Authenticated users only" ON public.labs;
CREATE POLICY "Authenticated users only" ON public.labs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Update imaging table ───
DROP POLICY IF EXISTS "Allow all for anon" ON public.imaging;
DROP POLICY IF EXISTS "Authenticated users only" ON public.imaging;
CREATE POLICY "Authenticated users only" ON public.imaging
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Update audit_log table ───
DROP POLICY IF EXISTS "Allow all for anon" ON public.audit_log;
DROP POLICY IF EXISTS "Authenticated users only" ON public.audit_log;
CREATE POLICY "Authenticated users only" ON public.audit_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Update rounds table ───
DROP POLICY IF EXISTS "Allow all for anon" ON public.rounds;
DROP POLICY IF EXISTS "Authenticated users only" ON public.rounds;
CREATE POLICY "Authenticated users only" ON public.rounds
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── app_users: keep anon access (needed for login role lookup + seeding) ───
-- No change needed — app_users does NOT contain patient data.

-- ─── Done ───
-- After this migration:
--   • All patient data requires a valid Supabase Auth session
--   • Anonymous access to patient data is blocked
--   • app_users (roles/names) remains readable for login flow
