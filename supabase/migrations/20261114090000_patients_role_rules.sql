-- 20261114090000_patients_role_rules.sql
--
-- SECURITY (audit 2026-11-12, finding SEC-06, step 2 of 4): the database now
-- enforces the role table for the PATIENTS table.
--
-- Problem: every rule on public.patients checked the hospital only. The app
-- hid buttons by role, but the database accepted any write from any signed-in
-- user of the hospital. So a view-only login could discharge a patient, remove
-- a record, or hard-delete it, by calling the API directly.
--
-- Rules agreed with the department on 13 Nov 2026 (same table as
-- utils/permissions.ts; __tests__/patientsRoleRulesMigration.test.ts compares
-- the two, so they cannot drift apart unnoticed):
--
--   add a patient              admin, resident, house surgeon
--   edit a patient             admin, resident, house surgeon
--   discharge / undo discharge admin, resident
--   remove / restore a record  admin
--   hard delete                admin
--   attending                  may change a patient's ORDERS (todos) only
--   superadmin                 everything (platform owner)
--
-- How it is enforced:
--   1. role_has_permission()  the role table, database copy (all 12 permissions,
--                             so steps 3 and 4 reuse it for the other tables).
--   2. current_user_can()     looks up the signed-in user's role and asks 1.
--   3. A BEFORE trigger on patients checks every insert and update. A refusal
--      raises an error that starts with ROLE_FORBIDDEN. The app keys on that
--      text (services/syncReplay.ts isRoleRefusal): it shows "Your role cannot
--      change this." and does not retry.
--      A trigger is used for updates because the rule depends on WHAT changed
--      (old row vs new row), which a policy cannot see. It is used for inserts
--      too so the user gets a clear error instead of a silent refusal.
--   4. The insert and delete policies also check the role (second lock).
--
-- What still works unchanged: every save the app makes today for admin,
-- resident and house surgeon. Service-role calls, scheduled jobs
-- (purge_old_soft_deletes) and the SQL editor are not signed-in users and are
-- not restricted, exactly as RLS does not restrict them.
--
-- Side effect, intended: rename_patient_ip_no() updates patients.ip_no, so the
-- trigger now refuses a rename by a role that cannot edit patients.
--
-- BEFORE APPLYING IN PRODUCTION, check that every login has a known role:
--     select role, count(*) from public.app_users group by role;
-- Expected roles only: superadmin, admin, resident, house_surgeon, attending.
--
-- Rollback (re-opens the hole; only if saving patients is broken in production):
--   DROP TRIGGER IF EXISTS "a_patients_role_rules" ON public.patients;
--   DROP FUNCTION IF EXISTS public.enforce_patient_role_rules();
--   DROP POLICY IF EXISTS "patients_insert_by_role" ON public.patients;
--   DROP POLICY IF EXISTS "patients_delete_by_role" ON public.patients;
--   CREATE POLICY "patients_tenant_insert" ON public.patients FOR INSERT TO authenticated
--     WITH CHECK (hospital_id = public.get_my_hospital_id());
--   CREATE POLICY "patients_tenant_delete" ON public.patients FOR DELETE TO authenticated
--     USING ((hospital_id = public.get_my_hospital_id()) OR public.is_superadmin());
--   -- role_has_permission() and current_user_can() are harmless; leave them.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The role table (database copy of ROLE_PERMISSIONS in utils/permissions.ts)
-- ─────────────────────────────────────────────────────────────────────────────
-- Pure lookup: no data access. An unknown role or permission gets FALSE.
CREATE OR REPLACE FUNCTION public.role_has_permission(p_role text, p_permission text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(CASE p_permission
    WHEN 'patient:add'          THEN p_role IN ('superadmin', 'admin', 'resident', 'house_surgeon')
    WHEN 'patient:edit'         THEN p_role IN ('superadmin', 'admin', 'resident', 'house_surgeon')
    WHEN 'patient:delete'       THEN p_role IN ('superadmin', 'admin')
    WHEN 'patient:discharge'    THEN p_role IN ('superadmin', 'admin', 'resident')
    WHEN 'rounds:write'         THEN p_role IN ('superadmin', 'admin', 'resident', 'house_surgeon', 'attending')
    WHEN 'labs:write'           THEN p_role IN ('superadmin', 'admin', 'resident', 'house_surgeon')
    WHEN 'investigations:write' THEN p_role IN ('superadmin', 'admin', 'resident', 'house_surgeon')
    WHEN 'pac:write'            THEN p_role IN ('superadmin', 'admin', 'resident', 'house_surgeon')
    WHEN 'preop:write'          THEN p_role IN ('superadmin', 'admin', 'resident', 'house_surgeon')
    WHEN 'otlist:write'         THEN p_role IN ('superadmin', 'admin', 'resident', 'house_surgeon')
    WHEN 'charting:write'       THEN p_role IN ('superadmin', 'admin', 'resident', 'house_surgeon')
    WHEN 'team:manage'          THEN p_role IN ('superadmin', 'admin')
  END, false)
$$;

-- May the signed-in user do this? SECURITY DEFINER so it can read the caller's
-- own app_users row regardless of the policies on that table (same pattern as
-- is_admin() and get_my_hospital_id()). No signed-in user → FALSE.
CREATE OR REPLACE FUNCTION public.current_user_can(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.role_has_permission(
    (SELECT role FROM public.app_users WHERE id = auth.uid()),
    p_permission
  )
$$;

REVOKE ALL ON FUNCTION public.role_has_permission(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_can(text)          FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.role_has_permission(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_can(text)          TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The trigger: every insert and update of a patient by a signed-in user
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_patient_role_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  -- Columns the database itself maintains on every update; never a user's change.
  c_bookkeeping constant text[] := ARRAY['updated_at', 'version'];
  -- Columns that hold a patient's orders (ORDER_COLUMNS in utils/permissions.ts).
  c_order_columns constant text[] := ARRAY['todos'];
BEGIN
  -- Not a signed-in user: service role, scheduled job, SQL editor. Those are
  -- not subject to RLS either. (The anon key cannot reach here with a write:
  -- no policy on patients applies to it.)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.current_user_can('patient:add') THEN
      RAISE EXCEPTION 'ROLE_FORBIDDEN: your role cannot add a patient'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.patient_status = 'Discharged' AND NOT public.current_user_can('patient:discharge') THEN
      RAISE EXCEPTION 'ROLE_FORBIDDEN: your role cannot discharge a patient'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE, rule 1: without patient:edit, only the orders may change — and
  -- only for a role that may write rounds. Everything else must be identical.
  -- A column added later is locked for such a role by default.
  IF NOT public.current_user_can('patient:edit') THEN
    IF NOT public.current_user_can('rounds:write') THEN
      RAISE EXCEPTION 'ROLE_FORBIDDEN: your role cannot change a patient record'
        USING ERRCODE = '42501';
    END IF;
    IF (to_jsonb(NEW) - c_bookkeeping - c_order_columns)
       IS DISTINCT FROM (to_jsonb(OLD) - c_bookkeeping - c_order_columns) THEN
      RAISE EXCEPTION 'ROLE_FORBIDDEN: your role can change a patient''s orders only'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- UPDATE, rule 2: a discharge, or undoing one, needs patient:discharge.
  IF NEW.patient_status IS DISTINCT FROM OLD.patient_status
     AND 'Discharged' IN (COALESCE(OLD.patient_status, ''), COALESCE(NEW.patient_status, ''))
     AND NOT public.current_user_can('patient:discharge') THEN
    RAISE EXCEPTION 'ROLE_FORBIDDEN: your role cannot discharge a patient or undo a discharge'
      USING ERRCODE = '42501';
  END IF;

  -- UPDATE, rule 3: removing a record (deleted_at), or restoring it, needs patient:delete.
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     AND NOT public.current_user_can('patient:delete') THEN
    RAISE EXCEPTION 'ROLE_FORBIDDEN: your role cannot remove or restore a patient record'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Named "a_…" on purpose: BEFORE triggers run in name order, and this one must
-- see the row exactly as the user sent it, before patients_auto_hospital_id
-- fills in defaults (which would look like a change made by the user).
DROP TRIGGER IF EXISTS "a_patients_role_rules" ON public.patients;
CREATE TRIGGER "a_patients_role_rules"
  BEFORE INSERT OR UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_patient_role_rules();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Policies: the second lock on insert, and the only lock on hard delete
-- ─────────────────────────────────────────────────────────────────────────────
-- After this section the table has exactly four policies, in production and
-- in a database rebuilt from this repo alike.
DROP POLICY IF EXISTS "patients_tenant_insert"  ON public.patients;
DROP POLICY IF EXISTS "patients_tenant_delete"  ON public.patients;
DROP POLICY IF EXISTS "patients_insert_by_role" ON public.patients;
DROP POLICY IF EXISTS "patients_delete_by_role" ON public.patients;
-- Only present in a database rebuilt from this repo's first migration
-- (production replaced it long ago): one FOR ALL policy, hospital only. Left
-- in place it would cancel the role check on insert and delete, because
-- policies are OR-ed together.
DROP POLICY IF EXISTS "patients_hospital_scope" ON public.patients;

-- Read and update: restated word for word as they are in production today
-- (own hospital, or superadmin), so there is NO change in behaviour. The
-- trigger above decides what an update may contain.
DROP POLICY IF EXISTS "patients_tenant_select" ON public.patients;
CREATE POLICY "patients_tenant_select" ON public.patients
  FOR SELECT TO authenticated
  USING ((hospital_id = public.get_my_hospital_id()) OR public.is_superadmin());

DROP POLICY IF EXISTS "patients_tenant_update" ON public.patients;
CREATE POLICY "patients_tenant_update" ON public.patients
  FOR UPDATE TO authenticated
  USING ((hospital_id = public.get_my_hospital_id()) OR public.is_superadmin())
  WITH CHECK ((hospital_id = public.get_my_hospital_id()) OR public.is_superadmin());

CREATE POLICY "patients_insert_by_role" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (
    hospital_id = public.get_my_hospital_id()
    AND public.current_user_can('patient:add')
  );

-- Hard delete. The app never does this (it sets deleted_at; a scheduled job
-- purges after 30 days), so this only matters for a direct API call. A DELETE
-- that the policy refuses removes zero rows and raises no error.
CREATE POLICY "patients_delete_by_role" ON public.patients
  FOR DELETE TO authenticated
  USING (
    ((hospital_id = public.get_my_hospital_id()) OR public.is_superadmin())
    AND public.current_user_can('patient:delete')
  );
