-- password_hash was dropped from app_users (20260626204206_drop_sha256_password_hash);
-- register_hospital still inserted it, breaking new hospital registration.
-- Identical to the previously deployed body except the app_users INSERT column list.
-- Applied to prod 2026-07-06 via MCP (recorded as version 20260706073451).
CREATE OR REPLACE FUNCTION public.register_hospital(p_hospital_name text, p_department text, p_units jsonb, p_admin_name text, p_admin_email text, p_auth_user_id uuid, p_invite_code text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_hospital_id UUID;
BEGIN
  -- Require invite code
  IF p_invite_code IS NULL OR trim(p_invite_code) = '' THEN
    RAISE EXCEPTION 'INVITE_REQUIRED: An invite code is required to register.';
  END IF;

  -- Validate invite: must exist, match college+dept, not used
  IF NOT EXISTS (
    SELECT 1 FROM public.invites
    WHERE code = upper(trim(p_invite_code))
      AND lower(college)     = lower(p_hospital_name)
      AND lower(department)  = lower(p_department)
      AND used = false
  ) THEN
    RAISE EXCEPTION 'INVALID_INVITE: Invite code is invalid, already used, or does not match the selected college and department.';
  END IF;

  -- Prevent duplicate (college, department) workspace
  IF EXISTS (
    SELECT 1 FROM public.hospitals
    WHERE lower(name) = lower(p_hospital_name)
      AND lower(department) = lower(p_department)
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_WORKSPACE: A workspace for this department already exists at this college.';
  END IF;

  -- Create hospital
  INSERT INTO public.hospitals (name, department, plan, status, trial_ends_at)
  VALUES (p_hospital_name, p_department, 'trial', 'pending', now() + INTERVAL '30 days')
  RETURNING id INTO v_hospital_id;

  -- Create hospital config
  INSERT INTO public.hospital_config (
    hospital_id, hospital_name, department, units,
    pre_op_module_name, procedure_list_name
  ) VALUES (
    v_hospital_id, p_hospital_name, p_department, p_units,
    'Pre-op Clearance', 'Procedure List'
  );

  -- Create admin user (password_hash column no longer exists - Supabase Auth owns passwords)
  INSERT INTO public.app_users (id, email, name, role, hospital_id, ward, unit)
  VALUES (p_auth_user_id, lower(p_admin_email), p_admin_name, 'admin', v_hospital_id, null, null)
  ON CONFLICT (email) DO UPDATE SET
    hospital_id = v_hospital_id,
    role        = 'admin',
    name        = p_admin_name;

  -- Mark invite as used
  UPDATE public.invites
  SET used = true, used_by_hospital_id = v_hospital_id
  WHERE code = upper(trim(p_invite_code));

  RETURN v_hospital_id;
END;
$function$;
