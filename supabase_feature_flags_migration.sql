-- ================================================================
-- MediWard — Feature Flags Migration
-- Adds optional module toggles to hospital_config.
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).
-- Run AFTER supabase_hospital_config_migration.sql.
-- ================================================================

-- ─── Optional module tabs (default OFF — admin enables per hospital) ───
ALTER TABLE public.hospital_config
  ADD COLUMN IF NOT EXISTS pre_op_module_name         TEXT        NOT NULL DEFAULT 'Pre-op Clearance',
  ADD COLUMN IF NOT EXISTS procedure_list_name        TEXT        NOT NULL DEFAULT 'Procedure List',
  ADD COLUMN IF NOT EXISTS pre_op_checklist_template  JSONB       NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS show_nursing_notes         BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS show_medication_chart      BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS show_intake_output         BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS show_blood_transfusion     BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS show_wound_care            BOOLEAN     NOT NULL DEFAULT FALSE;

-- ─── NEWS2 toggle (default ON — already shown everywhere before this flag existed) ───
-- Existing rows get TRUE so the dashboard is unchanged after this migration runs.
ALTER TABLE public.hospital_config
  ADD COLUMN IF NOT EXISTS show_news2 BOOLEAN NOT NULL DEFAULT TRUE;

-- ─── Done ───
-- After this migration:
--   • All existing hospitals keep their current feature-flag state.
--   • show_news2 = TRUE for all existing rows (no change in visible behaviour).
--   • Admins can toggle NEWS2 off in Admin Settings → Hospital → Feature Modules.
