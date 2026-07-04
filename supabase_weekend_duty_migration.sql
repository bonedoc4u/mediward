-- ============================================================================
-- Weekend duty roster column on hospital_config
-- Applied to production 2026-07-04 (Supabase migration: hospital_config_weekend_duty)
-- ============================================================================
-- Adds a JSONB column storing the admin-assigned weekend emergency-OT duty
-- roster: { "YYYY-MM-DD": "OR4", ... } keyed by local weekend date → unit.
-- Additive and non-breaking (defaults to an empty object). Existing RLS on
-- hospital_config (tenant-scoped) already governs read/write — no policy change.
-- ----------------------------------------------------------------------------
ALTER TABLE public.hospital_config
  ADD COLUMN IF NOT EXISTS weekend_duty JSONB NOT NULL DEFAULT '{}'::jsonb;
