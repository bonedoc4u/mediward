# OT List Persistence — Design Spec

**Date:** 2026-08-06
**Status:** Approved by user, ready for implementation planning

## Context

`OTListManagement.tsx`'s OT list (which patients are assigned to Major/Minor/EOT,
in which category/table, in what order, plus per-entry fields like anesthesia,
C-arm, implants, remarks) currently lives purely in React component state
(`useState<OTPatient[]>([])`), with zero database persistence. The component is
conditionally rendered in `App.tsx`'s view switch, so it fully unmounts the
moment the user navigates elsewhere — any manually-added, reordered, or edited
entries are lost. Only patients whose `plannedDos` matches one of the current
tab's three dates get automatically re-added by an existing effect; anything
manually assigned (via the pending-panel drag/tap, added this session) simply
disappears on remount. The user hit this directly: manually assigned patients
to an OT list, navigated to the Dashboard, came back, and the list had reverted
to just the auto-populated entries.

## Goals

- OT list entries (who's assigned, to which category, in what order, with what
  per-entry fields) survive navigating away and back, app restarts, and
  different devices/sessions for the same hospital.
- Autosave: every add, remove, reorder, or field edit persists immediately in
  the background — no explicit "Save" button, no "did I remember to save"
  risk (matching how the rest of this app already behaves).
- Patient fields (name, age, ward, diagnosis, etc.) are snapshotted at the
  moment a patient is added to a list — matching today's behavior and how a
  real OT list works clinically (a record of who was planned for that day,
  not a live-updating view).
- Past OT lists remain viewable indefinitely by date — a real clinical record,
  not just a forward-planning scratchpad.
- Every new table gets RLS policies scoped to `hospital_id`, per this
  project's non-negotiable rule. The unique constraint on `ot_lists` must be
  scoped per-hospital from day one — this project has hit the
  "forgot to scope a unique constraint per-hospital" bug three times already
  (`ward_config`, `lab_type_config`, `unit_chiefs`), so this is a known trap
  to avoid repeating a fourth time.
- Concurrent edits from different staff to the same OT list are handled
  safely: two people adding *different* patients never conflicts; two people
  editing the *same* entry's fields at the same time is detected (optimistic
  locking), not silently overwritten.

## Non-goals

- **Offline support.** This app has a real offline write-ahead queue for round
  notes (`services/syncQueue.ts`); wiring the OT list into that same mechanism
  is meaningfully more scope than this feature needs right now. OT list edits
  made while offline will simply fail to save (with a visible error) rather
  than queue for later — a known, accepted gap, not silently swallowed.
- **Live-updating patient fields.** Snapshotted at add-time, not re-synced if
  the underlying patient record changes later (see Goals — this is
  deliberate, not an oversight).
- **Full conflict-resolution UI.** No diff-and-resolve modal like patient
  charts/round notes have. An OT list entry conflict is lower-stakes than a
  clinical chart edit; a simple "this was just updated — refreshed" notice is
  enough (see Error Handling).
- **Realtime cross-device sync while a list is open.** Two people can safely
  edit the same list without stepping on each other (see Goals), but one
  person's change doesn't have to appear live on another person's screen
  without a refresh — that's a nice-to-have for later, not required now.

## Architecture

Two new tables, matching this project's existing normalized pattern (like
`labs`/`imaging`/`rounds`) rather than one JSONB blob per list — the list-level
fields (surgeon, unit, time) and per-patient fields are genuinely different
things that change independently, so cramming them together would mean either
duplicating the surgeon's name on every patient row, or losing the list's own
identity inside a blob.

**`ot_lists`** — one row per (hospital, unit, OT type, date) combination:
```sql
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
```

**`ot_list_entries`** — one row per patient assigned to a list:
```sql
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
```

`hospital_id` is denormalized onto `ot_list_entries` too (not just reachable
via the `ot_list_id` FK) so RLS policies can check it directly on every row
without a join — a standard, sound Postgres RLS pattern also used elsewhere
in this schema.

Both tables get RLS scoped to `hospital_id`, modeled exactly on
`unit_chiefs`' corrected pattern (select/insert/update/delete policies, with
a superadmin bypass):
```sql
alter table ot_lists enable row level security;
alter table ot_list_entries enable row level security;

create policy ot_lists_select on ot_lists
  for select using (hospital_id = get_my_hospital_id());
create policy ot_lists_insert on ot_lists
  for insert with check (
    hospital_id = get_my_hospital_id()
    or exists (select 1 from app_users where app_users.id = auth.uid() and app_users.role = 'superadmin')
  );
-- update/delete policies follow the same shape; ot_list_entries gets the
-- identical four policies.
```

Both tables get a `version` column + `BEFORE UPDATE` trigger bumping it,
matching `rounds`' existing optimistic-lock pattern exactly (one trigger
function, reused for both tables):
```sql
create or replace function bump_ot_list_version() returns trigger
language plpgsql as $$
begin
  new.version = coalesce(old.version, 0) + 1;
  return new;
end;
$$;

create trigger ot_lists_version_bump before update on ot_lists
  for each row execute function bump_ot_list_version();
create trigger ot_list_entries_version_bump before update on ot_list_entries
  for each row execute function bump_ot_list_version();
```

Reordering (updating `sequence` on potentially many rows when a drag
completes) deliberately does **not** check `version` — it's a single-column
update that never touches another edit's field values, so the worst case of
two simultaneous reorders is a temporarily-odd order, not lost data. Actual
field edits (anesthesia, implants, remarks, category, or a delete) **do**
check `version`, since those can genuinely conflict with someone else's edit
to the same entry.

## Components

- **`services/otListService.ts`** (new) — typed Supabase client helpers,
  matching this project's established services-layer pattern (not inline
  queries in the component):
  - `fetchOTList(hospitalId, unit, otType, listDate): Promise<{ list: OTListMeta | null; entries: OTPatient[] }>`
  - `upsertOTListMeta(hospitalId, unit, otType, listDate, meta): Promise<OTListMeta>` — creates the `ot_lists` row if it doesn't exist yet, or updates it.
  - `insertOTListEntry(otListId, hospitalId, entry): Promise<OTPatient>` — the DB assigns the real `id` (not client-generated); the client uses a temporary local id for the optimistic render, then reconciles with the real one once the insert response returns.
  - `updateOTListEntry(entryId, version, changes): Promise<OTPatient>` — throws a distinguishable conflict error when the `WHERE version = $version` update affects 0 rows.
  - `deleteOTListEntry(entryId): Promise<void>`
  - `reorderOTListEntries(updates: Array<{ id, sequence, category }>): Promise<void>` — batch update, no version check (see Architecture).
- **`utils/otListTypes.ts`** — `OTPatient` gains a `version: number` field (client-side tracking for the optimistic-lock check on the next edit) and an `otListId: string` field (which list this entry belongs to). A small `OTListMeta` interface (`id`, `surgeon`, `surgeonUnit`, `otTime`, `version`) is added alongside the existing types.
- **`components/OTListManagement.tsx`** — the load/save wiring described in Data Flow below; the auto-populate effect changes from "push into local state" to "persist via `insertOTListEntry`, then update local state from the real response."

## Data Flow

1. On mount, and whenever the unit/OT type/date changes (tab switch or manual
   date edit), call `fetchOTList` for that exact combination. If no `ot_lists`
   row exists yet, fall back to today's auto-fill-from-`unit_chiefs` behavior
   for `surgeon`/`surgeonUnit`/`otTime`, and start with an empty entry list.
2. Every mutation persists immediately:
   - **Add** (drag, tap-to-add, or the auto-populate effect finding a new
     eligible patient): if this is the first entry for this
     (unit, type, date), `upsertOTListMeta` first to create the `ot_lists`
     row, then `insertOTListEntry`. Local state updates optimistically with a
     temporary id, then reconciles with the real one.
   - **Reorder**: `reorderOTListEntries` with the affected rows' new
     sequence/category.
   - **Field edit** (anesthesia, implants, remarks, category change, manual
     row add/edit): `updateOTListEntry` with the entry's current known
     `version`.
   - **Remove**: `deleteOTListEntry`.
   - Editing `surgeon`/`surgeonUnit`/`otTime` calls `upsertOTListMeta`.
3. Any failed write rolls back the optimistic local update and shows a plain
   error message (this app's existing standard for async action failures).

## Error Handling

- **Load failure** (network error fetching a list): show this project's
  existing query-error pattern; the page shouldn't silently show an empty
  list and let someone think there are genuinely no assigned patients yet.
- **Save failure, network-level**: roll back the optimistic update, show a
  plain error.
- **Save failure, optimistic-lock conflict** (someone else edited the same
  entry first): re-fetch that entry, show a brief "this was just updated —
  refreshed" notice, and let the user re-apply their edit if it still
  applies. No diff modal.
- **Offline**: writes simply fail visibly (see Non-goals) rather than
  queuing silently.

## Testing

- `services/otListService.ts`'s functions get unit tests with a mocked
  Supabase client, matching this project's established service-test pattern
  — including a test that a zero-rows-affected update (simulating a version
  conflict) is surfaced as a distinguishable error, not silently ignored.
- The auto-populate effect's "persist instead of just push to local state"
  behavior gets a test confirming it doesn't insert a duplicate row for a
  patient already present in the loaded list.
- RLS policies are not unit-testable in Vitest — consistent with how the
  rest of this project's RLS work is verified (manual/Supabase-side, not
  JS-side).
