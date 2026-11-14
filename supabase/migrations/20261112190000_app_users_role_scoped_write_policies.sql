-- 20261112190000_app_users_role_scoped_write_policies.sql
--
-- SECURITY FIX (audit 2026-11-12, finding SEC-01, critical).
--
-- Problem: the policy "app_users_auth_write" allowed EVERY signed-in user to
-- insert, update and delete ANY app_users row of their own hospital. It
-- checked the hospital but not the caller's role, and not the role being
-- written. So any resident / house surgeon / view-only attending could run
--     update app_users set role = 'superadmin' where id = auth.uid();
-- through the normal API. patients / rounds / labs policies all contain
-- "OR is_superadmin()", so that one request opened every hospital's patients.
-- Reproduced on the dev project on 2026-11-12 with a resident login.
--
-- New rules:
--   read    unchanged in effect (app_users_auth_read): own hospital, or superadmin.
--   insert  admins, own hospital only, and never a 'superadmin' row.
--   update  admins, own hospital only; cannot touch an existing superadmin
--           row and cannot turn any row into a superadmin.
--   delete  admins, own hospital only; not a superadmin row, not themselves.
--   A superadmin keeps full access (platform owner).
--
-- What still works: Team Settings (admin edits name / role / unit / ward,
-- removes a member) and sign-in. New users are created by the
-- admin-create-user edge function with the service role, which bypasses RLS;
-- that function now validates the role itself (same change set).
--
-- Rollback (re-opens the hole — only if Team Settings is broken in production):
--   DROP POLICY IF EXISTS "app_users_admin_insert" ON public.app_users;
--   DROP POLICY IF EXISTS "app_users_admin_update" ON public.app_users;
--   DROP POLICY IF EXISTS "app_users_admin_delete" ON public.app_users;
--   CREATE POLICY "app_users_auth_write" ON public.app_users TO authenticated
--     USING ((hospital_id = public.get_my_hospital_id()) OR public.is_superadmin())
--     WITH CHECK ((hospital_id = public.get_my_hospital_id()) OR public.is_superadmin());

DROP POLICY IF EXISTS "app_users_auth_write"   ON public.app_users;
-- Only present in a database rebuilt from this repo's first migration
-- (production replaced it long ago): a FOR ALL policy with the same hole.
DROP POLICY IF EXISTS "app_users_hospital_scope" ON public.app_users;
DROP POLICY IF EXISTS "app_users_admin_insert" ON public.app_users;
DROP POLICY IF EXISTS "app_users_admin_update" ON public.app_users;
DROP POLICY IF EXISTS "app_users_admin_delete" ON public.app_users;

-- Read rule: re-created with production's exact definition so this file is
-- complete on its own. On production this changes nothing.
DROP POLICY IF EXISTS "app_users_auth_read" ON public.app_users;
CREATE POLICY "app_users_auth_read" ON public.app_users
  FOR SELECT TO authenticated
  USING (hospital_id = public.get_my_hospital_id() OR public.is_superadmin());

CREATE POLICY "app_users_admin_insert" ON public.app_users
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin()
    OR (
      public.is_admin()
      AND hospital_id = public.get_my_hospital_id()
      AND role <> 'superadmin'
    )
  );

CREATE POLICY "app_users_admin_update" ON public.app_users
  FOR UPDATE TO authenticated
  USING (
    public.is_superadmin()
    OR (
      public.is_admin()
      AND hospital_id = public.get_my_hospital_id()
      AND role <> 'superadmin'          -- an admin cannot edit a superadmin
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR (
      public.is_admin()
      AND hospital_id = public.get_my_hospital_id()
      AND role <> 'superadmin'          -- and cannot create one by editing
    )
  );

CREATE POLICY "app_users_admin_delete" ON public.app_users
  FOR DELETE TO authenticated
  USING (
    public.is_superadmin()
    OR (
      public.is_admin()
      AND hospital_id = public.get_my_hospital_id()
      AND role <> 'superadmin'
      AND id <> auth.uid()              -- an admin cannot delete their own account
    )
  );
