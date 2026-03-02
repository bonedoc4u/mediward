-- ─────────────────────────────────────────────────────────────────────────────
-- MediWard — Multi-Tenant Migration
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- What this does:
--   1. Creates a `hospitals` table (one row per customer hospital)
--   2. Adds hospital_id to every tenant table
--   3. Migrates existing data into the "default" hospital slot
--   4. Creates helper functions + auto-set triggers so new rows are
--      automatically tagged with the logged-in user's hospital_id
--   5. Creates register_hospital() RPC for the onboarding page
--   6. Replaces all existing RLS policies with hospital-scoped ones
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. hospitals table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hospitals (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT         NOT NULL,
  slug           TEXT         UNIQUE,
  plan           TEXT         NOT NULL DEFAULT 'trial',   -- 'trial' | 'basic' | 'pro'
  status         TEXT         NOT NULL DEFAULT 'active',  -- 'active' | 'suspended'
  trial_ends_at  TIMESTAMPTZ  DEFAULT (now() + INTERVAL '30 days'),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─── 2. Default hospital slot for existing data ───────────────────────────────
-- Using a fixed UUID so existing rows can reference it by default.
INSERT INTO hospitals (id, name, slug, plan, status, trial_ends_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Default Hospital',
  'default',
  'pro',
  'active',
  null
)
ON CONFLICT (id) DO NOTHING;

-- ─── 3. Add hospital_id to all tenant tables ─────────────────────────────────
-- We default to the "Default Hospital" so existing rows get a valid FK.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id)
  DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE patients SET hospital_id = '00000000-0000-0000-0000-000000000001'
  WHERE hospital_id IS NULL;
ALTER TABLE patients ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE patients ALTER COLUMN hospital_id DROP DEFAULT;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id)
  DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE app_users SET hospital_id = '00000000-0000-0000-0000-000000000001'
  WHERE hospital_id IS NULL;
ALTER TABLE app_users ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE app_users ALTER COLUMN hospital_id DROP DEFAULT;

ALTER TABLE labs
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id)
  DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE labs SET hospital_id = '00000000-0000-0000-0000-000000000001'
  WHERE hospital_id IS NULL;
ALTER TABLE labs ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE labs ALTER COLUMN hospital_id DROP DEFAULT;

ALTER TABLE imaging
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id)
  DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE imaging SET hospital_id = '00000000-0000-0000-0000-000000000001'
  WHERE hospital_id IS NULL;
ALTER TABLE imaging ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE imaging ALTER COLUMN hospital_id DROP DEFAULT;

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id)
  DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE audit_log SET hospital_id = '00000000-0000-0000-0000-000000000001'
  WHERE hospital_id IS NULL;
ALTER TABLE audit_log ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE audit_log ALTER COLUMN hospital_id DROP DEFAULT;

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id)
  DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE rounds SET hospital_id = '00000000-0000-0000-0000-000000000001'
  WHERE hospital_id IS NULL;
ALTER TABLE rounds ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE rounds ALTER COLUMN hospital_id DROP DEFAULT;

ALTER TABLE ward_config
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id)
  DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE ward_config SET hospital_id = '00000000-0000-0000-0000-000000000001'
  WHERE hospital_id IS NULL;
ALTER TABLE ward_config ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE ward_config ALTER COLUMN hospital_id DROP DEFAULT;

ALTER TABLE lab_type_config
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id)
  DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE lab_type_config SET hospital_id = '00000000-0000-0000-0000-000000000001'
  WHERE hospital_id IS NULL;
ALTER TABLE lab_type_config ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE lab_type_config ALTER COLUMN hospital_id DROP DEFAULT;

ALTER TABLE hospital_config
  ADD COLUMN IF NOT EXISTS hospital_id UUID REFERENCES hospitals(id)
  DEFAULT '00000000-0000-0000-0000-000000000001';
UPDATE hospital_config SET hospital_id = '00000000-0000-0000-0000-000000000001'
  WHERE hospital_id IS NULL;
ALTER TABLE hospital_config ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE hospital_config ALTER COLUMN hospital_id DROP DEFAULT;

-- ─── 4. Performance indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_patients_hospital_id     ON patients(hospital_id);
CREATE INDEX IF NOT EXISTS idx_app_users_hospital_id    ON app_users(hospital_id);
CREATE INDEX IF NOT EXISTS idx_labs_hospital_id         ON labs(hospital_id);
CREATE INDEX IF NOT EXISTS idx_imaging_hospital_id      ON imaging(hospital_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_hospital_id    ON audit_log(hospital_id);
CREATE INDEX IF NOT EXISTS idx_rounds_hospital_id       ON rounds(hospital_id);
CREATE INDEX IF NOT EXISTS idx_ward_config_hospital_id  ON ward_config(hospital_id);
CREATE INDEX IF NOT EXISTS idx_lab_type_config_hid      ON lab_type_config(hospital_id);
CREATE INDEX IF NOT EXISTS idx_hospital_config_hid      ON hospital_config(hospital_id);

-- ─── 5. Helper: get current user's hospital_id ───────────────────────────────
-- Called by RLS policies and triggers. SECURITY DEFINER so it can read app_users.
CREATE OR REPLACE FUNCTION get_my_hospital_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT hospital_id FROM app_users WHERE id = auth.uid() LIMIT 1;
$$;

-- ─── 6. Auto-set hospital_id trigger ─────────────────────────────────────────
-- On INSERT, if hospital_id is not already set, fill it from get_my_hospital_id().
-- The IF NULL check ensures the register_hospital() RPC can set it explicitly.
CREATE OR REPLACE FUNCTION auto_set_hospital_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.hospital_id IS NULL THEN
    NEW.hospital_id := get_my_hospital_id();
    IF NEW.hospital_id IS NULL THEN
      RAISE EXCEPTION 'Cannot determine hospital_id: user % not found in app_users', auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Apply trigger to all tenant tables (skip app_users and hospital_config —
-- registration RPC sets hospital_id explicitly for those)
DROP TRIGGER IF EXISTS t_patients_hospital_id   ON patients;
DROP TRIGGER IF EXISTS t_labs_hospital_id        ON labs;
DROP TRIGGER IF EXISTS t_imaging_hospital_id     ON imaging;
DROP TRIGGER IF EXISTS t_audit_log_hospital_id   ON audit_log;
DROP TRIGGER IF EXISTS t_rounds_hospital_id      ON rounds;
DROP TRIGGER IF EXISTS t_ward_config_hid         ON ward_config;
DROP TRIGGER IF EXISTS t_lab_type_config_hid     ON lab_type_config;

CREATE TRIGGER t_patients_hospital_id
  BEFORE INSERT ON patients FOR EACH ROW EXECUTE FUNCTION auto_set_hospital_id();
CREATE TRIGGER t_labs_hospital_id
  BEFORE INSERT ON labs FOR EACH ROW EXECUTE FUNCTION auto_set_hospital_id();
CREATE TRIGGER t_imaging_hospital_id
  BEFORE INSERT ON imaging FOR EACH ROW EXECUTE FUNCTION auto_set_hospital_id();
CREATE TRIGGER t_audit_log_hospital_id
  BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION auto_set_hospital_id();
CREATE TRIGGER t_rounds_hospital_id
  BEFORE INSERT ON rounds FOR EACH ROW EXECUTE FUNCTION auto_set_hospital_id();
CREATE TRIGGER t_ward_config_hid
  BEFORE INSERT ON ward_config FOR EACH ROW EXECUTE FUNCTION auto_set_hospital_id();
CREATE TRIGGER t_lab_type_config_hid
  BEFORE INSERT ON lab_type_config FOR EACH ROW EXECUTE FUNCTION auto_set_hospital_id();

-- ─── 7. register_hospital() RPC ──────────────────────────────────────────────
-- Called by the HospitalRegisterPage after Supabase Auth signUp.
-- Creates the hospital row, initial config, and first admin user.
-- Runs as SECURITY DEFINER to bypass RLS (needed because the new auth user
-- isn't in app_users yet, so get_my_hospital_id() would return NULL).
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
  -- Create the hospital
  INSERT INTO hospitals (name, plan, status, trial_ends_at)
  VALUES (p_hospital_name, 'trial', 'active', now() + INTERVAL '30 days')
  RETURNING id INTO v_hospital_id;

  -- Create the hospital's initial config
  INSERT INTO hospital_config (
    hospital_id, hospital_name, department, units,
    pre_op_module_name, procedure_list_name
  ) VALUES (
    v_hospital_id, p_hospital_name, p_department, p_units,
    'Pre-op Clearance', 'Procedure List'
  );

  -- Create the first admin user (password_hash is empty — Supabase Auth handles passwords)
  INSERT INTO app_users (id, email, name, role, hospital_id, password_hash, ward, unit)
  VALUES (p_auth_user_id, lower(p_admin_email), p_admin_name, 'admin', v_hospital_id, '', null, null)
  ON CONFLICT (email) DO UPDATE SET
    hospital_id = v_hospital_id,
    role        = 'admin',
    name        = p_admin_name;

  RETURN v_hospital_id;
END;
$$;

-- Grant anon and authenticated users the ability to call the RPC
-- (needed because auth user may not have a confirmed session yet)
GRANT EXECUTE ON FUNCTION register_hospital TO anon, authenticated;

-- ─── 8. hospitals RLS ─────────────────────────────────────────────────────────
ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;
-- Authenticated users can see their own hospital
DROP POLICY IF EXISTS hospitals_select ON hospitals;
CREATE POLICY hospitals_select ON hospitals
  FOR SELECT TO authenticated
  USING (id = get_my_hospital_id());

-- ─── 9. patients RLS ─────────────────────────────────────────────────────────
-- Drop all prior patients policies (various names used in different migrations)
DROP POLICY IF EXISTS "Allow all for anon"        ON patients;
DROP POLICY IF EXISTS "Authenticated users only"  ON patients;
DROP POLICY IF EXISTS patients_unit_select         ON patients;
DROP POLICY IF EXISTS patients_unit_insert         ON patients;
DROP POLICY IF EXISTS patients_unit_update         ON patients;
DROP POLICY IF EXISTS patients_unit_delete         ON patients;
DROP POLICY IF EXISTS patients_tenant_select       ON patients;
DROP POLICY IF EXISTS patients_tenant_insert       ON patients;
DROP POLICY IF EXISTS patients_tenant_update       ON patients;
DROP POLICY IF EXISTS patients_tenant_delete       ON patients;

CREATE POLICY patients_tenant_select ON patients
  FOR SELECT TO authenticated USING (hospital_id = get_my_hospital_id());
CREATE POLICY patients_tenant_insert ON patients
  FOR INSERT TO authenticated WITH CHECK (hospital_id = get_my_hospital_id());
CREATE POLICY patients_tenant_update ON patients
  FOR UPDATE TO authenticated USING (hospital_id = get_my_hospital_id());
CREATE POLICY patients_tenant_delete ON patients
  FOR DELETE TO authenticated USING (hospital_id = get_my_hospital_id());

-- ─── 10. app_users RLS ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon"        ON app_users;
DROP POLICY IF EXISTS "Authenticated users only"  ON app_users;
DROP POLICY IF EXISTS app_users_select             ON app_users;
DROP POLICY IF EXISTS app_users_insert             ON app_users;
DROP POLICY IF EXISTS app_users_update             ON app_users;
DROP POLICY IF EXISTS app_users_delete             ON app_users;
DROP POLICY IF EXISTS app_users_select_anon        ON app_users;
DROP POLICY IF EXISTS app_users_select_auth        ON app_users;
DROP POLICY IF EXISTS app_users_insert_anon        ON app_users;
DROP POLICY IF EXISTS app_users_insert_auth        ON app_users;

-- Anon can read all app_users (needed for login: findUserByEmail before session exists)
CREATE POLICY app_users_anon_read ON app_users
  FOR SELECT TO anon USING (true);
-- Authenticated users see only their hospital's users
CREATE POLICY app_users_auth_read ON app_users
  FOR SELECT TO authenticated USING (hospital_id = get_my_hospital_id());
-- Admins can manage users within their hospital
CREATE POLICY app_users_auth_write ON app_users
  FOR ALL TO authenticated
  USING (hospital_id = get_my_hospital_id())
  WITH CHECK (hospital_id = get_my_hospital_id());

-- ─── 11. labs RLS ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon"       ON labs;
DROP POLICY IF EXISTS "Authenticated users only" ON labs;
DROP POLICY IF EXISTS labs_tenant                ON labs;

CREATE POLICY labs_tenant ON labs
  FOR ALL TO authenticated
  USING (hospital_id = get_my_hospital_id())
  WITH CHECK (hospital_id = get_my_hospital_id());

-- ─── 12. imaging RLS ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon"       ON imaging;
DROP POLICY IF EXISTS "Authenticated users only" ON imaging;
DROP POLICY IF EXISTS imaging_tenant             ON imaging;

CREATE POLICY imaging_tenant ON imaging
  FOR ALL TO authenticated
  USING (hospital_id = get_my_hospital_id())
  WITH CHECK (hospital_id = get_my_hospital_id());

-- ─── 13. audit_log RLS ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon"       ON audit_log;
DROP POLICY IF EXISTS "Authenticated users only" ON audit_log;
DROP POLICY IF EXISTS audit_log_tenant           ON audit_log;

CREATE POLICY audit_log_tenant ON audit_log
  FOR ALL TO authenticated
  USING (hospital_id = get_my_hospital_id())
  WITH CHECK (hospital_id = get_my_hospital_id());

-- ─── 14. rounds RLS ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon"       ON rounds;
DROP POLICY IF EXISTS "Authenticated users only" ON rounds;
DROP POLICY IF EXISTS rounds_tenant              ON rounds;

CREATE POLICY rounds_tenant ON rounds
  FOR ALL TO authenticated
  USING (hospital_id = get_my_hospital_id())
  WITH CHECK (hospital_id = get_my_hospital_id());

-- ─── 15. ward_config RLS ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon"       ON ward_config;
DROP POLICY IF EXISTS "Authenticated users only" ON ward_config;
DROP POLICY IF EXISTS ward_config_select         ON ward_config;
DROP POLICY IF EXISTS ward_config_write          ON ward_config;
DROP POLICY IF EXISTS ward_config_tenant_select  ON ward_config;
DROP POLICY IF EXISTS ward_config_tenant_write   ON ward_config;

CREATE POLICY ward_config_tenant ON ward_config
  FOR ALL TO authenticated
  USING (hospital_id = get_my_hospital_id())
  WITH CHECK (hospital_id = get_my_hospital_id());

-- ─── 16. lab_type_config RLS ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon"          ON lab_type_config;
DROP POLICY IF EXISTS "Authenticated users only"    ON lab_type_config;
DROP POLICY IF EXISTS lab_type_config_select        ON lab_type_config;
DROP POLICY IF EXISTS lab_type_config_write         ON lab_type_config;
DROP POLICY IF EXISTS lab_type_config_tenant_select ON lab_type_config;
DROP POLICY IF EXISTS lab_type_config_tenant_write  ON lab_type_config;

CREATE POLICY lab_type_config_tenant ON lab_type_config
  FOR ALL TO authenticated
  USING (hospital_id = get_my_hospital_id())
  WITH CHECK (hospital_id = get_my_hospital_id());

-- ─── 17. hospital_config RLS ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all for anon"           ON hospital_config;
DROP POLICY IF EXISTS "Authenticated users only"     ON hospital_config;
DROP POLICY IF EXISTS hospital_config_select         ON hospital_config;
DROP POLICY IF EXISTS hospital_config_write          ON hospital_config;
DROP POLICY IF EXISTS hospital_config_tenant_select  ON hospital_config;
DROP POLICY IF EXISTS hospital_config_tenant_write   ON hospital_config;

-- Anon can read hospital_config (used to show hospital name/branding on login page)
CREATE POLICY hospital_config_anon_read ON hospital_config
  FOR SELECT TO anon USING (true);
CREATE POLICY hospital_config_auth_tenant ON hospital_config
  FOR ALL TO authenticated
  USING (hospital_id = get_my_hospital_id())
  WITH CHECK (hospital_id = get_my_hospital_id());

-- ─── Done ─────────────────────────────────────────────────────────────────────
-- Each existing user/patient/record now belongs to hospital_id
-- '00000000-0000-0000-0000-000000000001' (the "Default Hospital").
--
-- After running this migration:
--   1. Go to AdminSettings → Hospital tab and update the Default Hospital name.
--   2. New hospitals can register via the /register page in the app.
--   3. Each registered hospital is completely isolated via RLS.
