-- ============================================================================
-- Radiology bucket tenant isolation — APPLIED to production 2026-07-04
-- (Supabase MCP migration: radiology_storage_tenant_isolation)
-- ============================================================================
-- Finding (Phase 4 audit, confirmed against the live DB):
--   The `radiology` bucket had SEVEN over-broad policies granting the `public`
--   role full CRUD on anything with bucket_id='radiology' (no hospital scoping):
--     "Allow all on radiology 1izw08g_0..3", "Allow reads", "Allow uploads",
--     "Allow deletes".
--   Hospital-scoped policies (radiology_hospital_select/insert/delete) already
--   existed, but because Postgres RLS combines policies with OR, the permissive
--   ones negated them — effectively allowing any caller to read/write/delete any
--   hospital's images. Path layout is {hospitalId}/{patientIpNo}/{uuid}.{ext}.
--
-- Fix: drop the permissive policies (all 19 existing objects were verified to
--   live under a valid hospital folder, so no legitimate access is lost) and add
--   the missing scoped UPDATE so all four CRUD ops are uniformly hospital-scoped.
--
-- NOTE: the scoped policies use a direct app_users subquery (matching the three
--   pre-existing ones) rather than public.get_my_hospital_id(). Consequence:
--   superadmin "view another hospital" does NOT see cross-hospital images (the
--   session override isn't applied here) — acceptable and consistent with the
--   existing scoped policies.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow all on radiology 1izw08g_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow all on radiology 1izw08g_1" ON storage.objects;
DROP POLICY IF EXISTS "Allow all on radiology 1izw08g_2" ON storage.objects;
DROP POLICY IF EXISTS "Allow all on radiology 1izw08g_3" ON storage.objects;
DROP POLICY IF EXISTS "Allow deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow uploads" ON storage.objects;

CREATE POLICY "radiology_hospital_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'radiology'
    AND (storage.foldername(name))[1] = (
      SELECT u.hospital_id::text FROM public.app_users u
      WHERE u.id::text = auth.uid()::text LIMIT 1
    )
  )
  WITH CHECK (
    bucket_id = 'radiology'
    AND (storage.foldername(name))[1] = (
      SELECT u.hospital_id::text FROM public.app_users u
      WHERE u.id::text = auth.uid()::text LIMIT 1
    )
  );

-- Resulting policy set on storage.objects for the radiology bucket:
--   radiology_hospital_select / insert / update / delete
--   → all TO authenticated, all scoped to (foldername)[1] = caller's hospital_id.
