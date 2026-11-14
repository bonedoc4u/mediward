-- 20261114120000_clinical_tables_role_rules.sql
--
-- SECURITY (audit 2026-11-12, finding SEC-06, step 3 of 4): the database now
-- enforces the role table for the CLINICAL tables.
--
-- Problem: like the patients table before step 2, every rule on these tables
-- checked the hospital only. A login that may only write round notes and
-- orders (attending) could add or delete lab results, X-rays, vitals, nursing
-- notes, medication records and OT lists by calling the API directly. Several
-- tables also carried two or three overlapping policies; policies are OR-ed
-- together, so the loosest one always won.
--
-- Rule: each table needs ONE permission from the role table
-- (utils/permissions.ts; database copy in role_has_permission(), step 2) for
-- every insert, update and delete. Reading is unchanged for everybody.
--
--   rounds                                   rounds:write          (all five roles)
--   labs                                     labs:write
--   imaging                                  investigations:write
--   patient_vitals, nursing_notes,
--   medications_prescribed, med_administrations,
--   wound_care, intake_output,
--   blood_transfusion                        charting:write
--   ot_lists, ot_list_entries                otlist:write
--
-- In effect: admin, resident and house surgeon keep everything they do today.
-- An attending can write round notes (and orders, step 2) and nothing else.
--
-- How it is enforced, per table:
--   1. ALL existing policies on the table are dropped (whatever their names),
--      and exactly four are created: read, insert, update, delete.
--      - read:   the same hospital check the table had before, word for word
--                in meaning (the union of its old policies). No change.
--      - writes: that same hospital check AND current_user_can('<permission>').
--   2. A statement trigger "a_role_check" raises an error that starts with
--      ROLE_FORBIDDEN before the write is attempted. Without it a refused
--      update or delete would silently change zero rows, and the app could
--      not tell the user why. The app keys on that text
--      (services/syncReplay.ts isRoleRefusal) and does not retry.
--
-- Not restricted, exactly as RLS does not restrict them: service-role calls,
-- scheduled jobs, the SQL editor, and changes the database makes itself as
-- part of another change (the cascade when a patient's IP number is corrected
-- or a patient record is deleted; those were already checked on patients).
--
-- Tables that do not exist are skipped, so this file also runs on a database
-- rebuilt from this repo (seven of these tables were created outside it).
--
-- Not touched here: consult_requests and handovers (the app does not use
-- them), settings tables (step 4), storage buckets.
--
-- Needs: 20261114090000_patients_role_rules.sql (current_user_can).
--
-- BEFORE APPLYING IN PRODUCTION, the same check as step 2:
--     select role, count(*) from public.app_users group by role;
--
-- Rollback (re-opens the hole; only if clinical saves are broken in production).
-- Run this block; it removes the role checks and gives every table one
-- hospital-only policy, which is what the old overlapping policies added up to:
--   DO $rollback$
--   DECLARE t text; p record;
--   BEGIN
--     FOREACH t IN ARRAY ARRAY['rounds','labs','imaging','patient_vitals','nursing_notes',
--       'medications_prescribed','med_administrations','wound_care','intake_output',
--       'blood_transfusion','ot_lists','ot_list_entries'] LOOP
--       CONTINUE WHEN to_regclass('public.' || t) IS NULL;
--       EXECUTE format('DROP TRIGGER IF EXISTS a_role_check ON public.%I', t);
--       FOR p IN SELECT policyname, qual FROM pg_policies
--                WHERE schemaname = 'public' AND tablename = t LOOP
--         IF p.policyname = t || '_read' THEN
--           EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
--                          t || '_rollback_all', t, p.qual, p.qual);
--         END IF;
--         EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
--       END LOOP;
--     END LOOP;
--   END $rollback$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The trigger function: one for all tables, the permission is its argument
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_role_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Not a signed-in user: service role, scheduled job, SQL editor.
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  -- A change the database makes itself while carrying out another change:
  -- the foreign-key cascade when a patient's IP number is corrected or a
  -- patient / prescription / OT list is deleted. The change that started it
  -- was already checked on its own table. (Depth 1 = fired directly by the
  -- user's statement. No trigger in this schema writes to a clinical table;
  -- if one is ever added, it must check the role itself.)
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  IF NOT public.current_user_can(TG_ARGV[0]) THEN
    RAISE EXCEPTION 'ROLE_FORBIDDEN: your role cannot change % (needs %)', TG_TABLE_NAME, TG_ARGV[0]
      USING ERRCODE = '42501';
  END IF;

  RETURN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Policies and trigger, table by table
-- ─────────────────────────────────────────────────────────────────────────────
-- Each row: table, permission, hospital check ({t} = the table name), and an
-- extra condition for insert/update that the table already had (or NULL).
DO $$
DECLARE
  c_mine  constant text := 'hospital_id = public.get_my_hospital_id()';
  c_super constant text := '(hospital_id = public.get_my_hospital_id()) OR public.is_superadmin()';
  -- Some old rows may carry no hospital of their own; their old policies also
  -- accepted "the patient belongs to my hospital". Kept, so no row disappears.
  c_via_patient constant text :=
    '(hospital_id = public.get_my_hospital_id()) OR public.is_superadmin() '
    || 'OR patient_ip_no IN (SELECT p.ip_no FROM public.patients p WHERE p.hospital_id = public.get_my_hospital_id())';
  -- Tables with no hospital column: the hospital comes from the patient.
  c_patient_only constant text :=
    'EXISTS (SELECT 1 FROM public.patients p WHERE p.ip_no = {t}.patient_ip_no '
    || 'AND ((p.hospital_id = public.get_my_hospital_id()) OR public.is_superadmin()))';
  c_entry_in_own_list constant text :=
    'EXISTS (SELECT 1 FROM public.ot_lists l WHERE l.id = ot_list_entries.ot_list_id AND l.hospital_id = ot_list_entries.hospital_id)';
  r record;
  p record;
  v_tenant text;
  v_can    text;
  v_write  text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('rounds',                 'rounds:write',         c_mine,         NULL),
      ('labs',                   'labs:write',           c_mine,         NULL),
      ('imaging',                'investigations:write', c_mine,         NULL),
      ('patient_vitals',         'charting:write',       c_via_patient,  NULL),
      ('nursing_notes',          'charting:write',       c_via_patient,  NULL),
      ('medications_prescribed', 'charting:write',       c_super,        NULL),
      ('med_administrations',    'charting:write',       c_via_patient,  NULL),
      ('wound_care',             'charting:write',       c_patient_only, NULL),
      ('intake_output',          'charting:write',       c_patient_only, NULL),
      ('blood_transfusion',      'charting:write',       c_patient_only, NULL),
      ('ot_lists',               'otlist:write',         c_super,        NULL),
      ('ot_list_entries',        'otlist:write',         c_super,        c_entry_in_own_list)
    ) AS x(tbl, permission, tenant, write_extra)
  LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN
      RAISE NOTICE 'clinical role rules: table public.% does not exist here, skipped', r.tbl;
      CONTINUE;
    END IF;

    v_tenant := replace(r.tenant, '{t}', r.tbl);
    v_can    := format('(SELECT public.current_user_can(%L))', r.permission);
    v_write  := format('(%s) AND %s', v_tenant, v_can);

    -- Every existing policy goes, whatever it is called. One leftover
    -- hospital-only policy would cancel the role check.
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = r.tbl LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, r.tbl);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tbl);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
                   r.tbl || '_read', r.tbl, v_tenant);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
                   r.tbl || '_insert_by_role', r.tbl,
                   v_write || COALESCE(' AND ' || r.write_extra, ''));
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
                   r.tbl || '_update_by_role', r.tbl,
                   v_write || COALESCE(' AND ' || r.write_extra, ''),
                   v_write || COALESCE(' AND ' || r.write_extra, ''));
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
                   r.tbl || '_delete_by_role', r.tbl, v_write);

    -- Statement trigger: fires once per statement, before any row is looked
    -- at, so a refusal is an error and never a silent "0 rows changed".
    EXECUTE format('DROP TRIGGER IF EXISTS a_role_check ON public.%I', r.tbl);
    EXECUTE format('CREATE TRIGGER a_role_check BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
                   || 'FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_role_permission(%L)',
                   r.tbl, r.permission);
  END LOOP;
END;
$$;
