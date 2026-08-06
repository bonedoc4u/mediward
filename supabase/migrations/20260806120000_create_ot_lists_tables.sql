-- OT List persistence: the OT list (who's assigned to Major/Minor/EOT, in
-- what order, with what per-entry fields like anesthesia/C-arm/implants)
-- previously lived only in React component state -- lost the moment the
-- user navigated away and back. Two tables, following the corrected
-- per-hospital-unique pattern from unit_chiefs (this exact "forgot to scope
-- the unique constraint per hospital" bug has hit this project three times
-- already: ward_config, lab_type_config, unit_chiefs) and the optimistic-lock
-- pattern from rounds_optimistic_lock.

create table if not exists ot_lists (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id),
  unit text not null,
  ot_type text not null check (ot_type in ('Major', 'Minor', 'EOT')),
  list_date date not null,
  surgeon text not null default '',
  surgeon_unit text not null default '',
  ot_time text not null default '8.00AM',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  constraint uq_ot_list_per_hospital_unit_type_date
    unique (hospital_id, unit, ot_type, list_date)
);

create table if not exists ot_list_entries (
  id uuid primary key default gen_random_uuid(),
  ot_list_id uuid not null references ot_lists(id) on delete cascade,
  hospital_id uuid not null references hospitals(id),
  sequence integer not null,
  category text not null,
  patient_ip_no text not null,
  name text not null,
  age text not null,
  gender text not null,
  ward text not null,
  unit text not null,
  diagnosis text not null,
  procedure text not null default '',
  side text not null default '',
  anesthesia text not null default '',
  c_arm text not null default 'No',
  implants text not null default '',
  remarks text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_ot_list_entries_ot_list_id on ot_list_entries(ot_list_id);

alter table ot_lists enable row level security;
alter table ot_list_entries enable row level security;

create policy ot_lists_select on ot_lists
  for select using (
    hospital_id = get_my_hospital_id()
    or exists (select 1 from app_users where app_users.id = auth.uid() and app_users.role = 'superadmin')
  );
create policy ot_lists_insert on ot_lists
  for insert with check (
    hospital_id = get_my_hospital_id()
    or exists (select 1 from app_users where app_users.id = auth.uid() and app_users.role = 'superadmin')
  );
create policy ot_lists_update on ot_lists
  for update using (
    hospital_id = get_my_hospital_id()
    or exists (select 1 from app_users where app_users.id = auth.uid() and app_users.role = 'superadmin')
  );
create policy ot_lists_delete on ot_lists
  for delete using (
    hospital_id = get_my_hospital_id()
    or exists (select 1 from app_users where app_users.id = auth.uid() and app_users.role = 'superadmin')
  );

create policy ot_list_entries_select on ot_list_entries
  for select using (
    hospital_id = get_my_hospital_id()
    or exists (select 1 from app_users where app_users.id = auth.uid() and app_users.role = 'superadmin')
  );
create policy ot_list_entries_insert on ot_list_entries
  for insert with check (
    hospital_id = get_my_hospital_id()
    or exists (select 1 from app_users where app_users.id = auth.uid() and app_users.role = 'superadmin')
  );
create policy ot_list_entries_update on ot_list_entries
  for update using (
    hospital_id = get_my_hospital_id()
    or exists (select 1 from app_users where app_users.id = auth.uid() and app_users.role = 'superadmin')
  );
create policy ot_list_entries_delete on ot_list_entries
  for delete using (
    hospital_id = get_my_hospital_id()
    or exists (select 1 from app_users where app_users.id = auth.uid() and app_users.role = 'superadmin')
  );

create or replace function bump_ot_list_version() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.version = coalesce(old.version, 0) + 1;
  return new;
end;
$$;

drop trigger if exists ot_lists_version_bump on ot_lists;
create trigger ot_lists_version_bump before update on ot_lists
  for each row execute function bump_ot_list_version();
revoke execute on function bump_ot_list_version() from public, anon, authenticated;

drop trigger if exists ot_list_entries_version_bump on ot_list_entries;
create trigger ot_list_entries_version_bump before update on ot_list_entries
  for each row execute function bump_ot_list_version();
