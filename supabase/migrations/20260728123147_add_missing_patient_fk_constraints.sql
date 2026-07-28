-- Previously-missing FKs discovered while building the safe IP-number rename
-- feature: these 3 tables stored patient_ip_no with no FK at all (linked to
-- patients only by app convention). Zero orphaned rows confirmed in all three
-- before adding. Same cascade behavior as the other 9 patient_ip_no FKs.
--
-- Real behavior change beyond the rename feature: deleting a patient now
-- cascade-deletes their nursing notes, medication administrations, and
-- prescriptions too, instead of leaving them orphaned as it did before.
alter table public.nursing_notes drop constraint if exists nursing_notes_patient_ip_no_fkey;
alter table public.nursing_notes add constraint nursing_notes_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.med_administrations drop constraint if exists med_administrations_patient_ip_no_fkey;
alter table public.med_administrations add constraint med_administrations_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;

alter table public.medications_prescribed drop constraint if exists medications_prescribed_patient_ip_no_fkey;
alter table public.medications_prescribed add constraint medications_prescribed_patient_ip_no_fkey
  foreign key (patient_ip_no) references public.patients(ip_no) on update cascade on delete cascade;
