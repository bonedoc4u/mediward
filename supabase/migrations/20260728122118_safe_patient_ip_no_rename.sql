-- Safe patient IP-number correction.
--
-- ip_no is patients' primary key (globally unique, not per-hospital) and is
-- referenced by 9 clinical tables via patient_ip_no. All 9 FKs currently have
-- ON UPDATE NO ACTION, so a direct rename is rejected by Postgres the moment
-- a patient has any clinical data. Changing them to ON UPDATE CASCADE lets a
-- single UPDATE re-key every linked record atomically. ON DELETE CASCADE is
-- preserved unchanged on all 9 (existing delete behavior must not change).

alter table public.blood_transfusion drop constraint blood_transfusion_patient_ip_no_fkey;
alter table public.blood_transfusion add constraint blood_transfusion_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.consult_requests drop constraint consult_requests_patient_ip_no_fkey;
alter table public.consult_requests add constraint consult_requests_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.handovers drop constraint handovers_patient_ip_no_fkey;
alter table public.handovers add constraint handovers_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.imaging drop constraint imaging_patient_ip_no_fkey;
alter table public.imaging add constraint imaging_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.intake_output drop constraint intake_output_patient_ip_no_fkey;
alter table public.intake_output add constraint intake_output_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.labs drop constraint labs_patient_ip_no_fkey;
alter table public.labs add constraint labs_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.patient_vitals drop constraint patient_vitals_patient_ip_no_fkey;
alter table public.patient_vitals add constraint patient_vitals_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.rounds drop constraint rounds_patient_ip_no_fkey;
alter table public.rounds add constraint rounds_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.wound_care drop constraint wound_care_patient_ip_no_fkey;
alter table public.wound_care add constraint wound_care_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

-- Transactional rename: checks the caller belongs to the patient's hospital
-- (or is superadmin), checks the new number isn't already taken by ANY
-- patient (ip_no is globally unique, not per-hospital), then updates
-- patients.ip_no — the 9 FKs above cascade every linked record in the same
-- statement. Logged to the tamper-evident audit log.
--
-- NOTE: this original version had two bugs fixed in later migrations
-- (20260728161758, 20260728162527) — logging an invalid audit action that
-- silently produced zero audit trail, and no returned version (causing a
-- false concurrent-edit conflict on the next save). This file is kept
-- exactly as originally applied; do not "fix" it here — applied migrations
-- must stay immutable so replay history matches what actually ran.
create or replace function public.rename_patient_ip_no(p_old_ip_no text, p_new_ip_no text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient_hospital uuid;
  v_caller_hospital uuid;
  v_new_ip_no text := trim(p_new_ip_no);
begin
  if p_old_ip_no is null or trim(p_old_ip_no) = '' then
    raise exception 'Missing current IP number';
  end if;
  if v_new_ip_no is null or v_new_ip_no = '' then
    raise exception 'New IP number cannot be empty';
  end if;
  if p_old_ip_no = v_new_ip_no then
    return; -- no-op, nothing to change
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

  update public.patients set ip_no = v_new_ip_no where ip_no = p_old_ip_no;

  perform public.insert_audit_event(
    'RENAME_IP_NO', 'patient', v_new_ip_no,
    format('IP number changed from %s to %s', p_old_ip_no, v_new_ip_no)
  );
end;
$$;

grant execute on function public.rename_patient_ip_no(text, text) to authenticated;
