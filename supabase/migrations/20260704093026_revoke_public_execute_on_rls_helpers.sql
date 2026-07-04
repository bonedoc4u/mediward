-- Follow-up to security_search_path_and_rpc_execute_hardening: these helpers
-- still had a PUBLIC grant (=X in proacl), which anon inherits — revoking
-- only anon was not enough. authenticated and service_role keep their
-- explicit grants, so RLS policy evaluation is unaffected.
-- Applied to production 2026-07-04; mirrors remote version 20260704093026.
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_superadmin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_hospital_id() FROM PUBLIC;
