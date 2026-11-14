-- P1-6: Revoke anon/public EXECUTE on get_app_user_by_email.
-- The app only calls this after a successful Supabase Auth login (authenticated JWT),
-- so anon access was never needed and enables email enumeration without rate limiting.
REVOKE EXECUTE ON FUNCTION public.get_app_user_by_email(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_app_user_by_email(TEXT) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_app_user_by_email(TEXT) TO service_role;

-- Also ensure lookup_user_for_login (unused, defined in supabase_rls_complete_migration.sql)
-- does NOT grant anon access if that migration is ever re-run.
-- Safe to run even if the function doesn't exist yet.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'lookup_user_for_login'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.lookup_user_for_login(TEXT) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.lookup_user_for_login(TEXT) FROM anon;
  END IF;
END $$;
