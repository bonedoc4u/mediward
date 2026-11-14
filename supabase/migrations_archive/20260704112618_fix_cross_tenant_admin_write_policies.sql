-- Cross-tenant RLS fix (2026-07-04 audit finding).
-- Applied to production 2026-07-04; mirrors remote version 20260704112618.
--
-- dept_templates_write and medication_config_write were FOR ALL with
-- USING/WITH CHECK of bare is_admin(), which has no hospital scope:
-- any hospital's admin could read AND write every other hospital's
-- department templates and medication config. Since permissive policies
-- OR together, the tenant-scoped SELECT policies could not contain it.

DROP POLICY IF EXISTS medication_config_write ON public.medication_config;
CREATE POLICY medication_config_write ON public.medication_config
  FOR ALL TO authenticated
  USING ((is_admin() AND hospital_id = get_my_hospital_id()) OR is_superadmin())
  WITH CHECK ((is_admin() AND hospital_id = get_my_hospital_id()) OR is_superadmin());

DROP POLICY IF EXISTS dept_templates_write ON public.department_templates;
CREATE POLICY dept_templates_write ON public.department_templates
  FOR ALL TO authenticated
  USING ((is_admin() AND hospital_id = get_my_hospital_id()) OR is_superadmin())
  WITH CHECK ((is_admin() AND hospital_id = get_my_hospital_id()) OR is_superadmin());

-- Both tables were also missing the standard auto_set_hospital_id BEFORE
-- INSERT trigger that 7 other tenant tables have. hospital_id is NOT NULL
-- with no default, and createMedication() inserts without it — so the
-- "Add medication" flow failed with a NOT NULL violation (only the seeder,
-- which passes hospital_id explicitly, worked). The trigger only fills
-- hospital_id when NULL, so explicit values (seeder, superadmin) still win.
DROP TRIGGER IF EXISTS t_medication_config_hid ON public.medication_config;
CREATE TRIGGER t_medication_config_hid
  BEFORE INSERT ON public.medication_config
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_hospital_id();

DROP TRIGGER IF EXISTS t_dept_templates_hid ON public.department_templates;
CREATE TRIGGER t_dept_templates_hid
  BEFORE INSERT ON public.department_templates
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_hospital_id();
