-- Security hardening (2026-07-04 audit follow-up)
-- Applied to production 2026-07-04 via MCP apply_migration; this file mirrors
-- the recorded remote migration version 20260704092953.
--
-- Part 1: pin search_path on all functions flagged by the Supabase linter
-- (0011_function_search_path_mutable). 'public' — not '' — so existing
-- unqualified references inside trigger bodies keep resolving.
ALTER FUNCTION public.increment_patient_version() SET search_path = 'public';
ALTER FUNCTION public.set_updated_at() SET search_path = 'public';
ALTER FUNCTION public.validate_pac_flow() SET search_path = 'public';
ALTER FUNCTION public.get_my_hospital_id() SET search_path = 'public';
ALTER FUNCTION public.bump_round_version() SET search_path = 'public';
ALTER FUNCTION public.set_patient_hospital_id() SET search_path = 'public';
ALTER FUNCTION public.insert_audit_event(text, text, text, text) SET search_path = 'public';

-- Part 2: shrink the PostgREST RPC surface (linter 0028/0029).
-- Trigger functions never need caller EXECUTE (privilege is checked at
-- CREATE TRIGGER time, not when the trigger fires).
REVOKE EXECUTE ON FUNCTION public.auto_set_hospital_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_audit_modification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_hospital_id_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_patient_hospital_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_role_to_jwt() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_patient_version() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_pac_flow() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_round_version() FROM PUBLIC, anon, authenticated;

-- register_hospital is only invoked server-side by the register-hospital
-- Edge Function (service role); archive_discharged_patients is
-- superadmin-guarded internally and has no client call site.
REVOKE EXECUTE ON FUNCTION public.register_hospital(text, text, jsonb, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_discharged_patients(integer) FROM PUBLIC, anon, authenticated;

-- RLS helper functions: authenticated must keep EXECUTE (policies evaluate
-- them as the querying user), but anon has no business calling them.
-- The only anon-visible policy (status_incidents public read) uses qual=true,
-- so nothing anon-reachable references these.
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_superadmin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_hospital_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.insert_audit_event(text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_app_user_by_email(text) FROM anon;
