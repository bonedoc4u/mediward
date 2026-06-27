-- Migration: 20240601000000_add_unit_column.sql
-- Adds unit-based access control: OR1–OR5 department filtering.
-- Patients tagged with unit; users assigned to unit; service layer filters accordingly.

ALTER TABLE public.patients   ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE public.app_users  ADD COLUMN IF NOT EXISTS unit TEXT;

-- Backfill: existing patients without a unit remain visible to all doctors
-- (admin/ICU view). Doctors with a unit set see only their unit's patients.
-- No backfill needed for unit — NULL means "all wards" (admin/ICU view).

-- Index: unit filter is used in every patient fetch for non-admin users
CREATE INDEX IF NOT EXISTS patients_unit_idx     ON public.patients(unit)    WHERE unit IS NOT NULL;
CREATE INDEX IF NOT EXISTS patients_hospital_idx ON public.patients(hospital_id);
CREATE INDEX IF NOT EXISTS app_users_unit_idx    ON public.app_users(unit)   WHERE unit IS NOT NULL;
