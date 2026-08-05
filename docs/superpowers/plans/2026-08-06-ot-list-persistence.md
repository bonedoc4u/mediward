# OT List Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the OT list (who's assigned to Major/Minor/EOT, in what order, with what per-entry fields) real database persistence, so it survives navigating away and back, app restarts, and different sessions.

**Architecture:** Two new Postgres tables (`ot_lists` for list-level metadata, `ot_list_entries` for per-patient assignments), a new `services/otListService.ts` typed client layer, and autosave wiring into `components/OTListManagement.tsx` so every add/remove/reorder/edit persists immediately with an optimistic local update.

**Tech Stack:** Supabase (Postgres, RLS), TypeScript strict, React 19, Vitest with a mocked Supabase client.

## Global Constraints

- TypeScript strict mode; `pnpm tsc --noEmit` must pass after every task.
- `pnpm lint` (`eslint . --max-warnings 0`) must pass after every task.
- pnpm only — never `npm`/`yarn`.
- Every new table gets RLS policies scoped to `hospital_id` (this project's non-negotiable rule) — no exceptions, no "add it later."
- The `ot_lists` unique constraint MUST be scoped per-hospital (`hospital_id` in the constraint) — this exact bug (a unique constraint missing `hospital_id`) has hit this project three times already (`ward_config`, `lab_type_config`, `unit_chiefs`).
- Commit convention: one logical change per commit, message like `feat(ot-list): add otListService with fetch/insert/update/delete/reorder`.
- Non-goals (do not build these, per the approved spec): offline queueing, live-updating patient fields (still snapshot at add-time), a full diff-and-resolve conflict UI, realtime cross-device sync while a list is open.

---

### Task 1: Database migration (tables, RLS, optimistic-lock triggers)

**Files:**
- Create: `supabase/migrations/20260806120000_create_ot_lists_tables.sql`

**Interfaces:**
- Produces: the `ot_lists` and `ot_list_entries` tables that every later task's service layer reads/writes.

**This task requires your own direct action on your live Supabase project — an agent cannot apply a migration to your database without your Supabase credentials/CLI access.** The file gets written and committed to the repo either way; actually running it against your database is a step only you can do (see Step 3).

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260806120000_create_ot_lists_tables.sql`:

```sql
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
  for select using (hospital_id = get_my_hospital_id());
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
  for select using (hospital_id = get_my_hospital_id());
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
language plpgsql as $$
begin
  new.version = coalesce(old.version, 0) + 1;
  return new;
end;
$$;

drop trigger if exists ot_lists_version_bump on ot_lists;
create trigger ot_lists_version_bump before update on ot_lists
  for each row execute function bump_ot_list_version();

drop trigger if exists ot_list_entries_version_bump on ot_list_entries;
create trigger ot_list_entries_version_bump before update on ot_list_entries
  for each row execute function bump_ot_list_version();
```

- [ ] **Step 2: Commit the migration file**

```bash
git add supabase/migrations/20260806120000_create_ot_lists_tables.sql
git commit -m "feat(db): add ot_lists and ot_list_entries tables with RLS and optimistic locking"
```

- [ ] **Step 3: Apply the migration to your Supabase project (you do this, not an agent)**

If you have the Supabase CLI set up (per this project's `RUNBOOK.md`):
```bash
supabase db push --project-ref $YOUR_PROJECT_REF --password "$YOUR_DB_PASSWORD"
```
If you don't have the CLI configured, open your Supabase project's dashboard → SQL Editor → paste the full contents of the migration file above → Run. Either way, confirm it succeeds with no errors before moving to Task 2 — later tasks' code won't work against a database that doesn't have these tables yet.

---

### Task 2: Add `otListId`/`version` to `OTPatient`, and the new `OTListMeta` type

**Files:**
- Modify: `utils/otListTypes.ts`
- Test: `__tests__/otListTypes.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `OTPatient` gains `otListId?: string` and `version?: number` (both optional — matching how `Patient.version?: number` already works in this codebase, so a patient/entry that hasn't round-tripped through the database yet just omits them, and every existing `OTPatient`-constructing call site in this codebase stays valid without changes). `OTListMeta` interface: `{ id: string; surgeon: string; surgeonUnit: string; otTime: string; version: number }` — Task 3's service layer and Task 4's component wiring both consume this.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/otListTypes.test.ts` (append after the existing `describe` blocks):

```ts
describe('OTPatient optional persistence fields', () => {
  it('allows constructing an OTPatient without otListId/version (not-yet-persisted case)', () => {
    const entry: OTPatient = {
      id: 'temp-1', sequence: 1, ipNo: 'IP001', name: 'Ravi Kumar', age: '52',
      gender: 'M', ward: '22', unit: 'OR1', diagnosis: 'Fracture femur',
      procedure: '', side: '', anesthesia: '', cArm: 'No', implants: '',
      remarks: '', category: 'TABLE 1', otType: 'Major',
    };
    expect(entry.otListId).toBeUndefined();
    expect(entry.version).toBeUndefined();
  });

  it('allows constructing an OTPatient with otListId/version set (persisted case)', () => {
    const entry: OTPatient = {
      id: 'real-uuid-1', otListId: 'list-uuid-1', version: 1,
      sequence: 1, ipNo: 'IP001', name: 'Ravi Kumar', age: '52',
      gender: 'M', ward: '22', unit: 'OR1', diagnosis: 'Fracture femur',
      procedure: '', side: '', anesthesia: '', cArm: 'No', implants: '',
      remarks: '', category: 'TABLE 1', otType: 'Major',
    };
    expect(entry.otListId).toBe('list-uuid-1');
    expect(entry.version).toBe(1);
  });
});
```

You'll also need `OTPatient` imported in the test file — it already imports from `../utils/otListTypes`; add `OTPatient` to that import list.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run __tests__/otListTypes.test.ts`
Expected: FAIL with a TypeScript error (not a runtime failure) — `otListId`/`version` don't exist on `OTPatient` yet, so `entry.otListId`/`entry.version` won't type-check. (Vitest will report this as a failure to run the file.)

- [ ] **Step 3: Add the fields to `utils/otListTypes.ts`**

Modify the `OTPatient` interface:

```ts
export interface OTPatient {
  id: string;
  otListId?: string; // set once persisted (see services/otListService.ts) — absent for an entry still mid-save
  version?: number;  // optimistic-lock counter — absent for an entry still mid-save
  sequence: number;
  ipNo: string;
  name: string;
  age: string;
  gender: 'M' | 'F' | string;
  ward: string;
  unit: string;
  diagnosis: string;
  procedure: string;
  side: string;
  anesthesia: string;
  cArm: 'Yes' | 'No' | string;
  implants: string;
  remarks: string;
  category?: string;
  otType: OTType;
}

export interface OTListMeta {
  id: string;
  surgeon: string;
  surgeonUnit: string;
  otTime: string;
  version: number;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run __tests__/otListTypes.test.ts`
Expected: PASS (18 tests — 16 existing + 2 new).

- [ ] **Step 5: Run the full suite and type-check**

Run: `pnpm vitest run` then `pnpm tsc --noEmit`
Expected: all pass, no new errors (adding optional fields shouldn't break any existing `OTPatient` construction anywhere in the codebase).

- [ ] **Step 6: Commit**

```bash
git add utils/otListTypes.ts __tests__/otListTypes.test.ts
git commit -m "feat(ot-list): add optional otListId/version to OTPatient, add OTListMeta type"
```

---

### Task 3: `services/otListService.ts`

**Files:**
- Create: `services/otListService.ts`
- Test: `__tests__/services/otListService.test.ts`

**Interfaces:**
- Consumes: `OTPatient`, `OTListMeta`, `OTType` from `utils/otListTypes.ts` (Task 2); `supabase` client from `lib/supabase`.
- Produces: `fetchOTList(hospitalId, unit, otType, listDate): Promise<{ list: OTListMeta | null; entries: OTPatient[] }>`, `upsertOTListMeta(hospitalId, unit, otType, listDate, meta): Promise<OTListMeta>`, `insertOTListEntry(otListId, hospitalId, entry): Promise<OTPatient>`, `updateOTListEntry(entryId, version, changes): Promise<Omit<OTPatient, 'otType'>>` (returns everything except `otType`, since `ot_list_entries` has no `ot_type` column to read it back from — the caller merges its own already-known `otType`; throws `Error('CONCURRENT_EDIT:' + entryId)` on a version conflict, matching this project's exact convention in `services/patientService.ts`'s `upsertPatient`), `deleteOTListEntry(entryId): Promise<void>`, `reorderOTListEntries(updates): Promise<void>` — Task 4 and Task 5 both consume every one of these.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/services/otListService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Table-aware mock: unlike a single shared result, this service queries two
// different tables (ot_lists, ot_list_entries) in the same function
// (fetchOTList), so the mock needs to return a different canned result per
// table rather than one result for every call.
const mockState = vi.hoisted(() => ({
  results: {} as Record<string, { data: any; error: any }>,
}));

vi.mock('../../lib/supabase', () => {
  const createBuilder = (table: string) => {
    const b: Record<string, any> = {
      then(onFulfilled: (v: any) => any) {
        return Promise.resolve(mockState.results[table] ?? { data: null, error: null }).then(onFulfilled);
      },
    };
    for (const m of ['select', 'eq', 'order', 'upsert', 'insert', 'update', 'delete', 'maybeSingle', 'single']) {
      b[m] = vi.fn().mockReturnValue(b);
    }
    return b;
  };
  return {
    supabase: {
      from: vi.fn().mockImplementation((table: string) => createBuilder(table)),
    },
  };
});

import {
  fetchOTList, upsertOTListMeta, insertOTListEntry, updateOTListEntry,
  deleteOTListEntry, reorderOTListEntries,
} from '../../services/otListService';

beforeEach(() => {
  mockState.results = {};
});

describe('fetchOTList', () => {
  it('returns null list and empty entries when no list exists yet', async () => {
    mockState.results['ot_lists'] = { data: null, error: null };
    const result = await fetchOTList('hosp-1', 'OR1', 'Major', '2026-08-06');
    expect(result.list).toBeNull();
    expect(result.entries).toEqual([]);
  });

  it('returns the list metadata and its entries when they exist', async () => {
    mockState.results['ot_lists'] = {
      data: { id: 'list-1', surgeon: 'Dr. Rao', surgeon_unit: 'OR1', ot_time: '8.00AM', version: 2 },
      error: null,
    };
    mockState.results['ot_list_entries'] = {
      data: [{
        id: 'entry-1', ot_list_id: 'list-1', sequence: 1, category: 'TABLE 1',
        patient_ip_no: 'IP001', name: 'Ravi Kumar', age: '52', gender: 'M',
        ward: '22', unit: 'OR1', diagnosis: 'Fracture femur', procedure: '',
        side: '', anesthesia: '', c_arm: 'No', implants: '', remarks: '', version: 1,
      }],
      error: null,
    };
    const result = await fetchOTList('hosp-1', 'OR1', 'Major', '2026-08-06');
    expect(result.list).toEqual({ id: 'list-1', surgeon: 'Dr. Rao', surgeonUnit: 'OR1', otTime: '8.00AM', version: 2 });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ id: 'entry-1', otListId: 'list-1', version: 1, ipNo: 'IP001', cArm: 'No' });
  });

  it('throws with a descriptive message when the list query errors', async () => {
    mockState.results['ot_lists'] = { data: null, error: { message: 'network down' } };
    await expect(fetchOTList('hosp-1', 'OR1', 'Major', '2026-08-06')).rejects.toThrow(/network down/);
  });
});

describe('upsertOTListMeta', () => {
  it('returns the upserted list metadata', async () => {
    mockState.results['ot_lists'] = {
      data: { id: 'list-1', surgeon: 'Dr. Rao', surgeon_unit: 'OR1', ot_time: '8.00AM', version: 1 },
      error: null,
    };
    const result = await upsertOTListMeta('hosp-1', 'OR1', 'Major', '2026-08-06', { surgeon: 'Dr. Rao', surgeonUnit: 'OR1', otTime: '8.00AM' });
    expect(result).toEqual({ id: 'list-1', surgeon: 'Dr. Rao', surgeonUnit: 'OR1', otTime: '8.00AM', version: 1 });
  });
});

describe('insertOTListEntry', () => {
  it('returns the inserted entry with its real id/version', async () => {
    mockState.results['ot_list_entries'] = {
      data: {
        id: 'entry-1', ot_list_id: 'list-1', sequence: 1, category: 'TABLE 1',
        patient_ip_no: 'IP001', name: 'Ravi Kumar', age: '52', gender: 'M',
        ward: '22', unit: 'OR1', diagnosis: 'Fracture femur', procedure: '',
        side: '', anesthesia: '', c_arm: 'No', implants: '', remarks: '', version: 1,
      },
      error: null,
    };
    const result = await insertOTListEntry('list-1', 'hosp-1', {
      sequence: 1, ipNo: 'IP001', name: 'Ravi Kumar', age: '52', gender: 'M',
      ward: '22', unit: 'OR1', diagnosis: 'Fracture femur', procedure: '',
      side: '', anesthesia: '', cArm: 'No', implants: '', remarks: '',
      category: 'TABLE 1', otType: 'Major',
    });
    expect(result.id).toBe('entry-1');
    expect(result.otListId).toBe('list-1');
    expect(result.version).toBe(1);
  });
});

describe('updateOTListEntry', () => {
  it('returns the updated entry on success', async () => {
    mockState.results['ot_list_entries'] = {
      data: [{
        id: 'entry-1', ot_list_id: 'list-1', sequence: 1, category: 'TABLE 1',
        patient_ip_no: 'IP001', name: 'Ravi Kumar', age: '52', gender: 'M',
        ward: '22', unit: 'OR1', diagnosis: 'Fracture femur', procedure: '',
        side: '', anesthesia: 'GA', c_arm: 'No', implants: '', remarks: '', version: 2,
      }],
      error: null,
    };
    const result = await updateOTListEntry('entry-1', 1, { anesthesia: 'GA' });
    expect(result.anesthesia).toBe('GA');
    expect(result.version).toBe(2);
  });

  it('throws a CONCURRENT_EDIT error when the version check matches zero rows', async () => {
    mockState.results['ot_list_entries'] = { data: [], error: null };
    await expect(updateOTListEntry('entry-1', 1, { anesthesia: 'GA' }))
      .rejects.toThrow('CONCURRENT_EDIT:entry-1');
  });
});

describe('deleteOTListEntry', () => {
  it('resolves with no error on success', async () => {
    mockState.results['ot_list_entries'] = { data: null, error: null };
    await expect(deleteOTListEntry('entry-1')).resolves.toBeUndefined();
  });
});

describe('reorderOTListEntries', () => {
  it('resolves when all updates succeed', async () => {
    mockState.results['ot_list_entries'] = { data: null, error: null };
    await expect(reorderOTListEntries([{ id: 'entry-1', sequence: 1, category: 'TABLE 1' }])).resolves.toBeUndefined();
  });

  it('throws if any update fails', async () => {
    mockState.results['ot_list_entries'] = { data: null, error: { message: 'row locked' } };
    await expect(reorderOTListEntries([{ id: 'entry-1', sequence: 1, category: 'TABLE 1' }]))
      .rejects.toThrow(/row locked/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run __tests__/services/otListService.test.ts`
Expected: FAIL with "Cannot find module '../../services/otListService'".

- [ ] **Step 3: Create `services/otListService.ts`**

```ts
import { supabase } from '../lib/supabase';
import { OTPatient, OTListMeta, OTType } from '../utils/otListTypes';

interface OTListRow {
  id: string;
  surgeon: string;
  surgeon_unit: string;
  ot_time: string;
  version: number;
}

interface OTListEntryRow {
  id: string;
  ot_list_id: string;
  sequence: number;
  category: string;
  patient_ip_no: string;
  name: string;
  age: string;
  gender: string;
  ward: string;
  unit: string;
  diagnosis: string;
  procedure: string;
  side: string;
  anesthesia: string;
  c_arm: string;
  implants: string;
  remarks: string;
  version: number;
}

function rowToOTListMeta(row: OTListRow): OTListMeta {
  return {
    id: row.id,
    surgeon: row.surgeon,
    surgeonUnit: row.surgeon_unit,
    otTime: row.ot_time,
    version: row.version,
  };
}

// ot_list_entries has no ot_type column (it's implicit from which ot_lists
// row an entry belongs to, not stored redundantly on every entry) — so any
// mapper reading straight from this table can give you every field EXCEPT
// otType. fetchOTList/insertOTListEntry already know the otType they
// queried/inserted with, so they use the full rowToOTPatient below. A row
// returned by an UPDATE (updateOTListEntry) doesn't carry it, so that
// function returns Omit<OTPatient, 'otType'> via this helper instead,
// leaving the caller (which already has the entry's otType from its own
// prior state) to merge it back in — avoiding a guessed default.
function rowToOTPatientFields(row: OTListEntryRow): Omit<OTPatient, 'otType'> {
  return {
    id: row.id,
    otListId: row.ot_list_id,
    version: row.version,
    sequence: row.sequence,
    ipNo: row.patient_ip_no,
    name: row.name,
    age: row.age,
    gender: row.gender,
    ward: row.ward,
    unit: row.unit,
    diagnosis: row.diagnosis,
    procedure: row.procedure,
    side: row.side,
    anesthesia: row.anesthesia,
    cArm: row.c_arm,
    implants: row.implants,
    remarks: row.remarks,
    category: row.category,
  };
}

function rowToOTPatient(row: OTListEntryRow, otType: OTType): OTPatient {
  return { ...rowToOTPatientFields(row), otType };
}

export async function fetchOTList(
  hospitalId: string,
  unit: string,
  otType: OTType,
  listDate: string,
): Promise<{ list: OTListMeta | null; entries: OTPatient[] }> {
  const { data: listRow, error: listError } = await supabase
    .from('ot_lists')
    .select('*')
    .eq('hospital_id', hospitalId)
    .eq('unit', unit)
    .eq('ot_type', otType)
    .eq('list_date', listDate)
    .maybeSingle();
  if (listError) throw new Error(`fetchOTList: ${listError.message}`);
  if (!listRow) return { list: null, entries: [] };

  const { data: entryRows, error: entriesError } = await supabase
    .from('ot_list_entries')
    .select('*')
    .eq('ot_list_id', (listRow as OTListRow).id)
    .order('sequence', { ascending: true });
  if (entriesError) throw new Error(`fetchOTList entries: ${entriesError.message}`);

  return {
    list: rowToOTListMeta(listRow as OTListRow),
    entries: ((entryRows ?? []) as OTListEntryRow[]).map(r => rowToOTPatient(r, otType)),
  };
}

export async function upsertOTListMeta(
  hospitalId: string,
  unit: string,
  otType: OTType,
  listDate: string,
  meta: { surgeon: string; surgeonUnit: string; otTime: string },
): Promise<OTListMeta> {
  const { data, error } = await supabase
    .from('ot_lists')
    .upsert(
      {
        hospital_id: hospitalId,
        unit,
        ot_type: otType,
        list_date: listDate,
        surgeon: meta.surgeon,
        surgeon_unit: meta.surgeonUnit,
        ot_time: meta.otTime,
      },
      { onConflict: 'hospital_id,unit,ot_type,list_date' },
    )
    .select('*')
    .single();
  if (error) throw new Error(`upsertOTListMeta: ${error.message}`);
  return rowToOTListMeta(data as OTListRow);
}

export async function insertOTListEntry(
  otListId: string,
  hospitalId: string,
  entry: Omit<OTPatient, 'id' | 'otListId' | 'version'>,
): Promise<OTPatient> {
  const { data, error } = await supabase
    .from('ot_list_entries')
    .insert({
      ot_list_id: otListId,
      hospital_id: hospitalId,
      sequence: entry.sequence,
      category: entry.category ?? '',
      patient_ip_no: entry.ipNo,
      name: entry.name,
      age: entry.age,
      gender: entry.gender,
      ward: entry.ward,
      unit: entry.unit,
      diagnosis: entry.diagnosis,
      procedure: entry.procedure,
      side: entry.side,
      anesthesia: entry.anesthesia,
      c_arm: entry.cArm,
      implants: entry.implants,
      remarks: entry.remarks,
    })
    .select('*')
    .single();
  if (error) throw new Error(`insertOTListEntry: ${error.message}`);
  return rowToOTPatient(data as OTListEntryRow, entry.otType);
}

export async function updateOTListEntry(
  entryId: string,
  version: number,
  changes: Partial<Omit<OTPatient, 'id' | 'otListId' | 'version' | 'otType'>>,
): Promise<Omit<OTPatient, 'otType'>> {
  const rowChanges: Record<string, unknown> = {};
  if (changes.sequence !== undefined) rowChanges.sequence = changes.sequence;
  if (changes.category !== undefined) rowChanges.category = changes.category;
  if (changes.anesthesia !== undefined) rowChanges.anesthesia = changes.anesthesia;
  if (changes.cArm !== undefined) rowChanges.c_arm = changes.cArm;
  if (changes.implants !== undefined) rowChanges.implants = changes.implants;
  if (changes.remarks !== undefined) rowChanges.remarks = changes.remarks;
  if (changes.ipNo !== undefined) rowChanges.patient_ip_no = changes.ipNo;
  if (changes.name !== undefined) rowChanges.name = changes.name;
  if (changes.age !== undefined) rowChanges.age = changes.age;
  if (changes.gender !== undefined) rowChanges.gender = changes.gender;
  if (changes.ward !== undefined) rowChanges.ward = changes.ward;
  if (changes.unit !== undefined) rowChanges.unit = changes.unit;
  if (changes.diagnosis !== undefined) rowChanges.diagnosis = changes.diagnosis;
  if (changes.procedure !== undefined) rowChanges.procedure = changes.procedure;
  if (changes.side !== undefined) rowChanges.side = changes.side;

  const { data, error } = await supabase
    .from('ot_list_entries')
    .update(rowChanges)
    .eq('id', entryId)
    .eq('version', version)
    .select('*');
  if (error) throw new Error(`updateOTListEntry (${entryId}): ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`CONCURRENT_EDIT:${entryId}`);
  }
  const row = (data as OTListEntryRow[])[0];
  return rowToOTPatientFields(row);
}

export async function deleteOTListEntry(entryId: string): Promise<void> {
  const { error } = await supabase.from('ot_list_entries').delete().eq('id', entryId);
  if (error) throw new Error(`deleteOTListEntry (${entryId}): ${error.message}`);
}

export async function reorderOTListEntries(
  updates: Array<{ id: string; sequence: number; category: string }>,
): Promise<void> {
  const results = await Promise.all(
    updates.map(u =>
      supabase.from('ot_list_entries').update({ sequence: u.sequence, category: u.category }).eq('id', u.id)
    ),
  );
  const failed = results.find(r => r.error);
  if (failed?.error) throw new Error(`reorderOTListEntries: ${failed.error.message}`);
}
```

Note on `updateOTListEntry`'s return type: `ot_list_entries` has no `ot_type` column (it's implicit from which `ot_lists` row an entry belongs to, not stored redundantly on every row), so a row returned by an UPDATE can't tell you `otType` the way `fetchOTList`/`insertOTListEntry`'s rows can (those already know the `otType` they queried/inserted with). Rather than guess one (which would risk silently mislabeling an entry), `updateOTListEntry` returns `Omit<OTPatient, 'otType'>` via the `rowToOTPatientFields` helper, and the caller — which already has the existing entry's real `otType` from its own prior state — merges it back in. Task 5's wiring does exactly this (`{ ...saved, otType: target.otType }`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run __tests__/services/otListService.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Run the full suite and type-check**

Run: `pnpm vitest run` then `pnpm tsc --noEmit`
Expected: all pass, no new errors.

- [ ] **Step 6: Commit**

```bash
git add services/otListService.ts __tests__/services/otListService.test.ts
git commit -m "feat(ot-list): add otListService with fetch/insert/update/delete/reorder"
```

---

### Task 4: Wire loading + list-metadata (surgeon/unit/time) persistence into `OTListManagement.tsx`

**Files:**
- Modify: `components/OTListManagement.tsx`

**Interfaces:**
- Consumes: `fetchOTList`, `upsertOTListMeta` from `services/otListService.ts` (Task 3); `OTListMeta` from `utils/otListTypes.ts` (Task 2).
- Produces: `otListMetaByType: Record<OTType, OTListMeta | null>` state — Task 5 reads this to know whether a given tab's `ot_lists` row already exists (and its `id`/`version`) before inserting an entry or editing metadata.

This task loads all three tabs' persisted data whenever the unit or any of the three dates changes (not just the active tab) — the existing auto-populate effect scans all three tabs' dates at once, so loading only the active tab would risk it not knowing an entry already exists in a not-yet-loaded tab and inserting a duplicate. It also makes the surgeon/unit/time fields save, and stops the existing auto-fill-from-unit-chiefs effect from clobbering a loaded list's own saved values.

- [ ] **Step 1: Add the new state**

Add near the other `useState` declarations (after the `otTime` state):

```ts
  const [otListMetaByType, setOtListMetaByType] = useState<Record<OTType, OTListMeta | null>>({ Major: null, Minor: null, EOT: null });
  const [isLoadingOTList, setIsLoadingOTList] = useState(false);
  const [otListError, setOtListError] = useState<string | null>(null);
```

Add the import: `import { fetchOTList, upsertOTListMeta } from '../services/otListService';` and add `OTListMeta` to the existing `utils/otListTypes` import list.

- [ ] **Step 2: Replace the auto-fill-from-unit-chiefs effect's guard**

Change:
```ts
  // Auto-fill surgeon from unit chiefs whenever the unit or chiefs config changes
  useEffect(() => {
    const key = surgeonUnit.replace(/\s+/g, '').toUpperCase();
    const chief = unitChiefs[key];
    if (chief) setSurgeon(chief);
  }, [surgeonUnit, unitChiefs]);
```
to:
```ts
  // Auto-fill surgeon from unit chiefs whenever the unit or chiefs config
  // changes — but only when there's no persisted list yet for this tab; a
  // saved list's own surgeon override always wins over the chief default.
  useEffect(() => {
    if (otListMetaByType[activeTab]) return;
    const key = surgeonUnit.replace(/\s+/g, '').toUpperCase();
    const chief = unitChiefs[key];
    if (chief) setSurgeon(chief);
  }, [surgeonUnit, unitChiefs, activeTab, otListMetaByType]);
```

- [ ] **Step 3: Add the load effect**

Add this new effect right after the auto-fill effect from Step 2:

```ts
  // Load all three tabs' persisted lists whenever the unit or any of their
  // dates changes (not just the active tab — see Task 4's note on why all
  // three load together).
  useEffect(() => {
    if (!user?.hospitalId) return;
    let cancelled = false;
    setIsLoadingOTList(true);
    setOtListError(null);

    const tabs: Array<{ type: OTType; date: string }> = [
      { type: 'Major', date: majorDate },
      { type: 'Minor', date: minorDate },
      { type: 'EOT', date: eotDate },
    ];

    Promise.all(tabs.map(t => fetchOTList(user.hospitalId!, effectiveUnit, t.type, t.date)))
      .then(results => {
        if (cancelled) return;
        setOtList(results.flatMap(r => r.entries));
        setOtListMetaByType({
          Major: results[0].list,
          Minor: results[1].list,
          EOT: results[2].list,
        });
      })
      .catch(err => {
        if (!cancelled) setOtListError(err instanceof Error ? err.message : 'Failed to load OT list');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingOTList(false);
      });

    return () => { cancelled = true; };
  }, [user?.hospitalId, effectiveUnit, majorDate, minorDate, eotDate]);

  // Re-point surgeon/unit/time at whichever tab's own saved values exist,
  // whenever the active tab changes or that tab's data just finished loading
  // (the effect above already fetched it — this doesn't re-fetch, just
  // re-syncs the editable fields to match).
  useEffect(() => {
    const meta = otListMetaByType[activeTab];
    if (meta) {
      setSurgeon(meta.surgeon);
      setSurgeonUnit(meta.surgeonUnit);
      setOtTime(meta.otTime);
    }
  }, [activeTab, otListMetaByType]);
```

- [ ] **Step 4: Persist surgeon/unit/time edits**

Replace the three plain `onChange` handlers in the "List Meta" section of the JSX (Surgeon/Unit/Time inputs) so editing any of them also saves. Add this helper function near the other handlers (e.g. right before `handleAssignPatient`):

```ts
  const saveOTListMeta = async (next: { surgeon: string; surgeonUnit: string; otTime: string }) => {
    if (!user?.hospitalId) return;
    try {
      const meta = await upsertOTListMeta(user.hospitalId, effectiveUnit, activeTab, selectedDate, next);
      setOtListMetaByType(prev => ({ ...prev, [activeTab]: meta }));
    } catch (err) {
      setOtListError(err instanceof Error ? err.message : 'Failed to save');
    }
  };
```

Then update the three input `onChange` handlers:

```tsx
          <input
            type="text"
            value={surgeon}
            onChange={e => {
              setSurgeon(e.target.value);
              void saveOTListMeta({ surgeon: e.target.value, surgeonUnit, otTime });
            }}
            placeholder="Surgeon name…"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
          />
```
(same pattern for the `surgeonUnit` and `otTime` inputs — call `saveOTListMeta` with the updated field and the other two current values.)

- [ ] **Step 5: Show a loading/error indicator**

Add a small status line right below the header (before the weekend-EOT hint block), so a failed load isn't silently invisible:

```tsx
      {otListError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {otListError}
        </div>
      )}
      {isLoadingOTList && (
        <div className="text-sm text-slate-500">Loading OT list…</div>
      )}
```

- [ ] **Step 6: Run the full suite, type-check, and lint**

Run: `pnpm vitest run` then `pnpm tsc --noEmit` then `pnpm lint`
Expected: all pass, no new errors, zero lint warnings. (No new automated tests for this task — it's component-level async wiring; `OTListManagement.tsx` doesn't currently have its own test file, and adding one now would mean standing up a much larger test harness than this task's actual risk warrants. Manual verification is covered in Task 5's final step, once entry persistence is wired too and there's something meaningful to actually click through.)

- [ ] **Step 7: Commit**

```bash
git add components/OTListManagement.tsx
git commit -m "feat(ot-list): load persisted lists on mount/date-change; persist surgeon/unit/time edits"
```

---

### Task 5: Persist entry mutations (assign, remove, reorder, field edits) and the auto-populate effect

**Files:**
- Create: `utils/otListAutoPopulate.ts`
- Modify: `components/OTListManagement.tsx`
- Test: `__tests__/otListAutoPopulate.test.ts`

**Interfaces:**
- Consumes: `insertOTListEntry`, `updateOTListEntry`, `deleteOTListEntry`, `reorderOTListEntries`, `upsertOTListMeta` from `services/otListService.ts` (Task 3); `otListMetaByType` from Task 4; `hasPendingSurgery` from `utils/calculations.ts`; `getOTTypeForDate`, `OTType` from `utils/otListTypes.ts`.
- Produces: `findNewlyPlannedOTAssignments(patients, existingIpNos, tabDates): PlannedOTAssignment[]` — a pure, unit-testable function the auto-populate effect calls; nothing later depends on it since this is the last task.

This is the biggest task. Every mutation path (the "+" button, drag-assign, remove, reorder, field edits, and the auto-populate effect) needs to actually save, with an optimistic local update and rollback-on-failure. The "+" button and drag-assign currently have two separate, slightly duplicated code paths for building a new entry — this task consolidates them into one shared async function so persistence logic exists in exactly one place. It also extracts the auto-populate effect's "who's newly eligible and not already present" filtering into a small pure function, specifically so the design spec's requirement — a test proving this logic doesn't insert a duplicate row for a patient already present in the loaded list — is actually checkable without needing to render the whole component and mock every context it depends on.

- [ ] **Step 1: Write the failing test for the extracted auto-populate filter**

Create `__tests__/otListAutoPopulate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findNewlyPlannedOTAssignments } from '../utils/otListAutoPopulate';
import { Patient, Gender, PacStatus, PatientStatus } from '../types';

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  ipNo: 'IP001', name: 'Ravi Kumar', mobile: '9876543210', age: 52,
  gender: Gender.Male, ward: 'Ward 22', bed: '5', unit: 'OR1',
  diagnosis: 'Fracture femur', comorbidities: [], doa: '2026-07-26',
  pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [], todos: [],
  ...overrides,
});

// OR1: admit Mon, major Thu, minor Wed (see utils/otSchedule.ts UNIT_SCHEDULE)
const tabDates = [
  { date: '2026-08-06', fallbackType: 'Major' as const }, // a Thursday
  { date: '2026-08-05', fallbackType: 'Minor' as const }, // a Wednesday
  { date: '2026-08-03', fallbackType: 'EOT' as const },   // a Monday
];

describe('findNewlyPlannedOTAssignments', () => {
  it('includes a patient whose plannedDos matches a tab date and is not yet in the list', () => {
    const patients = [makePatient({ ipNo: 'IP001', plannedDos: '2026-08-06' })];
    const result = findNewlyPlannedOTAssignments(patients, new Set(), tabDates);
    expect(result).toHaveLength(1);
    expect(result[0].patient.ipNo).toBe('IP001');
    expect(result[0].otType).toBe('Major');
    expect(result[0].date).toBe('2026-08-06');
  });

  it('does not insert a duplicate for a patient already present in the loaded list', () => {
    const patients = [makePatient({ ipNo: 'IP001', plannedDos: '2026-08-06' })];
    const result = findNewlyPlannedOTAssignments(patients, new Set(['IP001']), tabDates);
    expect(result).toHaveLength(0);
  });

  it('does not return the same patient twice even if eligible for two tab dates', () => {
    // Same ipNo appearing with a plannedDos matching more than one tab date
    // in the same pass must only ever produce one assignment.
    const patients = [
      makePatient({ ipNo: 'IP001', plannedDos: '2026-08-06' }),
      makePatient({ ipNo: 'IP001', plannedDos: '2026-08-05' }),
    ];
    const result = findNewlyPlannedOTAssignments(patients, new Set(), tabDates);
    expect(result).toHaveLength(1);
  });

  it('excludes a patient with no pending surgery', () => {
    const patients = [makePatient({ ipNo: 'IP001', plannedDos: '2026-08-06', dos: '2026-07-01' })];
    const result = findNewlyPlannedOTAssignments(patients, new Set(), tabDates);
    expect(result).toHaveLength(0);
  });

  it('resolves otType from the unit schedule when the date matches a real OT day, falling back otherwise', () => {
    // OR1's schedule says 2026-08-06 is that unit's Major day (see tabDates
    // comment above) — confirm the real schedule wins over the naive
    // fallback that assumed this was the "Major tab"'s date.
    const patients = [makePatient({ ipNo: 'IP001', unit: 'OR1', plannedDos: '2026-08-05' })];
    const result = findNewlyPlannedOTAssignments(patients, new Set(), tabDates);
    expect(result[0].otType).toBe('Minor'); // OR1's real Wednesday type, matching the fallback here too
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run __tests__/otListAutoPopulate.test.ts`
Expected: FAIL with "Cannot find module '../utils/otListAutoPopulate'".

- [ ] **Step 3: Create `utils/otListAutoPopulate.ts`**

```ts
import { Patient } from '../types';
import { hasPendingSurgery } from './calculations';
import { OTType, getOTTypeForDate } from './otListTypes';

export interface PlannedOTAssignment {
  patient: Patient;
  otType: OTType;
  date: string;
}

/**
 * Finds patients whose plannedDos matches one of the given tab dates and
 * who aren't already represented in `existingIpNos` (already-loaded/
 * already-persisted entries) — the auto-populate effect in
 * OTListManagement.tsx calls this, then persists whatever comes back.
 * Pulled out as a pure function specifically so "doesn't insert a duplicate
 * for a patient already in the list" is unit-testable without rendering
 * the whole component.
 */
export function findNewlyPlannedOTAssignments(
  patients: Patient[],
  existingIpNos: Set<string>,
  tabDates: Array<{ date: string; fallbackType: OTType }>,
): PlannedOTAssignment[] {
  const seen = new Set(existingIpNos);
  const result: PlannedOTAssignment[] = [];
  for (const { date, fallbackType } of tabDates) {
    const dated = patients.filter(p => p.plannedDos === date && hasPendingSurgery(p));
    dated.forEach(p => {
      if (seen.has(p.ipNo)) return;
      seen.add(p.ipNo);
      const unit = (p.unit ?? '').toUpperCase();
      const otType = getOTTypeForDate(unit, date) ?? fallbackType;
      result.push({ patient: p, otType, date });
    });
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run __tests__/otListAutoPopulate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite and type-check**

Run: `pnpm vitest run` then `pnpm tsc --noEmit`
Expected: all pass, no new errors.

- [ ] **Step 6: Commit**

```bash
git add utils/otListAutoPopulate.ts __tests__/otListAutoPopulate.test.ts
git commit -m "refactor(ot-list): extract findNewlyPlannedOTAssignments for the auto-populate effect"
```

- [ ] **Step 7: Add the shared assign-and-persist function**

Add this near `handleAssignPatient` (replacing it — see Step 2):

```ts
  const assignPatientToCategory = async (patient: Patient, category: string) => {
    if (!user?.hospitalId) return;
    const existingInCategory = otList.filter(p => p.otType === activeTab && p.category === category);
    const optimisticEntry = buildOTPatientEntry(patient, activeTab, category, existingInCategory);
    setOtList(prev => [...prev, optimisticEntry]);

    try {
      let listMeta = otListMetaByType[activeTab];
      if (!listMeta) {
        listMeta = await upsertOTListMeta(user.hospitalId, effectiveUnit, activeTab, selectedDate, { surgeon, surgeonUnit, otTime });
        setOtListMetaByType(prev => ({ ...prev, [activeTab]: listMeta }));
      }
      const saved = await insertOTListEntry(listMeta.id, user.hospitalId, optimisticEntry);
      setOtList(prev => prev.map(p => (p.id === optimisticEntry.id ? saved : p)));
    } catch (err) {
      setOtList(prev => prev.filter(p => p.id !== optimisticEntry.id));
      setOtListError(err instanceof Error ? err.message : 'Failed to save assignment');
    }
  };
```

Add the import: `import { insertOTListEntry, updateOTListEntry, deleteOTListEntry, reorderOTListEntries } from '../services/otListService';` (combine with Task 4's `upsertOTListMeta`/`fetchOTList` import into one import statement from the same module).

- [ ] **Step 8: Replace `handleAssignPatient` and the inline drag-assign branch to use it**

Replace:
```ts
  const handleAssignPatient = (patient: Patient, category: string = getDefaultCategoryForType(activeTab)) => {
    const existingInCategory = otList.filter(p => p.otType === activeTab && p.category === category);
    const newEntry = buildOTPatientEntry(patient, activeTab, category, existingInCategory);
    setOtList(prev => [...prev, newEntry]);
  };
```
with:
```ts
  const handleAssignPatient = (patient: Patient, category: string = getDefaultCategoryForType(activeTab)) => {
    void assignPatientToCategory(patient, category);
  };
```

In `handleDragEnd`'s pending-prefix branch, replace:
```ts
      const existingInCategory = otList.filter(i => i.otType === activeTab && i.category === targetCategory);
      const newEntry = buildOTPatientEntry(patient, activeTab, targetCategory, existingInCategory);
      setOtList(prev => [...prev, newEntry]);
      return;
```
with:
```ts
      void assignPatientToCategory(patient, targetCategory);
      return;
```

- [ ] **Step 9: Persist removal**

Replace:
```ts
  const handleRemove = (id: string) => {
    setOtList(prev => prev.filter(p => p.id !== id));
  };
```
with:
```ts
  const handleRemove = (id: string) => {
    const removed = otList.find(p => p.id === id);
    setOtList(prev => prev.filter(p => p.id !== id));
    if (!removed?.version) return; // never persisted yet — nothing to delete server-side
    deleteOTListEntry(id).catch(err => {
      setOtList(prev => [...prev, removed]);
      setOtListError(err instanceof Error ? err.message : 'Failed to delete');
    });
  };
```

- [ ] **Step 10: Persist field edits, with conflict handling**

Replace:
```ts
  const handleUpdateEntry = (id: string, field: keyof OTPatient, value: string) => {
    setOtList(prev => {
        // If category changes, we need to update the sequence for this item in the new category
        if (field === 'category') {
             const existingInNewCat = prev.filter(p => p.category === value && p.id !== id);
             const maxSeq = Math.max(0, ...existingInNewCat.map(p => p.sequence));
             return prev.map(p => p.id === id ? { ...p, [field]: value, sequence: maxSeq + 1 } : p);
        }
        return prev.map(p => p.id === id ? { ...p, [field]: value } : p);
    });
  };
```
with:
```ts
  const handleUpdateEntry = (id: string, field: keyof OTPatient, value: string) => {
    const target = otList.find(p => p.id === id);
    if (!target) return;

    // Computed from the current `otList` closure value directly, not from
    // a `prev` read inside the setOtList updater below — a value assigned
    // inside a functional updater is only reliably visible to code that
    // runs after this call if you depend on React's internal "eager state"
    // bailout optimization, which isn't a documented guarantee. Computing
    // it up front here avoids the dependency entirely.
    const newSequence = field === 'category'
      ? Math.max(0, ...otList.filter(p => p.category === value && p.id !== id).map(p => p.sequence)) + 1
      : undefined;

    setOtList(prev => {
        if (field === 'category') {
             return prev.map(p => p.id === id ? { ...p, [field]: value, sequence: newSequence! } : p);
        }
        return prev.map(p => p.id === id ? { ...p, [field]: value } : p);
    });

    // An entry that hasn't round-tripped through insertOTListEntry yet
    // (e.g. edited in the same instant it was added, before the insert
    // response returned) has no version to check against — skip persisting
    // this specific edit rather than guess at one. The field is already
    // reflected locally; a known, narrow gap rather than queuing edits to
    // retry (see the design spec's Non-goals on offline queueing).
    if (target.version == null || !target.otListId) return;

    type EditableOTPatientFields = Partial<Omit<OTPatient, 'id' | 'otListId' | 'version' | 'otType'>>;
    const changes: EditableOTPatientFields = field === 'category'
      ? { category: value, sequence: newSequence! } as EditableOTPatientFields
      : { [field]: value } as EditableOTPatientFields;

    updateOTListEntry(id, target.version, changes)
      .then(saved => setOtList(prev => prev.map(p => (p.id === id ? { ...saved, otType: target.otType } : p))))
      .catch(err => {
        if (err instanceof Error && err.message.startsWith('CONCURRENT_EDIT')) {
          setOtListError('That entry was just updated by someone else — refreshing.');
          if (user?.hospitalId) {
            fetchOTList(user.hospitalId, effectiveUnit, activeTab, selectedDate).then(({ entries }) => {
              setOtList(prev => [...prev.filter(p => p.otType !== activeTab), ...entries]);
            });
          }
        } else {
          setOtListError(err instanceof Error ? err.message : 'Failed to save change');
        }
      });
  };
```

Add `fetchOTList` to the `services/otListService` import (already importing several functions from it per Steps 1 and Task 4 — add this one alongside).

- [ ] **Step 11: Persist reordering**

At the end of `handleDragEnd`'s reorder branch (the `if (active.id !== over.id) { setOtList((items) => { ... }) }` block), the function currently just returns the new array from `setOtList`'s updater. Change it to compute the new order from the current `otList` closure value directly (rather than from a `prev`/`items` argument inside a functional updater — this handler fires once per discrete drag gesture, so `otList` is already fresh; computing outside the updater means the resequenced array is an ordinary local variable, immediately usable for persistence, with no dependency on when or whether React invokes the updater), then call `setOtList` with the plain computed array and persist the resequenced entries:

```ts
    if (active.id !== over.id) {
      const oldIndex = otList.findIndex((item) => item.id === active.id);
      const newIndex = otList.findIndex((item) => item.id === over.id);

      if (oldIndex !== -1) {
        let newItems: OTPatient[];
        if (newIndex === -1) {
          const movedItem = otList[oldIndex];
          newItems = [...otList.filter((_, i) => i !== oldIndex), movedItem];
        } else {
          newItems = arrayMove(otList, oldIndex, newIndex);
        }

        const opts = getTableOptionsForType(activeTab);
        const groups: Record<string, OTPatient[]> = {};
        opts.forEach(opt => { groups[opt] = []; });

        newItems.filter(i => i.otType === activeTab).forEach(item => {
          const cat = item.category && groups[item.category] !== undefined ? item.category : opts[0];
          groups[cat].push(item);
        });

        const resequenced: OTPatient[] = [];
        Object.keys(groups).forEach(cat => {
          groups[cat].forEach((item, index) => {
            resequenced.push({ ...item, sequence: index + 1 });
          });
        });

        const otherTabItems = newItems.filter(i => i.otType !== activeTab);
        setOtList([...otherTabItems, ...resequenced]);

        const persistable = resequenced
          .filter(item => item.version != null)
          .map(item => ({ id: item.id, sequence: item.sequence, category: item.category ?? '' }));
        if (persistable.length > 0) {
          reorderOTListEntries(persistable).catch(err => {
            setOtListError(err instanceof Error ? err.message : 'Failed to save new order');
          });
        }
      }
    }
```

(Reordering doesn't roll back on failure — per the spec's Architecture section, a stale/failed reorder only risks a temporarily-odd order, never lost data, so a rollback here would add complexity for a low-stakes failure mode. An error still shows.)

- [ ] **Step 12: Persist the auto-populate effect's newly-found patients**

The existing auto-populate effect (patients whose `plannedDos` matches one of the tab dates) currently just pushes into local state. Change it to use `findNewlyPlannedOTAssignments` (Steps 1-6 of this task) to find who's newly eligible, then persist each one instead of building the entry inline. Replace:

```ts
  // Auto-populate patients whose plannedDos matches any of the three tab dates
  useEffect(() => {
    const tabDates: Array<{ date: string; fallbackType: OTType }> = [
      { date: majorDate, fallbackType: 'Major' },
      { date: minorDate, fallbackType: 'Minor' },
      { date: eotDate,   fallbackType: 'EOT'   },
      ...cycle.eotWeekendDates.map(date => ({ date, fallbackType: 'EOT' as OTType })),
    ];
    setOtList(prev => {
      const existing = new Set(prev.map(p => p.ipNo));
      const toAdd: OTPatient[] = [];
      for (const { date, fallbackType } of tabDates) {
        const dated = patients.filter(p => p.plannedDos === date && hasPendingSurgery(p));
        dated.forEach(p => {
          if (existing.has(p.ipNo) || toAdd.some(x => x.ipNo === p.ipNo)) return;
          const unit     = (p.unit ?? '').toUpperCase();
          const otType   = getOTTypeForDate(unit, date) ?? fallbackType;
          const category = getDefaultCategoryForType(otType);
          const seqBase  = prev.filter(x => x.otType === otType).length + toAdd.filter(x => x.otType === otType).length;
          toAdd.push({
            id: crypto.randomUUID(),
            sequence: seqBase + 1,
            ipNo: p.ipNo,
            name: p.name,
            age: p.age.toString(),
            gender: p.gender === 'Male' ? 'M' : p.gender === 'Female' ? 'F' : '',
            ward: p.ward.replace(/Ward\s*/i, '').trim(),
            unit: p.unit ?? '',
            diagnosis: p.diagnosis,
            procedure: p.procedure ?? '',
            side: '', anesthesia: '', cArm: 'No', implants: '',
            remarks: p.comorbidities.join(', '),
            category,
            otType,
          });
        });
      }
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });
   
  }, [majorDate, minorDate, eotDate, patients, cycle]);
```

with:

```ts
  // Auto-populate patients whose plannedDos matches any of the three tab
  // dates. Runs after the load effect (Task 4) has populated otList from the
  // database, so the "already present" set findNewlyPlannedOTAssignments
  // checks against correctly reflects everyone already persisted across all
  // three tabs, not just the currently-active one — avoiding a duplicate
  // insert for a patient already assigned in a tab the user hasn't switched
  // to yet this session.
  useEffect(() => {
    if (!user?.hospitalId || isLoadingOTList) return;
    const tabDates: Array<{ date: string; fallbackType: OTType }> = [
      { date: majorDate, fallbackType: 'Major' },
      { date: minorDate, fallbackType: 'Minor' },
      { date: eotDate,   fallbackType: 'EOT'   },
      ...cycle.eotWeekendDates.map(date => ({ date, fallbackType: 'EOT' as OTType })),
    ];
    const existingIpNos = new Set(otList.map(p => p.ipNo));
    const newlyPlanned = findNewlyPlannedOTAssignments(patients, existingIpNos, tabDates);

    newlyPlanned.forEach(({ patient: p, otType, date }) => {
      const category = getDefaultCategoryForType(otType);
      const existingInCategory = otList.filter(x => x.otType === otType && x.category === category);
      const optimisticEntry = buildOTPatientEntry(p, otType, category, existingInCategory);
      setOtList(prev => [...prev, optimisticEntry]);

      (async () => {
        try {
          let listMeta = otListMetaByType[otType];
          if (!listMeta) {
            listMeta = await upsertOTListMeta(user.hospitalId!, effectiveUnit, otType, date, { surgeon, surgeonUnit, otTime });
            setOtListMetaByType(prev => ({ ...prev, [otType]: listMeta }));
          }
          const saved = await insertOTListEntry(listMeta.id, user.hospitalId!, optimisticEntry);
          setOtList(prev => prev.map(x => (x.id === optimisticEntry.id ? saved : x)));
        } catch (err) {
          setOtList(prev => prev.filter(x => x.id !== optimisticEntry.id));
          setOtListError(err instanceof Error ? err.message : 'Failed to auto-save a planned patient');
        }
      })();
    });
  }, [majorDate, minorDate, eotDate, patients, cycle, isLoadingOTList]);
```

Add the import: `import { findNewlyPlannedOTAssignments } from '../utils/otListAutoPopulate';`

Note this duplicates some of `assignPatientToCategory`'s persistence body rather than calling it directly, since this effect needs to resolve `otType`/`date` per-patient (a patient's planned date might map to a *different* tab than whichever is currently active), whereas `assignPatientToCategory` always assigns into the *currently active* tab. That's an intentional difference, not an oversight — leave both as separate, correctly-scoped implementations rather than forcing one shared function to handle both cases awkwardly.

- [ ] **Step 13: Run the full suite, type-check, and lint**

Run: `pnpm vitest run` then `pnpm tsc --noEmit` then `pnpm lint`
Expected: all pass, no new errors, zero lint warnings.

- [ ] **Step 14: Manually verify in the browser**

Run `pnpm dev`, log in, navigate to OT List, and confirm: adding a patient (drag or "+") shows up, then navigating to Dashboard and back to OT List still shows it; editing a field (e.g. anesthesia) and navigating away and back keeps the edit; reordering persists across navigation; removing a patient persists. If the authenticated app can't be driven locally in this environment (a previously-documented limitation), say so plainly in the task report rather than assuming success — this is the single most important thing to verify given the whole point of this feature, so if it can't be checked here, be explicit that the user needs to verify it themselves before trusting it.

- [ ] **Step 15: Commit**

```bash
git add components/OTListManagement.tsx
git commit -m "feat(ot-list): persist entry add/remove/reorder/edit and auto-populated assignments"
```
