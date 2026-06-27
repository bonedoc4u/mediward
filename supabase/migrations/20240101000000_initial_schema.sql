-- Migration: 20240101000000_initial_schema.sql
-- Baseline schema capturing all tables that existed before migration tracking.
-- This is the "starting point" — all future changes are incremental migrations.

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── hospital_config ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hospital_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  department  TEXT NOT NULL DEFAULT 'Orthopaedics',
  city        TEXT,
  state       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── app_users ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin','doctor','nurse','superadmin')),
  ward        TEXT,
  hospital_id UUID REFERENCES public.hospital_config(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── patients ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.patients (
  ip_no               TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  age                 INTEGER,
  sex                 TEXT CHECK (sex IN ('M','F','Other')),
  ward                TEXT,
  bed                 TEXT,
  hospital_id         UUID REFERENCES public.hospital_config(id) ON DELETE CASCADE,
  diagnosis           TEXT,
  date_of_admission   DATE,
  patient_status      TEXT NOT NULL DEFAULT 'active',
  pac_status          TEXT NOT NULL DEFAULT 'pac_pending',
  abha_id             TEXT,
  comorbidities       JSONB DEFAULT '[]',
  allergies           JSONB DEFAULT '[]',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── labs ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.labs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_ip_no   TEXT NOT NULL REFERENCES public.patients(ip_no) ON DELETE CASCADE,
  hospital_id     UUID REFERENCES public.hospital_config(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  type            TEXT NOT NULL,
  value           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── imaging ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.imaging (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_ip_no   TEXT NOT NULL REFERENCES public.patients(ip_no) ON DELETE CASCADE,
  hospital_id     UUID REFERENCES public.hospital_config(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  type            TEXT NOT NULL,
  findings        TEXT,
  image_url       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── rounds ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rounds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_ip_no   TEXT NOT NULL REFERENCES public.patients(ip_no) ON DELETE CASCADE,
  hospital_id     UUID REFERENCES public.hospital_config(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  note            TEXT NOT NULL DEFAULT '',
  todos           JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (patient_ip_no, date)
);

-- ─── audit_log ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          BIGSERIAL PRIMARY KEY,
  hospital_id UUID REFERENCES public.hospital_config(id),
  user_id     UUID,
  action      TEXT NOT NULL,
  table_name  TEXT,
  record_id   TEXT,
  diff        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── ward_config ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ward_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospital_config(id) ON DELETE CASCADE,
  ward_name   TEXT NOT NULL,
  bed_count   INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── lab_type_config ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_type_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES public.hospital_config(id) ON DELETE CASCADE,
  lab_name    TEXT NOT NULL,
  unit        TEXT,
  normal_min  NUMERIC,
  normal_max  NUMERIC,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Helper functions ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_hospital_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT hospital_id FROM public.app_users WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role IN ('admin','superadmin') FROM public.app_users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role = 'superadmin' FROM public.app_users WHERE id = auth.uid();
$$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.patients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imaging        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rounds         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ward_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_type_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log      ENABLE ROW LEVEL SECURITY;

-- Patients: scoped to hospital
CREATE POLICY patients_hospital_scope ON public.patients
  FOR ALL USING (hospital_id = public.get_my_hospital_id());

-- App users: scoped to hospital
CREATE POLICY app_users_hospital_scope ON public.app_users
  FOR ALL USING (hospital_id = public.get_my_hospital_id());

-- Labs: scoped to hospital
CREATE POLICY labs_hospital_scope ON public.labs
  FOR ALL USING (hospital_id = public.get_my_hospital_id());

-- Imaging: scoped to hospital
CREATE POLICY imaging_hospital_scope ON public.imaging
  FOR ALL USING (hospital_id = public.get_my_hospital_id());

-- Rounds: scoped to hospital
CREATE POLICY rounds_hospital_scope ON public.rounds
  FOR ALL USING (hospital_id = public.get_my_hospital_id());

-- Hospital config: read by members, write by admin
CREATE POLICY hospital_config_read ON public.hospital_config
  FOR SELECT USING (id = public.get_my_hospital_id());
CREATE POLICY hospital_config_update ON public.hospital_config
  FOR UPDATE USING (id = public.get_my_hospital_id() AND public.is_admin());

-- Ward/lab config: hospital-scoped
CREATE POLICY ward_config_scope ON public.ward_config
  FOR ALL USING (hospital_id = public.get_my_hospital_id());
CREATE POLICY lab_type_config_scope ON public.lab_type_config
  FOR ALL USING (hospital_id = public.get_my_hospital_id());

-- Audit log: hospital-scoped, append-only (no UPDATE/DELETE)
CREATE POLICY audit_log_read ON public.audit_log
  FOR SELECT USING (hospital_id = public.get_my_hospital_id());
CREATE POLICY audit_log_insert ON public.audit_log
  FOR INSERT WITH CHECK (hospital_id = public.get_my_hospital_id());
