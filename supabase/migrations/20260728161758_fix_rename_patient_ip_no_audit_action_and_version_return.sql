-- Critical fix (code review finding): the function logged action
-- 'RENAME_IP_NO', which violates audit_log's chk_audit_action CHECK
-- constraint (fixed enum: CREATE/UPDATE/DELETE/LOGIN/LOGOUT/VIEW/EXPORT).
-- insert_audit_event swallows ALL exceptions, so this failure was
-- completely silent — every rename committed with zero audit trail.
-- Fixed to log 'UPDATE' (matching the existing enum), with specifics in
-- the details text. Also now returns the post-rename `version` (bumped
-- by the increment_patient_version trigger) so the client can refresh
-- its cached optimistic-lock value instead of misreporting the next save
-- on this patient as a conflict with another user.
drop function if exists public.rename_patient_ip_no(text, text);

create function public.rename_patient_ip_no(p_old_ip_no text, p_new_ip_no text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient_hospital uuid;
  v_caller_hospital uuid;
  v_new_ip_no text := trim(p_new_ip_no);
  v_version integer;
begin
  if p_old_ip_no is null or trim(p_old_ip_no) = '' then
    raise exception 'Missing current IP number';
  end if;
  if v_new_ip_no is null or v_new_ip_no = '' then
    raise exception 'New IP number cannot be empty';
  end if;
  if p_old_ip_no = v_new_ip_no then
    select version into v_version from public.patients where ip_no = p_old_ip_no;
    return v_version; -- no-op, nothing to change
  end if;

  select hospital_id into v_patient_hospital from public.patients where ip_no = p_old_ip_no;
  if v_patient_hospital is null then
    raise exception 'Patient with IP number % not found', p_old_ip_no;
  end if;

  v_caller_hospital := public.get_my_hospital_id();
  if v_caller_hospital is distinct from v_patient_hospital and not public.is_superadmin() then
    raise exception 'You do not have permission to modify this patient';
  end if;

  if exists (select 1 from public.patients where ip_no = v_new_ip_no) then
    raise exception 'IP number % is already in use', v_new_ip_no;
  end if;

  update public.patients set ip_no = v_new_ip_no where ip_no = p_old_ip_no
    returning version into v_version;

  perform public.insert_audit_event(
    'UPDATE', 'patient', v_new_ip_no,
    format('IP number changed from %s to %s', p_old_ip_no, v_new_ip_no)
  );

  return v_version;
end;
$$;

grant execute on function public.rename_patient_ip_no(text, text) to authenticated;
revoke execute on function public.rename_patient_ip_no(text, text) from public;
revoke execute on function public.rename_patient_ip_no(text, text) from anon;
