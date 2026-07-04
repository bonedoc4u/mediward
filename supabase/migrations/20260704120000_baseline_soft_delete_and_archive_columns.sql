-- Baseline: capture soft-delete + archive columns that exist in the live DB
-- but were never recorded in this repo's migration files (schema drift found
-- in the 2026-07-04 audit). The production DB added these via dashboard-era
-- migrations (`soft_delete_patients`, archive function), so everything here
-- is idempotent: it is a no-op against production and creates the missing
-- schema on fresh environments (staging, local `supabase db reset`).
--
-- Used by: services/patientService.ts (removePatient / restorePatient /
-- anonymizePatient read+write deleted_at) and the superadmin-only
-- archive_discharged_patients() function (writes archived_at).

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Matches live index definitions exactly (pg_indexes, 2026-07-04):
-- active-patient queries filter deleted_at IS NULL; archive queries the opposite.
CREATE INDEX IF NOT EXISTS idx_patients_deleted_at
  ON public.patients (deleted_at) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_patients_archived
  ON public.patients (archived_at) WHERE (archived_at IS NOT NULL);
