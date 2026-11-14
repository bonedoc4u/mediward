-- 20261113090000_rounds_round_note.sql
--
-- FEATURE (audit 2026-11-12, finding UX-01): a real round note.
--
-- Until now rounds.note was filled by the app with a copy of the diagnosis;
-- no screen let a doctor write the day's note. This adds a separate field
-- for it, plus who wrote it and when.
--
-- Why new columns instead of reusing rounds.note:
--   * every existing row holds a diagnosis copy in `note`, so the two could
--     not be told apart;
--   * phones still running the old app keep writing the diagnosis into `note`.
--     They never send `round_note`, and an upsert only changes the columns it
--     sends, so an old phone cannot wipe a note written on a new one.
--
-- Author and time are stamped by the database (trigger below), not taken from
-- the client. A round note is part of the clinical record: the app must not
-- be able to write "noted by Dr X" on someone else's behalf or back-date it.
--
-- ADDITIVE AND SAFE TO APPLY BEFORE THE APP CHANGE IS DEPLOYED: nothing reads
-- the new columns until the new app version does. The app change MUST NOT go
-- live before this is applied — its patient query selects these columns.
--
-- Access rules: unchanged. rounds_tenant / rounds_auth_scope already limit
-- every row to the caller's hospital; new columns inherit that.
--
-- Rollback (loses any round notes written since):
--   DROP TRIGGER IF EXISTS t_rounds_stamp_round_note ON public.rounds;
--   DROP FUNCTION IF EXISTS public.stamp_round_note();
--   ALTER TABLE public.rounds
--     DROP COLUMN IF EXISTS round_note, DROP COLUMN IF EXISTS round_note_by,
--     DROP COLUMN IF EXISTS round_note_by_name, DROP COLUMN IF EXISTS round_note_at;

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS round_note         text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS round_note_by      uuid,
  ADD COLUMN IF NOT EXISTS round_note_by_name text,
  ADD COLUMN IF NOT EXISTS round_note_at      timestamptz;

ALTER TABLE public.rounds DROP CONSTRAINT IF EXISTS chk_round_note_len;
ALTER TABLE public.rounds ADD  CONSTRAINT chk_round_note_len CHECK (char_length(round_note) <= 4000);

CREATE OR REPLACE FUNCTION public.stamp_round_note() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_changed boolean;
BEGIN
  NEW.round_note := COALESCE(NEW.round_note, '');

  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.round_note <> '';
  ELSE
    v_changed := NEW.round_note IS DISTINCT FROM OLD.round_note;
  END IF;

  IF v_changed THEN
    -- The note text changed: record who did it and when, from the session.
    NEW.round_note_by      := auth.uid();
    NEW.round_note_by_name := (SELECT name FROM public.app_users WHERE id = auth.uid());
    NEW.round_note_at      := now();
  ELSIF TG_OP = 'UPDATE' THEN
    -- Text unchanged (for example only the orders changed): keep the stamp.
    -- Whatever the client sent for these three columns is ignored.
    NEW.round_note_by      := OLD.round_note_by;
    NEW.round_note_by_name := OLD.round_note_by_name;
    NEW.round_note_at      := OLD.round_note_at;
  ELSE
    -- Insert without a note: there is nothing to attribute.
    NEW.round_note_by      := NULL;
    NEW.round_note_by_name := NULL;
    NEW.round_note_at      := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_round_note() FROM PUBLIC;
GRANT ALL ON FUNCTION public.stamp_round_note() TO service_role;

DROP TRIGGER IF EXISTS t_rounds_stamp_round_note ON public.rounds;
CREATE TRIGGER t_rounds_stamp_round_note
  BEFORE INSERT OR UPDATE ON public.rounds
  FOR EACH ROW EXECUTE FUNCTION public.stamp_round_note();
