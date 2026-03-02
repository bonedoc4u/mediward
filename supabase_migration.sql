-- ================================================================
-- MediWard Database Migration: Normalize labs, imaging, rounds
-- Run this in your Supabase SQL Editor (Project → SQL Editor → New query)
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT guards)
-- ================================================================

-- ─── 1. audit_log table ───
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     TEXT        NOT NULL,
  user_name   TEXT        NOT NULL,
  action      TEXT        NOT NULL,
  entity      TEXT        NOT NULL,
  entity_id   TEXT        NOT NULL,
  details     TEXT        NOT NULL DEFAULT ''
);

-- ─── 2. labs table ───
CREATE TABLE IF NOT EXISTS public.labs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_ip_no  TEXT        NOT NULL REFERENCES public.patients(ip_no) ON DELETE CASCADE,
  date           DATE        NOT NULL,
  type           TEXT        NOT NULL,
  value          NUMERIC     NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 3. imaging table ───
CREATE TABLE IF NOT EXISTS public.imaging (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_ip_no  TEXT        NOT NULL REFERENCES public.patients(ip_no) ON DELETE CASCADE,
  date           DATE        NOT NULL,
  type           TEXT        NOT NULL DEFAULT '',
  findings       TEXT        NOT NULL DEFAULT '',
  image_url      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 4. rounds table (reserved for future DailyRounds normalization) ───
CREATE TABLE IF NOT EXISTS public.rounds (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_ip_no  TEXT        NOT NULL REFERENCES public.patients(ip_no) ON DELETE CASCADE,
  date           DATE        NOT NULL,
  note           TEXT        NOT NULL DEFAULT '',
  todos          JSONB       NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 5. Enable Row Level Security ───
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imaging   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds    ENABLE ROW LEVEL SECURITY;

-- ─── 6. RLS Policies — allow anon key (app handles its own auth) ───
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'audit_log' AND policyname = 'Allow all for anon'
  ) THEN
    CREATE POLICY "Allow all for anon" ON public.audit_log
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'labs' AND policyname = 'Allow all for anon'
  ) THEN
    CREATE POLICY "Allow all for anon" ON public.labs
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'imaging' AND policyname = 'Allow all for anon'
  ) THEN
    CREATE POLICY "Allow all for anon" ON public.imaging
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rounds' AND policyname = 'Allow all for anon'
  ) THEN
    CREATE POLICY "Allow all for anon" ON public.rounds
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─── 7. Performance Indexes ───
CREATE INDEX IF NOT EXISTS labs_patient_idx    ON public.labs(patient_ip_no);
CREATE INDEX IF NOT EXISTS labs_date_idx       ON public.labs(date DESC);
CREATE INDEX IF NOT EXISTS imaging_patient_idx ON public.imaging(patient_ip_no);
CREATE INDEX IF NOT EXISTS imaging_date_idx    ON public.imaging(date DESC);
CREATE INDEX IF NOT EXISTS rounds_patient_idx  ON public.rounds(patient_ip_no);
CREATE INDEX IF NOT EXISTS audit_entity_idx    ON public.audit_log(entity_id);
CREATE INDEX IF NOT EXISTS audit_created_idx   ON public.audit_log(created_at DESC);

-- ─── 8. Migrate existing lab_results JSONB → labs table ───
-- Reads each element from patients.lab_results array and inserts into labs
INSERT INTO public.labs (id, patient_ip_no, date, type, value, created_at)
SELECT
  CASE
    WHEN (lr->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (lr->>'id')::UUID
    ELSE gen_random_uuid()
  END,
  p.ip_no,
  COALESCE(
    CASE WHEN lr->>'date' ~ '^\d{4}-\d{2}-\d{2}' THEN (lr->>'date')::DATE END,
    CURRENT_DATE
  ),
  COALESCE(lr->>'type', 'Unknown'),
  COALESCE((lr->>'value')::NUMERIC, 0),
  now()
FROM public.patients p
CROSS JOIN jsonb_array_elements(COALESCE(p.lab_results, '[]'::jsonb)) AS lr
WHERE jsonb_array_length(COALESCE(p.lab_results, '[]'::jsonb)) > 0
ON CONFLICT DO NOTHING;

-- ─── 9. Migrate existing investigations JSONB → imaging table ───
INSERT INTO public.imaging (id, patient_ip_no, date, type, findings, image_url, created_at)
SELECT
  CASE
    WHEN (inv->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (inv->>'id')::UUID
    ELSE gen_random_uuid()
  END,
  p.ip_no,
  COALESCE(
    CASE WHEN inv->>'date' ~ '^\d{4}-\d{2}-\d{2}' THEN (inv->>'date')::DATE END,
    CURRENT_DATE
  ),
  COALESCE(inv->>'type', 'Unknown'),
  COALESCE(inv->>'findings', ''),
  NULLIF(inv->>'imageUrl', ''),
  now()
FROM public.patients p
CROSS JOIN jsonb_array_elements(COALESCE(p.investigations, '[]'::jsonb)) AS inv
WHERE jsonb_array_length(COALESCE(p.investigations, '[]'::jsonb)) > 0
ON CONFLICT DO NOTHING;

-- ─── Done ───
-- After running this migration and verifying data, the app will:
--   • Write new labs/imaging to the normalized tables (not JSONB columns)
--   • Read labs/imaging via JOIN queries
--   • The old lab_results / investigations JSONB columns are kept for safety
--     but will no longer be written to by the app.
