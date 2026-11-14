-- Migration: 20240801000000_fix_rls_and_helper_functions.sql
-- 1. Fix hospital_config UPDATE policy: was missing hospital_id scope, allowing
--    any admin to update another hospital's config row (PERMISSIVE OR-merge bug).
-- 2. Fix get_my_hospital_id(): narrow superadmin override to is_superadmin()
--    instead of is_admin() so regular admins cannot activate cross-tenant view.
-- 3. Fix hospital_config INSERT policy: was PUBLIC; restrict to authenticated.

-- Drop old policies
DROP POLICY IF EXISTS hospital_config_update ON public.hospital_config;
DROP POLICY IF EXISTS hospital_config_insert ON public.hospital_config;

-- Recreate with correct scoping
CREATE POLICY hospital_config_update ON public.hospital_config
  FOR UPDATE
  USING (id = public.get_my_hospital_id() AND public.is_admin());

CREATE POLICY hospital_config_insert ON public.hospital_config
  FOR INSERT
  WITH CHECK (public.is_superadmin());

-- Fix get_my_hospital_id to use is_superadmin instead of is_admin
CREATE OR REPLACE FUNCTION public.get_my_hospital_id()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  override_id UUID;
  user_hospital_id UUID;
BEGIN
  -- Only superadmins can activate cross-tenant viewing via session variable
  IF public.is_superadmin() THEN
    BEGIN
      override_id := current_setting('app.viewing_hospital_id')::UUID;
      IF override_id IS NOT NULL THEN RETURN override_id; END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  SELECT hospital_id INTO user_hospital_id
  FROM public.app_users
  WHERE id = auth.uid()
  LIMIT 1;
  RETURN user_hospital_id;
END;
$$;
