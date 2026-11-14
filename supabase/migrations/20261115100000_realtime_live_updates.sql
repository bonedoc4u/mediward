-- ============================================================================
-- OPS-03: live updates for the tables the app listens to (14 Nov 2026).
--
-- The app subscribes to live changes on patients (PatientContext), the
-- signed-in user's app_users row (AuthContext) and four settings tables
-- (ConfigContext). In production none of them was in the supabase_realtime
-- publication, so no change ever arrived: a colleague's admission, discharge
-- or status change showed only after a reload.
--
-- Deletion events are switched OFF for the whole publication. Supabase
-- applies access rules to INSERT and UPDATE events (a user receives a row
-- only if they may SELECT it) but cannot do so for DELETE: tested on dev,
-- a hard delete in another hospital reached this hospital's users with the
-- patient's IP number. The app never hard-deletes (removal sets deleted_at,
-- which is an UPDATE), so nothing is lost.
--
-- Safe to re-run: tables already in the publication are skipped.
--
-- Rollback:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.patients,
--     public.app_users, public.hospital_config, public.ward_config,
--     public.lab_type_config, public.medication_config;
--   (leave publish = 'insert, update'; it only removes the leak)
-- ============================================================================

DO $realtime$
DECLARE
  t text;
  live_tables constant text[] := ARRAY[
    'patients', 'app_users',
    'hospital_config', 'ward_config', 'lab_type_config', 'medication_config'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- No deletion (or truncate) events: they would bypass access rules.
  ALTER PUBLICATION supabase_realtime SET (publish = 'insert, update');

  FOREACH t IN ARRAY live_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$realtime$;
