-- check-rebuilt-database.sql
--
-- Run against a database built from scratch out of supabase/migrations/
-- (CI: .github/workflows/db-rebuild.yml; locally: `supabase db start`, then
-- psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f this file).
-- Never run it against production; it only reads, but it is meant for
-- throwaway databases.
--
-- It stops with an error if the rebuilt database is less safe than
-- production is known to be (SEC-03 / OPS-01, 14 Nov 2026).

\set ON_ERROR_STOP on

DO $check$
DECLARE
  bad text;
BEGIN
  -- 1. Every app table has row-level security switched on.
  SELECT string_agg(c.relname, ', ') INTO bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Tables without row-level security: %', bad;
  END IF;

  -- 2. Signed-out callers (anon) can call no app function directly.
  --    Trigger functions are excluded: they cannot be called on their own.
  SELECT string_agg(p.proname, ', ') INTO bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prorettype <> 'trigger'::regtype
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Functions anon can execute: %', bad;
  END IF;

  -- 3. No access rule on an app table is written for anon.
  SELECT string_agg(tablename || '.' || policyname, ', ') INTO bad
  FROM pg_policies
  WHERE schemaname = 'public' AND 'anon' = ANY (roles);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Access rules for anon: %', bad;
  END IF;

  -- 4. Nobody can write to the audit log directly (SEC-05).
  SELECT string_agg(policyname, ', ') INTO bad
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'audit_log' AND cmd IN ('INSERT', 'ALL');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'audit_log write rules: %', bad;
  END IF;

  -- 5. Scan images: the radiology bucket exists, is private, and has
  --    hospital-scoped rules for all four actions.
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'radiology' AND NOT public) THEN
    RAISE EXCEPTION 'radiology bucket missing or public';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname LIKE 'radiology_hospital_%'
        AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%hospital_id%') <> 4 THEN
    RAISE EXCEPTION 'radiology storage rules are not the four hospital-scoped ones';
  END IF;

  -- 6. Live updates never send deletion events: Supabase cannot apply
  --    access rules to them (OPS-03; on dev they leaked other hospitals'
  --    IP numbers). Every table sent live has row-level security.
  IF EXISTS (SELECT 1 FROM pg_publication
             WHERE pubname = 'supabase_realtime' AND (pubdelete OR pubtruncate)) THEN
    RAISE EXCEPTION 'supabase_realtime sends delete or truncate events';
  END IF;
  SELECT string_agg(pt.tablename, ', ') INTO bad
  FROM pg_publication_tables pt
  JOIN pg_class c ON c.relname = pt.tablename
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = pt.schemaname
  WHERE pt.pubname = 'supabase_realtime' AND NOT c.relrowsecurity;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Live-update tables without row-level security: %', bad;
  END IF;

  RAISE NOTICE 'Rebuilt database checks passed.';
END
$check$;
