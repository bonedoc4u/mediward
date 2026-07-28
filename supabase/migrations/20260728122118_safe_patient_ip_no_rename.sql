-- Safe patient IP-number correction.
--
-- ip_no is patients' primary key (globally unique, not per-hospital) and is
-- referenced by 9 clinical tables via patient_ip_no. All 9 FKs currently have
-- ON UPDATE NO ACTION, so a direct rename is rejected by Postgres the moment
-- a patient has any clinical data. Changing them to ON UPDATE CASCADE lets a
-- single UPDATE re-key every linked record atomically. ON DELETE CASCADE is
-- preserved unchanged on all 9 (existing delete behavior must not change).

alter table public.blood_transfusion drop constraint if exists blood_transfusion_patient_ip_no_fkey;
alter table public.blood_transfusion add constraint blood_transfusion_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.consult_requests drop constraint if exists consult_requests_patient_ip_no_fkey;
alter table public.consult_requests add constraint consult_requests_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.handovers drop constraint if exists handovers_patient_ip_no_fkey;
alter table public.handovers add constraint handovers_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.imaging drop constraint if exists imaging_patient_ip_no_fkey;
alter table public.imaging add constraint imaging_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.intake_output drop constraint if exists intake_output_patient_ip_no_fkey;
alter table public.intake_output add constraint intake_output_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.labs drop constraint if exists labs_patient_ip_no_fkey;
alter table public.labs add constraint labs_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.patient_vitals drop constraint if exists patient_vitals_patient_ip_no_fkey;
alter table public.patient_vitals add constraint patient_vitals_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.rounds drop constraint if exists rounds_patient_ip_no_fkey;
alter table public.rounds add constraint rounds_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.wound_care drop constraint if exists wound_care_patient_ip_no_fkey;
alter table public.wound_care add constraint wound_care_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

-- Transactional rename: checks the caller belongs to the patient's hospital
-- (or is superadmin), checks the new number isn't already taken by ANY
-- patient (ip_no is globally unique, not per-hospital), then updates
-- patients.ip_no — the FKs above (plus 3 more added in a follow-up migration)
-- cascade every linked record in the same statement.
--
-- Logs 'UPDATE' (not a custom action string) to the tamper-evident audit
-- log, because audit_log has a CHECK constraint on a fixed action enum
-- (CREATE/UPDATE/DELETE/LOGIN/LOGOUT/VIEW/EXPORT) and insert_audit_event
-- silently swallows any exception — an invalid action string would make
-- every rename commit with ZERO audit trail with no visible error. The
-- specific "what changed" detail lives in the details text instead.
--
-- Returns the patient's new `version` (bumped by the existing
-- increment_patient_version trigger) so the client can update its cached
-- optimistic-lock value — without this, the client's next save on the
-- same patient would compare against a stale version and be misreported
-- as a conflict with another user.
create or replace function public.rename_patient_ip_no(p_old_ip_no text, p_new_ip_no text)
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

  -- The EXISTS check above handles the common case; this catch covers the
  -- rare race where two renames to the same new number commit concurrently
  -- (patients_pkey is the real arbiter either way — this only makes the
  -- resulting error message friendly instead of a raw constraint-violation string).
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
