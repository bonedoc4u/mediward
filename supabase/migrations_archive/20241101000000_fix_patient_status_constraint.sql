-- Migration: 20241101000000_fix_patient_status_constraint.sql
-- Bug fix: chk_patient_status constraint omitted 'Went Home', causing every
-- "Sent Home" update to fail with a Postgres 23514 constraint violation.
-- The app catches the error and enqueues offline — so users see
-- "saved locally - will sync when online" instead of a successful update.
--
-- Full PatientStatus enum values (types.ts):
--   Fit | Review | Critical | Went Home | Discharge Ready | Discharged

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS chk_patient_status,
  ADD  CONSTRAINT chk_patient_status CHECK (
    patient_status IN (
      'Fit', 'Review', 'Critical', 'Went Home', 'Discharge Ready', 'Discharged'
    )
  );
