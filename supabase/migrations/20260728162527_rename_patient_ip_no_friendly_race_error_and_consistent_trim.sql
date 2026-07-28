-- Minor hardening from code review: trim p_old_ip_no consistently (it was
-- trimmed only for the emptiness check, then used raw everywhere else —
-- harmless in practice but an asymmetry vs. p_new_ip_no's handling), and
-- catch unique_violation around the UPDATE so a rare concurrent-rename race
-- (two renames to the same new number committing at once) surfaces the same
-- friendly "already in use" message instead of a raw Postgres constraint
-- error. patients_pkey remains the real arbiter either way — no behavior
-- change, just a nicer error message on an already-rare edge case.
drop function if exists public.rename_patient_ip_no(text, text);

create function public.rename_patient_ip_no(p_old_ip_no text, p_new_ip_no text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_ip_no text := trim(p_old_ip_no);
  v_new_ip_no text := trim(p_new_ip_no);
  v_patient_hospital uuid;
  v_caller_hospital uuid;
  v_version integer;
begin
  if v_old_ip_no is null or v_old_ip_no = '' then
    raise exception 'Missing current IP number';
  end if;
  if v_new_ip_no is null or v_new_ip_no = '' then
    raise exception 'New IP number cannot be empty';
  end if;
  if v_old_ip_no = v_new_ip_no then
    select version into v_version from public.patients where ip_no = v_old_ip_no;
    return v_version; -- no-op, nothing to change
  end if;

  select hospital_id into v_patient_hospital from public.patients where ip_no = v_old_ip_no;
  if v_patient_hospital is null then
    raise exception 'Patient with IP number % not found', v_old_ip_no;
  end if;

  v_caller_hospital := public.get_my_hospital_id();
  if v_caller_hospital is distinct from v_patient_hospital and not public.is_superadmin() then
    raise exception 'You do not have permission to modify this patient';
  end if;

  if exists (select 1 from public.patients where ip_no = v_new_ip_no) then
    raise exception 'IP number % is already in use', v_new_ip_no;
  end if;

  begin
    update public.patients set ip_no = v_new_ip_no where ip_no = v_old_ip_no
      returning version into v_version;
  exception when unique_violation then
    raise exception 'IP number % is already in use', v_new_ip_no;
  end;

  perform public.insert_audit_event(
    'UPDATE', 'patient', v_new_ip_no,
    format('IP number changed from %s to %s', v_old_ip_no, v_new_ip_no)
  );

  return v_version;
end;
$$;

grant execute on function public.rename_patient_ip_no(text, text) to authenticated;
revoke execute on function public.rename_patient_ip_no(text, text) from public;
revoke execute on function public.rename_patient_ip_no(text, text) from anon;
