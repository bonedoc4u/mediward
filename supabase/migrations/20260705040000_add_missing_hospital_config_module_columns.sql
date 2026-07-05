-- Applied to production 2026-07-05 via MCP (remote name:
-- add_missing_hospital_config_module_columns). Mirror for the repo history.
--
-- The client (configService.fetchHospitalConfig and the admin save path)
-- references show_wound_assessment / show_rehabilitation, but these columns
-- were never migrated to production. PostgREST therefore returned 400 for
-- EVERY hospital_config fetch, and all clients silently fell back to
-- DEFAULT_HOSPITAL_CONFIG ("MY HOSPITAL", units Unit 1/2/3) — surfacing as
-- wrong units in the unit picker and 0-patient unit filters. Devices only
-- looked correct while serving a localStorage config cached before the
-- regression.
ALTER TABLE public.hospital_config
  ADD COLUMN IF NOT EXISTS show_wound_assessment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_rehabilitation   boolean NOT NULL DEFAULT false;
