-- 20261114180000_erase_patient_data.sql
--
-- DATA (audit 2026-11-12, finding DATA-07): "Erase patient data" as ONE
-- database function, erase_patient_data(ip_no, dry_run).
--
-- Problem: the app did the erase as a chain of separate requests written
-- against guessed column names. Four of the columns do not exist, so the
-- button always failed and erased nothing. Had the names been right it would
-- still have left most clinical data in place, skipped six tables, reported
-- success for a mistyped IP number, and could stop half-way.
--
-- What the function does, all in one transaction (all or nothing):
--   1. Checks: signed in, admin or superadmin, patient exists in the caller's
--      own hospital, and the patient is NOT a current inpatient.
--   2. Deletes every row that belongs to the patient in every table that
--      refers to a patient. The tables are found from the database itself
--      (a foreign key to patients, or a column called patient_ip_no), so a
--      table added later is covered without touching this function.
--   3. Empties the patient row. Kept: IP number, hospital, ward, unit,
--      admission and discharge dates, gender, status. Everything else is set
--      back to its column default, so a column added later is wiped too.
--   4. Writes one audit entry (who, when, how many rows; no patient details).
--   5. Returns what it removed, as JSON.
--
-- Dry run (second argument true): runs the same checks and counts the same
-- rows, changes nothing, and returns who the patient is and which image files
-- belong to them. The app uses it twice: to show the admin exactly whom they
-- are about to erase, and to be sure the real call will be accepted BEFORE it
-- removes any file.
--
-- Not done here: the X-ray files in storage. The app removes those first and
-- only then calls this function (the database cannot delete storage files).
-- The audit log is not touched; older entries may still name the patient.
--
-- SECURITY DEFINER, on purpose: with the caller's rights, row-level security
-- would silently skip any linked row it does not show to the caller, and the
-- function would report a complete erase that is not complete. The checks in
-- step 1 are therefore inside the function. Same pattern as
-- rename_patient_ip_no().
--
-- Needs nothing from the role-rules migrations (SEC-06); it works before and
-- after them. Safe to apply before or after the app from this PR is deployed:
-- the older app does not call it.
--
-- Rollback (the erase button stops working again; no data is affected):
--   DROP FUNCTION IF EXISTS public.erase_patient_data(text, boolean);

CREATE OR REPLACE FUNCTION public.erase_patient_data(p_ip_no text, p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Columns of the patient row that stay exactly as they are.
  c_keep constant text[] := ARRAY[
    'ip_no', 'hospital_id', 'ward', 'unit', 'doa', 'dod', 'gender',
    'patient_status', 'pac_status', 'specialty',
    'created_at', 'updated_at', 'version', 'deleted_at', 'archived_at'
  ];
  -- Required columns with no default: they get a fixed, empty-looking value.
  c_fixed constant text[] := ARRAY['name', 'age', 'bed', 'diagnosis'];
  -- A current inpatient. Erasing their chart mid-admission would be unsafe.
  c_inpatient constant text[] := ARRAY['Fit', 'Review', 'Critical', 'Discharge Ready'];

  v_uid      uuid := auth.uid();
  v_patient  public.patients%ROWTYPE;
  v_removed  jsonb := '{}'::jsonb;
  v_total    bigint := 0;
  v_n        bigint;
  v_set      text;
  v_where    text;
  v_user     text;
  v_images   jsonb := '[]'::jsonb;
  r          record;
BEGIN
  -- ── 1. Checks ────────────────────────────────────────────────────────────
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ROLE_FORBIDDEN: sign in to erase patient data' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ROLE_FORBIDDEN: only an admin can erase patient data' USING ERRCODE = '42501';
  END IF;

  -- Locks the row until the function ends, so nothing is saved in between.
  SELECT * INTO v_patient
  FROM public.patients
  WHERE ip_no = btrim(p_ip_no)
    AND (hospital_id = public.get_my_hospital_id() OR public.is_superadmin())
  FOR UPDATE;

  IF NOT FOUND THEN
    -- P0001, not P0002: the API answers P0001 with "400 bad request" and
    -- P0002 with "500 server error", which would look like a crash.
    RAISE EXCEPTION 'PATIENT_NOT_FOUND: no patient with IP number % in this hospital', btrim(p_ip_no)
      USING ERRCODE = 'P0001';
  END IF;

  IF v_patient.deleted_at IS NULL AND v_patient.patient_status = ANY (c_inpatient) THEN
    RAISE EXCEPTION 'PATIENT_STILL_ADMITTED: % is a current inpatient (status %). Discharge the patient first.',
      v_patient.ip_no, v_patient.patient_status
      USING ERRCODE = 'P0001';
  END IF;

  -- Image files that belong to the patient (for the app to remove from
  -- storage): the imaging table, and the old in-row list some records have.
  IF to_regclass('public.imaging') IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(DISTINCT i.image_url), '[]'::jsonb) INTO v_images
    FROM public.imaging i
    WHERE i.patient_ip_no = v_patient.ip_no AND COALESCE(i.image_url, '') <> '';
  END IF;
  IF jsonb_typeof(v_patient.investigations) = 'array' THEN
    SELECT v_images || COALESCE(jsonb_agg(DISTINCT u.url), '[]'::jsonb) INTO v_images
    FROM (
      SELECT COALESCE(e ->> 'imageUrl', e ->> 'image_url') AS url
      FROM jsonb_array_elements(v_patient.investigations) AS e
    ) u
    WHERE COALESCE(u.url, '') <> '';
  END IF;

  -- ── 2. Linked rows ───────────────────────────────────────────────────────
  FOR r IN
    SELECT c.relname AS tbl,
           a.attname AS col,
           EXISTS (
             SELECT 1 FROM pg_constraint k
             WHERE k.contype = 'f' AND k.conrelid = c.oid
               AND k.confrelid = 'public.patients'::regclass
               AND a.attnum = ANY (k.conkey)
           ) AS has_fk,
           EXISTS (
             SELECT 1 FROM pg_attribute h
             WHERE h.attrelid = c.oid AND h.attname = 'hospital_id' AND NOT h.attisdropped
           ) AS has_hospital
    FROM pg_attribute a
    JOIN pg_class c     ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname <> 'patients'
      AND a.attnum > 0 AND NOT a.attisdropped
      AND (
        a.attname = 'patient_ip_no'
        OR EXISTS (
          SELECT 1 FROM pg_constraint k
          WHERE k.contype = 'f' AND k.conrelid = c.oid
            AND k.confrelid = 'public.patients'::regclass
            AND a.attnum = ANY (k.conkey)
        )
      )
    ORDER BY c.relname, a.attname
  LOOP
    -- With a foreign key the database guarantees the row belongs to this
    -- patient. Without one (a plain text column) stay inside the hospital.
    v_where := format('%I = $1', r.col)
      || CASE WHEN r.has_fk OR NOT r.has_hospital THEN '' ELSE ' AND hospital_id = $2' END;
    IF p_dry_run THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', r.tbl, v_where)
        INTO v_n USING v_patient.ip_no, v_patient.hospital_id;
    ELSE
      EXECUTE format('WITH gone AS (DELETE FROM public.%I WHERE %s RETURNING 1) SELECT count(*) FROM gone', r.tbl, v_where)
        INTO v_n USING v_patient.ip_no, v_patient.hospital_id;
    END IF;
    v_removed := v_removed || jsonb_build_object(r.tbl, COALESCE((v_removed ->> r.tbl)::bigint, 0) + v_n);
    v_total := v_total + v_n;
  END LOOP;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'ip_no', v_patient.ip_no,
      'hospital_id', v_patient.hospital_id,
      'name', v_patient.name,
      'age', v_patient.age,
      'gender', v_patient.gender,
      'ward', v_patient.ward,
      'bed', v_patient.bed,
      'unit', v_patient.unit,
      'patient_status', v_patient.patient_status,
      'rows_to_remove', v_total,
      'image_urls', v_images
    );
  END IF;

  -- ── 3. The patient row ───────────────────────────────────────────────────
  -- Every column that is not kept and not fixed goes back to its default
  -- (NULL where it has none). A new required column without a default makes
  -- this fail loudly instead of leaving data behind.
  SELECT string_agg(format('%I = DEFAULT', a.attname), ', ' ORDER BY a.attnum)
  INTO v_set
  FROM pg_attribute a
  WHERE a.attrelid = 'public.patients'::regclass
    AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
    AND a.attname <> ALL (c_keep || c_fixed);

  EXECUTE 'UPDATE public.patients SET name = $1, age = 0, bed = $2, diagnosis = $3'
       || COALESCE(', ' || v_set, '')
       || ' WHERE ip_no = $4'
    USING '[REDACTED]', '', 'Personal data erased on request', v_patient.ip_no;

  -- ── 4. Audit entry ───────────────────────────────────────────────────────
  SELECT name INTO v_user FROM public.app_users WHERE id = v_uid;
  INSERT INTO public.audit_log (user_id, user_name, hospital_id, action, entity, entity_id, details)
  VALUES (
    v_uid::text, COALESCE(v_user, 'Unknown'), v_patient.hospital_id,
    'DELETE', 'patient', v_patient.ip_no,
    format('Personal data erased on request (DPDP s.13). Linked rows removed: %s.', v_total)
  );

  -- ── 5. Report ────────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ip_no', v_patient.ip_no,
    'erased_at', now(),
    'rows_removed', v_total,
    'removed', v_removed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.erase_patient_data(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erase_patient_data(text, boolean) TO authenticated, service_role;
