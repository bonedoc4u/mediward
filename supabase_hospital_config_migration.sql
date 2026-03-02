-- ================================================================
-- MediWard Hospital Config Migration
-- Creates the hospital_config table for multi-hospital / multi-department support.
-- Run in Supabase SQL Editor. Safe to run multiple times.
-- ================================================================

-- ─── hospital_config table ───
CREATE TABLE IF NOT EXISTS public.hospital_config (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_name  TEXT        NOT NULL DEFAULT 'GOVT MEDICAL COLLEGE, KOZHIKODE',
  department     TEXT        NOT NULL DEFAULT 'DEPARTMENT OF ORTHOPAEDICS',
  -- Clinical units as a JSONB string array: ["OR1","OR2","OR3","OR4","OR5"]
  units          JSONB       NOT NULL DEFAULT '["OR1","OR2","OR3","OR4","OR5"]',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default row (only if the table is empty)
INSERT INTO public.hospital_config (hospital_name, department, units)
SELECT
  'GOVT MEDICAL COLLEGE, KOZHIKODE',
  'DEPARTMENT OF ORTHOPAEDICS',
  '["OR1","OR2","OR3","OR4","OR5"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.hospital_config);

-- ─── RLS (mirrored in supabase_rls_complete_migration.sql) ───
ALTER TABLE public.hospital_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'hospital_config' AND policyname = 'hospital_config_select'
  ) THEN
    CREATE POLICY "hospital_config_select" ON public.hospital_config
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'hospital_config' AND policyname = 'hospital_config_select_anon'
  ) THEN
    CREATE POLICY "hospital_config_select_anon" ON public.hospital_config
      FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- ─── Done ───
-- After running:
--   • Admin users can update hospital name, department, and units via Settings → Hospital Settings
--   • The app reads this config on load and uses it in all PDF/Excel exports
--   • Adding/removing units here propagates to ward assignment and OT list immediately
