-- ================================================================
-- MediWard Unit Migration: Add unit-based access control
-- Run this in your Supabase SQL Editor (Project → SQL Editor → New query)
-- Safe to run multiple times (IF NOT EXISTS guards)
-- ================================================================
--
-- WHAT THIS DOES:
--  • Adds a `unit` column to patients (e.g. "OR1", "OR2")
--  • Adds a `unit` column to app_users
--  • When a user has a unit assigned, they only see their unit's patients
--  • Admins (no unit assigned) see ALL patients
--  • Ortho ICU patients from any unit are visible to that unit's staff
--    (because the patient's unit tag follows them into the ICU ward)
-- ================================================================

-- ─── 1. Add unit column to patients table ───
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS unit TEXT;

-- ─── 2. Add unit column to app_users table ───
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS unit TEXT;

-- ─── 3. Indexes for fast unit-filtered queries ───
CREATE INDEX IF NOT EXISTS patients_unit_idx  ON public.patients(unit);
CREATE INDEX IF NOT EXISTS app_users_unit_idx ON public.app_users(unit);

-- ─── 4. Row Level Security: unit-based isolation ───
-- Ensures DB enforces unit access independently of application code.
-- auth.uid() matches the Supabase Auth user whose JWT is attached to the request.

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- Helper: returns the requesting user's unit (NULL = admin / sees all)
CREATE OR REPLACE FUNCTION public.requesting_user_unit()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT unit FROM public.app_users WHERE id = auth.uid()
$$;

-- SELECT: unit-scoped users see only their unit; admins (unit IS NULL) see all
DROP POLICY IF EXISTS patients_select_unit ON public.patients;
CREATE POLICY patients_select_unit ON public.patients
  FOR SELECT USING (
    public.requesting_user_unit() IS NULL   -- admin: no unit restriction
    OR unit IS NULL                          -- unassigned patients visible to all
    OR unit = public.requesting_user_unit()  -- unit-matched patients
  );

-- INSERT: users may only admit patients into their own unit
DROP POLICY IF EXISTS patients_insert_unit ON public.patients;
CREATE POLICY patients_insert_unit ON public.patients
  FOR INSERT WITH CHECK (
    public.requesting_user_unit() IS NULL   -- admin: any unit
    OR unit IS NULL                          -- unassigned admission allowed
    OR unit = public.requesting_user_unit()
  );

-- UPDATE: users may only modify their unit's patients
DROP POLICY IF EXISTS patients_update_unit ON public.patients;
CREATE POLICY patients_update_unit ON public.patients
  FOR UPDATE
  USING (
    public.requesting_user_unit() IS NULL
    OR unit IS NULL
    OR unit = public.requesting_user_unit()
  )
  WITH CHECK (
    public.requesting_user_unit() IS NULL
    OR unit IS NULL
    OR unit = public.requesting_user_unit()
  );

-- DELETE: users may only delete their unit's patients
DROP POLICY IF EXISTS patients_delete_unit ON public.patients;
CREATE POLICY patients_delete_unit ON public.patients
  FOR DELETE USING (
    public.requesting_user_unit() IS NULL
    OR unit = public.requesting_user_unit()
  );

-- ─── Done ───
-- After running:
--  • Assign units to users via Team Settings (admin panel)
--  • New patients inherit the admitting user's unit automatically
--  • Existing patients will have unit = NULL until assigned
--    (admins can edit existing patients to assign units)
--  • RLS now enforces unit isolation at the database level as a second layer
--    of defence below the application-level .eq('unit', unit) filter
