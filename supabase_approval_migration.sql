-- ─────────────────────────────────────────────────────────────────────────────
-- MediWard — Hospital Approval Migration
-- Run AFTER supabase_multitenant_migration.sql
--
-- What this does:
--   1. Changes register_hospital() to set status = 'pending' (was 'active')
--   2. Adds 'superadmin' and 'rejected' to allowed values
--   3. Creates is_superadmin() helper
--   4. Updates RLS so superadmin can see and manage ALL hospitals
--   5. Provides a SQL snippet to create your superadmin account
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Allow 'superadmin' role in app_users ─────────────────────────────────
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check
  CHECK (role = ANY (ARRAY['admin','resident','house_surgeon','attending','superadmin']));

-- ─── 2. Allow 'rejected' hospital status ─────────────────────────────────────
-- (No constraint to drop — status is a plain TEXT column)

-- ─── 3. is_superadmin() helper ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'superadmin'
  );
$$;

-- ─── 4. Update hospitals RLS — superadmin sees all ───────────────────────────
DROP POLICY IF EXISTS hospitals_select         ON hospitals;
DROP POLICY IF EXISTS hospitals_update_super   ON hospitals;

-- All authenticated users see their own hospital; superadmin sees all
CREATE POLICY hospitals_select ON hospitals
  FOR SELECT TO authenticated
  USING (id = get_my_hospital_id() OR is_superadmin());

-- Superadmin can update any hospital (approve/reject/suspend)
CREATE POLICY hospitals_update_super ON hospitals
  FOR UPDATE TO authenticated
  USING (is_superadmin())
  WITH CHECK (is_superadmin());

-- ─── 5. app_users — superadmin sees all ──────────────────────────────────────
DROP POLICY IF EXISTS app_users_auth_read ON app_users;

CREATE POLICY app_users_auth_read ON app_users
  FOR SELECT TO authenticated
  USING (hospital_id = get_my_hospital_id() OR is_superadmin());

-- ─── 6. Update register_hospital() — new registrations start as 'pending' ───
CREATE OR REPLACE FUNCTION register_hospital(
  p_hospital_name TEXT,
  p_department    TEXT,
  p_units         JSONB,
  p_admin_name    TEXT,
  p_admin_email   TEXT,
  p_auth_user_id  UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hospital_id UUID;
BEGIN
  -- status = 'pending' — must be approved by superadmin before staff can log in
  INSERT INTO hospitals (name, plan, status, trial_ends_at)
  VALUES (p_hospital_name, 'trial', 'pending', now() + INTERVAL '30 days')
  RETURNING id INTO v_hospital_id;

  INSERT INTO hospital_config (
    hospital_id, hospital_name, department, units,
    pre_op_module_name, procedure_list_name
  ) VALUES (
    v_hospital_id, p_hospital_name, p_department, p_units,
    'Pre-op Clearance', 'Procedure List'
  );

  INSERT INTO app_users (id, email, name, role, hospital_id, password_hash, ward, unit)
  VALUES (p_auth_user_id, lower(p_admin_email), p_admin_name, 'admin', v_hospital_id, '', null, null)
  ON CONFLICT (email) DO UPDATE SET
    hospital_id = v_hospital_id,
    role        = 'admin',
    name        = p_admin_name;

  RETURN v_hospital_id;
END;
$$;

GRANT EXECUTE ON FUNCTION register_hospital TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7 — Create your superadmin account (run separately after signing up)
--
-- 1. Sign up at your app with your personal email (e.g. akhilsa9205@gmail.com)
--    If you already have an account, skip signup.
--
-- 2. Run the following query (replace with your actual email):
--
--    UPDATE app_users
--    SET role = 'superadmin',
--        hospital_id = '00000000-0000-0000-0000-000000000001'
--    WHERE email = 'akhilsa9205@gmail.com';
--
-- 3. Log in — you will be routed directly to the Super Admin Console.
-- ─────────────────────────────────────────────────────────────────────────────
