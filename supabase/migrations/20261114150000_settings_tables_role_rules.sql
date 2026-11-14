-- 20261114150000_settings_tables_role_rules.sql
--
-- SECURITY (audit 2026-11-12, finding SEC-06, step 4 of 4): the database now
-- enforces the role table for the SETTINGS tables.
--
-- Problem: the app shows "Configuration" to admins only, but the database
-- let every signed-in user of the hospital change these tables:
--   hospital_config  had admin-only insert/update policies, and next to them
--                    a catch-all policy for every user. Policies are OR-ed
--                    together, so the catch-all cancelled the admin check.
--                    Any login could rename the hospital, switch modules off
--                    or change the vital-sign alert thresholds.
--   ward_config      any user could add, rename or delete wards.
--   unit_chiefs      any user could change the unit chiefs. Its policies were
--                    also written for every database role, not only
--                    signed-in users.
--
-- Rules (same role table as utils/permissions.ts, via current_user_can()):
--
--   ward_config, unit_chiefs   every write needs team:manage (admin, superadmin)
--   hospital_config            insert and delete need team:manage.
--                              update needs team:manage, with ONE exception
--                              decided with the department on 14 Nov 2026:
--                              a role that may add patients (patient:add)
--                              may change the shared comorbidity preset list
--                              (column comorbidity_map) and nothing else. The
--                              "Add patient" form edits that list.
--   reading                    unchanged: everybody in the hospital.
--
-- How it is enforced, per table (same pattern as step 3):
--   1. ALL existing policies are dropped and exactly four are created.
--   2. Statement triggers raise an error that starts with ROLE_FORBIDDEN
--      before the write is attempted, so a refusal is never a silent
--      "0 rows changed". The app keys on that text.
--   3. hospital_config also gets a row trigger that compares the old and the
--      new row for a non-admin: only comorbidity_map may differ.
--
-- enforce_role_permission() (step 3) is replaced by a version that accepts
-- several permissions: the write passes when the user has ANY of them. With
-- one argument it behaves exactly as before.
--
-- Not restricted: service-role calls, scheduled jobs, the SQL editor.
--
-- Needs: 20261114090000 (current_user_can) and 20261114120000 (step 3).
-- Deploy the app from this PR BEFORE applying this in production: the older
-- app saves the whole settings row when a resident edits the preset list. If
-- that phone holds an outdated copy of the settings, the database would now
-- refuse the save (correctly), and the older app would not tell the user.
--
-- Rollback (re-opens the hole; only if settings cannot be saved in production):
--   DO $rollback$
--   DECLARE t text; p record;
--   BEGIN
--     FOREACH t IN ARRAY ARRAY['hospital_config','ward_config','unit_chiefs'] LOOP
--       CONTINUE WHEN to_regclass('public.' || t) IS NULL;
--       EXECUTE format('DROP TRIGGER IF EXISTS a_role_check ON public.%I', t);
--       EXECUTE format('DROP TRIGGER IF EXISTS a_role_check_update ON public.%I', t);
--       FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
--         EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
--       END LOOP;
--       EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
--         || 'USING ((hospital_id = public.get_my_hospital_id()) OR public.is_superadmin()) '
--         || 'WITH CHECK ((hospital_id = public.get_my_hospital_id()) OR public.is_superadmin())',
--         t || '_rollback_all', t);
--     END LOOP;
--     DROP TRIGGER IF EXISTS a_hospital_config_role_rules ON public.hospital_config;
--   END $rollback$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. enforce_role_permission(): now "any of the permissions given"
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_role_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed boolean := false;
  v_needs   text := '';
BEGIN
  -- Not a signed-in user (service role, scheduled job, SQL editor), or a
  -- change the database makes itself while carrying out another change (a
  -- foreign-key cascade; see step 3). Neither is restricted here.
  IF auth.uid() IS NULL OR pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  -- The trigger's arguments are permissions. Having ANY one of them is enough.
  FOR i IN 0 .. TG_NARGS - 1 LOOP
    v_allowed := v_allowed OR public.current_user_can(TG_ARGV[i]);
    v_needs   := v_needs || CASE WHEN i > 0 THEN ' or ' ELSE '' END || TG_ARGV[i];
  END LOOP;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'ROLE_FORBIDDEN: your role cannot change % (needs %)', TG_TABLE_NAME, v_needs
      USING ERRCODE = '42501';
  END IF;

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. hospital_config: what a non-admin may change in the row
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_hospital_config_role_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  -- Set by the app on every save; never a setting in itself.
  c_bookkeeping constant text[] := ARRAY['updated_at'];
  -- The part of the settings row that clinical users share and edit.
  c_shared_columns constant text[] := ARRAY['comorbidity_map'];
BEGIN
  IF auth.uid() IS NULL OR public.current_user_can('team:manage') THEN
    RETURN NEW;
  END IF;

  IF NOT public.current_user_can('patient:add') THEN
    RAISE EXCEPTION 'ROLE_FORBIDDEN: your role cannot change hospital settings'
      USING ERRCODE = '42501';
  END IF;

  -- Everything except the shared list must be identical. A setting added
  -- later is locked for non-admins by default.
  IF (to_jsonb(NEW) - c_bookkeeping - c_shared_columns)
     IS DISTINCT FROM (to_jsonb(OLD) - c_bookkeeping - c_shared_columns) THEN
    RAISE EXCEPTION 'ROLE_FORBIDDEN: your role can change the comorbidity preset list only, not other hospital settings'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Policies and triggers, table by table
-- ─────────────────────────────────────────────────────────────────────────────
-- Each row: table, hospital check for reading, hospital check for writing
-- (both as the table had them before), the permission every write needs, and
-- a second permission that is also enough for UPDATE (or NULL).
DO $$
DECLARE
  c_mine  constant text := 'hospital_id = public.get_my_hospital_id()';
  c_super constant text := '(hospital_id = public.get_my_hospital_id()) OR public.is_superadmin()';
  r record;
  p record;
  v_can        text;
  v_can_update text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('hospital_config', c_mine, c_mine,  'team:manage', 'patient:add'),
      ('ward_config',     c_mine, c_super, 'team:manage', NULL),
      ('unit_chiefs',     c_mine, c_super, 'team:manage', NULL)
    ) AS x(tbl, read_tenant, write_tenant, permission, update_also)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN
      RAISE NOTICE 'settings role rules: table public.% does not exist here, skipped', r.tbl;
      CONTINUE;
    END IF;

    v_can := format('(SELECT public.current_user_can(%L))', r.permission);
    v_can_update := CASE WHEN r.update_also IS NULL THEN v_can
      ELSE format('(%s OR (SELECT public.current_user_can(%L)))', v_can, r.update_also) END;

    -- Every existing policy goes, whatever it is called (the catch-all on
    -- hospital_config is the one that cancelled the admin check).
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = r.tbl LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, r.tbl);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tbl);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
                   r.tbl || '_read', r.tbl, r.read_tenant);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((%s) AND %s)',
                   r.tbl || '_insert_by_role', r.tbl, r.write_tenant, v_can);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((%s) AND %s) WITH CHECK ((%s) AND %s)',
                   r.tbl || '_update_by_role', r.tbl, r.write_tenant, v_can_update, r.write_tenant, v_can_update);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ((%s) AND %s)',
                   r.tbl || '_delete_by_role', r.tbl, r.write_tenant, v_can);

    EXECUTE format('DROP TRIGGER IF EXISTS a_role_check ON public.%I', r.tbl);
    EXECUTE format('CREATE TRIGGER a_role_check BEFORE INSERT OR DELETE ON public.%I '
                   || 'FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_role_permission(%L)',
                   r.tbl, r.permission);
    EXECUTE format('DROP TRIGGER IF EXISTS a_role_check_update ON public.%I', r.tbl);
    EXECUTE format('CREATE TRIGGER a_role_check_update BEFORE UPDATE ON public.%I '
                   || 'FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_role_permission(%s)',
                   r.tbl, quote_literal(r.permission) || COALESCE(', ' || quote_literal(r.update_also), ''));
  END LOOP;

  IF to_regclass('public.hospital_config') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS a_hospital_config_role_rules ON public.hospital_config;
    CREATE TRIGGER a_hospital_config_role_rules
      BEFORE UPDATE ON public.hospital_config
      FOR EACH ROW EXECUTE FUNCTION public.enforce_hospital_config_role_rules();
  END IF;
END;
$$;
