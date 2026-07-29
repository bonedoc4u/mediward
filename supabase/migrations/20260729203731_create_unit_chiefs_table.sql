-- Unit Chiefs (surgeon name per unit, auto-fills OT List) previously lived
-- only in browser localStorage — never synced to Supabase like every other
-- config table (ward_config, lab_type_config, hospital_config). Setting it
-- on one device never showed up on another, and clearing browser data wiped
-- it. Give it a real, per-hospital-scoped table, matching the corrected
-- ward_config pattern (fix_ward_config_unique_per_hospital / RLS superadmin
-- bypass) from day one rather than repeating the global-uniqueness mistake.
create table if not exists unit_chiefs (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id),
  unit text not null,
  chief_name text not null default '',
  created_at timestamptz not null default now(),
  constraint uq_unit_chief_per_hospital unique (hospital_id, unit)
);

alter table unit_chiefs enable row level security;

create policy unit_chiefs_select on unit_chiefs
  for select using (hospital_id = get_my_hospital_id());

create policy unit_chiefs_insert on unit_chiefs
  for insert with check (
    hospital_id = get_my_hospital_id()
    or exists (select 1 from app_users where app_users.id = auth.uid() and app_users.role = 'superadmin')
  );

create policy unit_chiefs_update on unit_chiefs
  for update using (
    hospital_id = get_my_hospital_id()
    or exists (select 1 from app_users where app_users.id = auth.uid() and app_users.role = 'superadmin')
  );

create policy unit_chiefs_delete on unit_chiefs
  for delete using (
    hospital_id = get_my_hospital_id()
    or exists (select 1 from app_users where app_users.id = auth.uid() and app_users.role = 'superadmin')
  );
