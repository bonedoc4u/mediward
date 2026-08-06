-- OT list RLS hardening (final-review follow-up). Brings ot_lists /
-- ot_list_entries in line with conventions this project already applies
-- elsewhere but the original migration missed:
--   1. is_superadmin() helper instead of an inline app_users subquery
--      (same check, but SECURITY DEFINER and not subject to app_users'
--      own RLS — see supabase/migrations/20260704112618_...).
--   2. Explicit `TO authenticated` on every policy, matching recent
--      migrations.
--   3. ot_list_entries' insert/update policies now also verify the
--      referenced ot_list_id actually belongs to a same-hospital ot_lists
--      row — otherwise a crafted insert could attach an entry to another
--      tenant's list (hospital_id on the entry itself still hides it from
--      that tenant, so this was never a read-side leak, but it's a
--      defense-in-depth gap worth closing).
--   4. The standard auto_set_hospital_id BEFORE INSERT trigger that 7
--      other tenant tables already have (defense-in-depth only — every
--      current insert path already passes hospital_id explicitly).
--   5. An index on ot_list_entries(hospital_id), since every RLS policy
--      filters on it.

DROP POLICY IF EXISTS ot_lists_select ON public.ot_lists;
CREATE POLICY ot_lists_select ON public.ot_lists
  FOR SELECT TO authenticated
  USING (hospital_id = get_my_hospital_id() OR is_superadmin());

DROP POLICY IF EXISTS ot_lists_insert ON public.ot_lists;
CREATE POLICY ot_lists_insert ON public.ot_lists
  FOR INSERT TO authenticated
  WITH CHECK (hospital_id = get_my_hospital_id() OR is_superadmin());

DROP POLICY IF EXISTS ot_lists_update ON public.ot_lists;
CREATE POLICY ot_lists_update ON public.ot_lists
  FOR UPDATE TO authenticated
  USING (hospital_id = get_my_hospital_id() OR is_superadmin());

DROP POLICY IF EXISTS ot_lists_delete ON public.ot_lists;
CREATE POLICY ot_lists_delete ON public.ot_lists
  FOR DELETE TO authenticated
  USING (hospital_id = get_my_hospital_id() OR is_superadmin());

DROP POLICY IF EXISTS ot_list_entries_select ON public.ot_list_entries;
CREATE POLICY ot_list_entries_select ON public.ot_list_entries
  FOR SELECT TO authenticated
  USING (hospital_id = get_my_hospital_id() OR is_superadmin());

DROP POLICY IF EXISTS ot_list_entries_insert ON public.ot_list_entries;
CREATE POLICY ot_list_entries_insert ON public.ot_list_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    (hospital_id = get_my_hospital_id() OR is_superadmin())
    AND EXISTS (
      SELECT 1 FROM public.ot_lists l
      WHERE l.id = ot_list_id AND l.hospital_id = ot_list_entries.hospital_id
    )
  );

DROP POLICY IF EXISTS ot_list_entries_update ON public.ot_list_entries;
CREATE POLICY ot_list_entries_update ON public.ot_list_entries
  FOR UPDATE TO authenticated
  USING (
    (hospital_id = get_my_hospital_id() OR is_superadmin())
    AND EXISTS (
      SELECT 1 FROM public.ot_lists l
      WHERE l.id = ot_list_id AND l.hospital_id = ot_list_entries.hospital_id
    )
  );

DROP POLICY IF EXISTS ot_list_entries_delete ON public.ot_list_entries;
CREATE POLICY ot_list_entries_delete ON public.ot_list_entries
  FOR DELETE TO authenticated
  USING (hospital_id = get_my_hospital_id() OR is_superadmin());

DROP TRIGGER IF EXISTS t_ot_lists_hid ON public.ot_lists;
CREATE TRIGGER t_ot_lists_hid
  BEFORE INSERT ON public.ot_lists
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_hospital_id();

DROP TRIGGER IF EXISTS t_ot_list_entries_hid ON public.ot_list_entries;
CREATE TRIGGER t_ot_list_entries_hid
  BEFORE INSERT ON public.ot_list_entries
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_hospital_id();

CREATE INDEX IF NOT EXISTS idx_ot_list_entries_hospital_id ON public.ot_list_entries(hospital_id);
