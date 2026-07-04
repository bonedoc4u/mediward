-- ============================================================================
-- PROPOSED — REVIEW BEFORE APPLYING. Do NOT run this blindly in production.
-- ============================================================================
-- Radiology bucket tenant isolation (storage.objects RLS)
--
-- Context / gap found (Phase 4 audit):
--   Radiology images are stored at path `{hospitalId}/{patientIpNo}/{uuid}.{ext}`
--   (see services/storageService.ts). Tenant separation is currently enforced
--   ONLY by client code — there is no storage.objects RLS policy in version
--   control. If the bucket's Dashboard policy is permissive (e.g. "authenticated
--   can read the radiology bucket"), any signed-in user of hospital A could
--   createSignedUrl() for hospital B's objects by constructing the path.
--
-- Fix: scope every operation to the first path segment == caller's hospital,
--   reusing the same helper the table policies use (public.get_my_hospital_id()).
--   storage.foldername(name) splits the object path; [1] is the leading folder,
--   which is the hospital_id in our layout.
--
-- Prereqs: bucket 'radiology' exists and is PRIVATE; public.get_my_hospital_id()
--   is defined (supabase_rls_complete_migration.sql).
-- ----------------------------------------------------------------------------

-- Clean up any prior versions of these policies (idempotent re-run).
DROP POLICY IF EXISTS "radiology_tenant_select" ON storage.objects;
DROP POLICY IF EXISTS "radiology_tenant_insert" ON storage.objects;
DROP POLICY IF EXISTS "radiology_tenant_update" ON storage.objects;
DROP POLICY IF EXISTS "radiology_tenant_delete" ON storage.objects;

-- Read (required for createSignedUrl()).
CREATE POLICY "radiology_tenant_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'radiology'
    AND (storage.foldername(name))[1] = public.get_my_hospital_id()::text
  );

-- Upload (required for uploadInvestigationImage()).
CREATE POLICY "radiology_tenant_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'radiology'
    AND (storage.foldername(name))[1] = public.get_my_hospital_id()::text
  );

-- Update (upsert / overwrite of an existing object).
CREATE POLICY "radiology_tenant_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'radiology'
    AND (storage.foldername(name))[1] = public.get_my_hospital_id()::text
  )
  WITH CHECK (
    bucket_id = 'radiology'
    AND (storage.foldername(name))[1] = public.get_my_hospital_id()::text
  );

-- Delete (required for deleteInvestigationImage()).
CREATE POLICY "radiology_tenant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'radiology'
    AND (storage.foldername(name))[1] = public.get_my_hospital_id()::text
  );

-- NOTE: superadmin "view another hospital" uses set_viewing_hospital() to set a
-- session-local override that get_my_hospital_id() reads. Confirm that override
-- is set on the session that requests signed URLs, or superadmin cross-hospital
-- image viewing will (correctly) be denied by these policies.
