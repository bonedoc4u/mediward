-- Cross-tenant RLS fix — third occurrence of the pattern fixed in
-- 20260704112618_fix_cross_tenant_admin_write_policies.sql (dept_templates_write,
-- medication_config_write). Full schema sweep confirmed lab_type_config is the
-- only remaining table with this bug (see audit query below); no other table's
-- write policies check a role function without also checking hospital_id.
--
-- lab_type_config_insert/update/delete were bare is_admin(), no hospital scope:
-- any hospital's admin could write another hospital's lab type config. This
-- table additionally had lab_type_config_tenant, a FOR ALL policy scoped by
-- hospital_id but with NO role check at all — since permissive policies OR
-- together, the two problems combined meant ANY authenticated user of a
-- hospital (not just admins) could write via _tenant, AND any admin of ANY
-- hospital could write via the three narrow policies. lab_type_config_select
-- (SELECT, hospital-scoped, no role check — correct, unchanged) independently
-- covers read access for all hospital staff, so consolidating the write path
-- into one admin+hospital-scoped FOR ALL policy (mirroring the two tables
-- already fixed this way) does not affect who can read.
--
-- Audit query used to confirm this is the only remaining instance:
--   SELECT schemaname, tablename, policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname IN ('public','storage') AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
--     AND ((qual IS NOT NULL AND qual NOT ILIKE '%hospital_id%')
--          OR (with_check IS NOT NULL AND with_check NOT ILIKE '%hospital_id%'));
-- The only other hits (hospitals_update_super, invites_superadmin_all,
-- status_incidents_superadmin_write — all is_superadmin()-only, and
-- compliance_insert — user_id = auth.uid()) are legitimately cross-tenant by
-- design (platform-level tables / identity-scoped inserts), not bugs.

DROP POLICY IF EXISTS lab_type_config_insert ON public.lab_type_config;
DROP POLICY IF EXISTS lab_type_config_update ON public.lab_type_config;
DROP POLICY IF EXISTS lab_type_config_delete ON public.lab_type_config;
DROP POLICY IF EXISTS lab_type_config_tenant ON public.lab_type_config;

CREATE POLICY lab_type_config_write ON public.lab_type_config
  FOR ALL TO authenticated
  USING ((is_admin() AND hospital_id = get_my_hospital_id()) OR is_superadmin())
  WITH CHECK ((is_admin() AND hospital_id = get_my_hospital_id()) OR is_superadmin());

-- lab_type_config already has the auto_set_hospital_id BEFORE INSERT trigger
-- (t_lab_type_config_hid, confirmed present) — unlike dept_templates/
-- medication_config in the prior fix, no trigger is missing here.
