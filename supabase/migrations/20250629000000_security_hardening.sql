-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20250629000000_security_hardening.sql
-- Security audit fixes (2026-06-29):
--   H-1  Drop legacy "Allow all for anon" RLS policies
--   H-2  Create insert_audit_event SECURITY DEFINER RPC
--   M-4  Scope ward_config / lab_type_config SELECT to own hospital
--   NEW  Ensure medications / blood_transfusion tables are RLS-gated
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── H-1: Drop legacy anon-open policies ─────────────────────────────────────
-- These were created by supabase_migration.sql before auth was mandated.
-- If they still exist they allow any caller with the anon key to read/write PHI.
DROP POLICY IF EXISTS "Allow all for anon" ON public.audit_log;
DROP POLICY IF EXISTS "Allow all for anon" ON public.labs;
DROP POLICY IF EXISTS "Allow all for anon" ON public.imaging;
DROP POLICY IF EXISTS "Allow all for anon" ON public.rounds;

-- Ensure authenticated-only read policies exist (idempotent re-creation)
DO $$
BEGIN
  -- audit_log: hospital-scoped read (was open to anon via legacy policy)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_log' AND policyname = 'audit_log_read'
  ) THEN
    CREATE POLICY audit_log_read ON public.audit_log
      FOR SELECT TO authenticated USING (hospital_id = public.get_my_hospital_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_log' AND policyname = 'audit_log_insert'
  ) THEN
    CREATE POLICY audit_log_insert ON public.audit_log
      FOR INSERT TO authenticated WITH CHECK (hospital_id = public.get_my_hospital_id());
  END IF;

  -- labs: ensure authenticated policy (supabase_auth_migration.sql may have already set this)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'labs' AND policyname = 'labs_hospital_scope'
      AND roles && ARRAY['authenticated']::name[]
  ) THEN
    CREATE POLICY labs_auth_scope ON public.labs
      FOR ALL TO authenticated USING (hospital_id = public.get_my_hospital_id());
  END IF;

  -- imaging: same
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'imaging' AND policyname = 'imaging_hospital_scope'
      AND roles && ARRAY['authenticated']::name[]
  ) THEN
    CREATE POLICY imaging_auth_scope ON public.imaging
      FOR ALL TO authenticated USING (hospital_id = public.get_my_hospital_id());
  END IF;

  -- rounds: same
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rounds' AND policyname = 'rounds_hospital_scope'
      AND roles && ARRAY['authenticated']::name[]
  ) THEN
    CREATE POLICY rounds_auth_scope ON public.rounds
      FOR ALL TO authenticated USING (hospital_id = public.get_my_hospital_id());
  END IF;
END $$;

-- ─── H-2: insert_audit_event SECURITY DEFINER RPC ────────────────────────────
-- Server derives user_id and user_name from auth.uid() so the client cannot
-- forge entries under another user's identity. Falls back gracefully if
-- app_users row is not yet present (e.g., during registration flow).
CREATE OR REPLACE FUNCTION public.insert_audit_event(
  p_action    TEXT,
  p_entity    TEXT,
  p_entity_id TEXT,
  p_details   TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id     UUID;
  v_user_name   TEXT;
  v_hospital_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN; END IF;

  SELECT name, hospital_id
  INTO   v_user_name, v_hospital_id
  FROM   public.app_users
  WHERE  id = v_user_id
  LIMIT  1;

  -- Insert into the live audit_log schema
  -- (user_id is TEXT in the pre-normalization schema)
  INSERT INTO public.audit_log (
    user_id, user_name, hospital_id, action, entity, entity_id, details
  ) VALUES (
    v_user_id::TEXT,
    COALESCE(v_user_name, 'Unknown'),
    v_hospital_id,
    p_action,
    p_entity,
    p_entity_id,
    COALESCE(p_details, '')
  );
EXCEPTION WHEN OTHERS THEN
  -- Never let audit failure break the calling request
  NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.insert_audit_event(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.insert_audit_event(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.insert_audit_event(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ─── M-4: Tenant-scope ward_config and lab_type_config reads ─────────────────
-- Previous policies used USING (true) — any authenticated user from any hospital
-- could read any other hospital's ward names and lab configurations.
DROP POLICY IF EXISTS "ward_config_select"     ON public.ward_config;
DROP POLICY IF EXISTS "lab_type_config_select" ON public.lab_type_config;

CREATE POLICY "ward_config_select" ON public.ward_config
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

CREATE POLICY "lab_type_config_select" ON public.lab_type_config
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id());

-- ─── NEW: RLS for medications and blood_transfusion tables ───────────────────
-- These tables were added after the initial RLS setup and may have no policies.
DO $$
BEGIN
  -- medications_prescribed
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'medications_prescribed'
  ) THEN
    ALTER TABLE public.medications_prescribed ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "medications_prescribed_hospital_scope" ON public.medications_prescribed;
    CREATE POLICY "medications_prescribed_hospital_scope"
      ON public.medications_prescribed
      FOR ALL TO authenticated
      USING (hospital_id = public.get_my_hospital_id())
      WITH CHECK (hospital_id = public.get_my_hospital_id());
  END IF;

  -- med_administrations
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'med_administrations'
  ) THEN
    ALTER TABLE public.med_administrations ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "med_administrations_hospital_scope" ON public.med_administrations;
    CREATE POLICY "med_administrations_hospital_scope"
      ON public.med_administrations
      FOR ALL TO authenticated
      USING (
        patient_ip_no IN (
          SELECT ip_no FROM public.patients
          WHERE hospital_id = public.get_my_hospital_id()
        )
      );
  END IF;

  -- blood_transfusion
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'blood_transfusion'
  ) THEN
    ALTER TABLE public.blood_transfusion ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "blood_transfusion_hospital_scope" ON public.blood_transfusion;
    CREATE POLICY "blood_transfusion_hospital_scope"
      ON public.blood_transfusion
      FOR ALL TO authenticated
      USING (
        patient_ip_no IN (
          SELECT ip_no FROM public.patients
          WHERE hospital_id = public.get_my_hospital_id()
        )
      );
  END IF;

  -- nursing_notes (if exists)
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'nursing_notes'
  ) THEN
    ALTER TABLE public.nursing_notes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "nursing_notes_hospital_scope" ON public.nursing_notes;
    CREATE POLICY "nursing_notes_hospital_scope"
      ON public.nursing_notes
      FOR ALL TO authenticated
      USING (
        patient_ip_no IN (
          SELECT ip_no FROM public.patients
          WHERE hospital_id = public.get_my_hospital_id()
        )
      );
  END IF;

  -- patient_vitals (if exists)
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'patient_vitals'
  ) THEN
    ALTER TABLE public.patient_vitals ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "patient_vitals_hospital_scope" ON public.patient_vitals;
    CREATE POLICY "patient_vitals_hospital_scope"
      ON public.patient_vitals
      FOR ALL TO authenticated
      USING (
        patient_ip_no IN (
          SELECT ip_no FROM public.patients
          WHERE hospital_id = public.get_my_hospital_id()
        )
      );
  END IF;
END $$;
