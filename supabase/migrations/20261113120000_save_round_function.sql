-- 20261113120000_save_round_function.sql
--
-- FEATURE / FIX (audit 2026-11-12, finding DATA-04): two doctors, one note.
--
-- A round save replaced whatever the server held. If Dr B saved a note while
-- Dr A was still typing, Dr A's save silently overwrote it.
--
-- save_round() is the one way the app writes a round from now on. For a save
-- that carries a note, the caller says which version of the note the writer
-- started from (p_base_note_at = the round_note_at they last saw, NULL if
-- there was no note). If the stored note has been changed by someone since,
-- nothing is written and the stored note is returned with conflict = true, so
-- the app can show both texts and let the doctor decide.
--
-- Deliberately NOT a conflict:
--   * someone else only changed the orders (todos) — that caused false
--     "conflicting changes" alarms in the past;
--   * the stored note is empty — there is nothing to lose;
--   * the stored note already equals the text being saved.
--
-- SECURITY INVOKER: every statement inside runs with the caller's own access
-- rules (rounds_tenant / rounds_auth_scope). The function adds no privilege.
-- Author and time are still stamped by the trigger stamp_round_note.
--
-- Requires 20261112210000 (rounds.updated_at) and 20261113090000 (round_note).
-- Safe to apply before the app change is deployed: nothing calls it until then.
-- The app falls back to a plain upsert if this function is missing.
--
-- Rollback: DROP FUNCTION IF EXISTS public.save_round(text, date, text, jsonb, text, timestamptz);

CREATE OR REPLACE FUNCTION public.save_round(
  p_patient_ip_no text,
  p_date          date,
  p_note          text,
  p_todos         jsonb,
  p_round_note    text        DEFAULT NULL,   -- NULL = this save does not touch the note
  p_base_note_at  timestamptz DEFAULT NULL    -- round_note_at the writer started from; NULL = there was no note
) RETURNS TABLE (
  conflict       boolean,
  server_note    text,
  server_note_by text,
  server_note_at timestamptz
)
    LANGUAGE plpgsql SECURITY INVOKER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row public.rounds%ROWTYPE;
BEGIN
  -- Make sure the day's row exists (without a note), so the rest is one
  -- locked read-check-write. Two phones doing this at once cannot both insert.
  INSERT INTO public.rounds (patient_ip_no, hospital_id, date, note, todos)
  VALUES (p_patient_ip_no, public.get_my_hospital_id(), p_date, COALESCE(p_note, ''), COALESCE(p_todos, '[]'::jsonb))
  ON CONFLICT (patient_ip_no, date) DO NOTHING;

  SELECT * INTO v_row
  FROM public.rounds r
  WHERE r.patient_ip_no = p_patient_ip_no AND r.date = p_date
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'save_round: round for % on % is not accessible to this user', p_patient_ip_no, p_date
      USING ERRCODE = '42501';
  END IF;

  IF p_round_note IS NOT NULL
     AND v_row.round_note <> ''
     AND v_row.round_note IS DISTINCT FROM p_round_note
     AND v_row.round_note_at IS DISTINCT FROM p_base_note_at THEN
    -- Someone changed the note after this writer last saw it. Write nothing.
    RETURN QUERY SELECT true, v_row.round_note, v_row.round_note_by_name, v_row.round_note_at;
    RETURN;
  END IF;

  UPDATE public.rounds r
  SET note       = COALESCE(p_note, r.note),
      todos      = COALESCE(p_todos, r.todos),
      round_note = COALESCE(p_round_note, r.round_note)
  WHERE r.id = v_row.id
  RETURNING * INTO v_row;

  RETURN QUERY SELECT false, v_row.round_note, v_row.round_note_by_name, v_row.round_note_at;
END;
$$;

-- Supabase's default privileges grant EXECUTE to anon on every new function;
-- take that away explicitly (signed-out callers have no business here).
REVOKE ALL ON FUNCTION public.save_round(text, date, text, jsonb, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_round(text, date, text, jsonb, text, timestamptz) TO authenticated, service_role;
