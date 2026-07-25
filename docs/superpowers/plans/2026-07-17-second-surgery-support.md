# Second-Surgery Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a patient have a second (or further) surgery recorded without losing the first surgery's procedure/DOS/radiology, and fix the live bug where an already-operated patient can never reappear in the OT pending list.

**Architecture:** `procedure`/`dos`/`plannedDos` stay scalar fields representing the current/most-recent surgery (zero changes to ~140 existing readers). A new `priorSurgeries` array on `Patient` archives superseded surgeries. Two pure helpers in `utils/calculations.ts` carry the actual logic (pending-list membership, archive-then-overwrite computation) so they're unit-testable without rendering components or contexts. Two small new UI components in `components/patient/` add the "Plan next surgery" / "Add another surgery" actions to Patient Detail.

**Tech Stack:** React 19 + TypeScript (strict), Supabase (Postgres/JSONB column, no RLS changes — same table, existing policies), Vitest + @testing-library/react.

## Global Constraints

- `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test` must all pass before any task is considered done.
- pnpm only — never npm/yarn.
- No new RLS policy needed (same `patients` table, same tenant-scoped policies already cover the new column).
- Every new field is optional/additive — no existing Patient object literal (tests, AddPatientModal, etc.) needs to change.
- Small, focused commits — one task per commit.

---

### Task 1: Data model — `PriorSurgery` type

**Files:**
- Modify: `types.ts`

**Interfaces:**
- Produces: `PriorSurgery { procedure: string; dos: string }`, `Patient.priorSurgeries?: PriorSurgery[]`

- [ ] **Step 1: Add the `PriorSurgery` interface and the `priorSurgeries` field**

In `types.ts`, find this block (currently around line 549-550):

```ts
  /** Server-side timestamp of last DB update — legacy concurrent-edit lock key, superseded by `version`. */
  updatedAt?: string;
  /** Server-maintained optimistic-lock counter (`patients.version`, bumped by a DB trigger on every UPDATE). Primary concurrent-edit detection key — must be refreshed from the save response after every write. */
  version?: number;
```

Add directly after it (still inside the `Patient` interface):

```ts
  /**
   * Archive of superseded surgeries. `procedure`/`dos` always represent the
   * CURRENT/most-recent surgery; when a new one is recorded over an existing
   * one, the old {procedure, dos} pair is pushed here first. Most patients
   * have zero entries (only one surgery, ever).
   */
  priorSurgeries?: PriorSurgery[];
```

Then, near the top of `types.ts`, add the new interface. Place it right before the `Patient` interface definition (search for `export interface Patient {`):

```ts
/** A superseded surgery, archived when a later surgery overwrites `procedure`/`dos`. */
export interface PriorSurgery {
  procedure: string;
  dos: string;
}

```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors (the field is optional, so no existing `Patient` object literal breaks).

- [ ] **Step 3: Commit**

```bash
git add types.ts
git commit -m "feat(patients): add PriorSurgery type for second-surgery support"
```

---

### Task 2: Pure logic helpers — `hasPendingSurgery` and `buildSurgeryUpdate`

**Files:**
- Modify: `utils/calculations.ts`
- Test: `__tests__/calculations.test.ts`

**Interfaces:**
- Consumes: `Patient` type (Task 1's `priorSurgeries` field)
- Produces:
  - `hasPendingSurgery(p: Patient): boolean`
  - `buildSurgeryUpdate(patient: Patient, newProcedure: string, newDos: string): Pick<Patient, 'procedure' | 'dos' | 'plannedDos' | 'priorSurgeries'>`

- [ ] **Step 1: Write the failing tests**

In `__tests__/calculations.test.ts`, add these imports to the existing import line (currently `import { calculatePOD, getStatusColor, sortByBed, wardOptionsForPatient } from '../utils/calculations';`):

```ts
import { calculatePOD, getStatusColor, sortByBed, wardOptionsForPatient, hasPendingSurgery, buildSurgeryUpdate } from '../utils/calculations';
```

Add these two `describe` blocks at the end of the file:

```ts
describe('hasPendingSurgery (OT pending-list / ward "Pending" view membership)', () => {
  it('is true when the patient has never been operated', () => {
    expect(hasPendingSurgery({ dos: undefined, plannedDos: undefined } as Patient)).toBe(true);
  });

  it('is true when not yet operated but a date is already planned', () => {
    expect(hasPendingSurgery({ dos: undefined, plannedDos: '2026-08-01' } as Patient)).toBe(true);
  });

  it('is false once operated with no further surgery planned', () => {
    expect(hasPendingSurgery({ dos: '2026-06-01', plannedDos: undefined } as Patient)).toBe(false);
  });

  it('is true once operated AND a second surgery has been planned', () => {
    // Regression: this patient was previously permanently excluded from the
    // pending list because both filters hard-checked `!p.dos`.
    expect(hasPendingSurgery({ dos: '2026-06-01', plannedDos: '2026-08-01' } as Patient)).toBe(true);
  });
});

describe('buildSurgeryUpdate (recording a new/second surgery)', () => {
  it('sets the new procedure and dos, and clears plannedDos', () => {
    const patient = { procedure: undefined, dos: undefined, plannedDos: '2026-06-01', priorSurgeries: undefined } as Patient;
    const result = buildSurgeryUpdate(patient, 'DHS fixation', '2026-06-01');
    expect(result).toEqual({
      procedure: 'DHS fixation',
      dos: '2026-06-01',
      plannedDos: undefined,
      priorSurgeries: [],
    });
  });

  it('archives the current procedure/dos into priorSurgeries when a surgery already existed', () => {
    const patient = {
      procedure: 'DHS fixation', dos: '2026-06-01', plannedDos: '2026-07-20', priorSurgeries: undefined,
    } as Patient;
    const result = buildSurgeryUpdate(patient, 'Implant removal', '2026-07-20');
    expect(result).toEqual({
      procedure: 'Implant removal',
      dos: '2026-07-20',
      plannedDos: undefined,
      priorSurgeries: [{ procedure: 'DHS fixation', dos: '2026-06-01' }],
    });
  });

  it('appends to existing priorSurgeries rather than overwriting the list', () => {
    const patient = {
      procedure: 'Implant removal', dos: '2026-07-20', plannedDos: undefined,
      priorSurgeries: [{ procedure: 'DHS fixation', dos: '2026-06-01' }],
    } as Patient;
    const result = buildSurgeryUpdate(patient, 'Revision fixation', '2026-09-01');
    expect(result.priorSurgeries).toEqual([
      { procedure: 'DHS fixation', dos: '2026-06-01' },
      { procedure: 'Implant removal', dos: '2026-07-20' },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- calculations`
Expected: FAIL — `hasPendingSurgery`/`buildSurgeryUpdate` are not exported from `utils/calculations.ts`.

- [ ] **Step 3: Implement the helpers**

In `utils/calculations.ts`, add directly after the existing `needsPac` export (currently lines 118-119):

```ts
/** Should this patient appear in the OT pending list / ward "Pending" view?
 *  True if never operated, OR already operated but a further surgery has an
 *  outstanding planned date. Safe only because plannedDos is guaranteed to be
 *  cleared the moment its surgery is recorded (see buildSurgeryUpdate) — a
 *  stale leftover plannedDos would otherwise wrongly resurrect a fully-done
 *  patient into these lists. */
export const hasPendingSurgery = (p: Patient): boolean => !p.dos || !!p.plannedDos;

/** Computes the field updates for recording a new (possibly second) surgery.
 *  If the patient already has a current surgery (`dos` set), it is archived
 *  into `priorSurgeries` before being overwritten — this is what lets a
 *  second surgery become "current" without losing the first surgery's data. */
export const buildSurgeryUpdate = (
  patient: Patient,
  newProcedure: string,
  newDos: string,
): Pick<Patient, 'procedure' | 'dos' | 'plannedDos' | 'priorSurgeries'> => ({
  procedure: newProcedure,
  dos: newDos,
  plannedDos: undefined,
  priorSurgeries: patient.dos
    ? [...(patient.priorSurgeries ?? []), { procedure: patient.procedure ?? '', dos: patient.dos }]
    : (patient.priorSurgeries ?? []),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- calculations`
Expected: PASS (all `hasPendingSurgery`/`buildSurgeryUpdate` tests green, plus all pre-existing tests in this file still green).

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add utils/calculations.ts __tests__/calculations.test.ts
git commit -m "feat(patients): add hasPendingSurgery and buildSurgeryUpdate helpers"
```

---

### Task 3: Persist `priorSurgeries` — DB column + service mapping

**Files:**
- Create: `supabase/migrations/20260717120000_add_prior_surgeries_to_patients.sql`
- Modify: `services/patientService.ts`
- Test: `__tests__/services/patientService.test.ts`

**Interfaces:**
- Consumes: `PriorSurgery` (Task 1)
- Produces: `rowToPatient`/`patientToRow` now round-trip `priorSurgeries`; both SELECT constants include `prior_surgeries`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260717120000_add_prior_surgeries_to_patients.sql`:

```sql
-- Archive of superseded surgeries. Nullable — absence means no prior
-- surgeries (the overwhelming majority of patients). No RLS change needed:
-- same `patients` table, same existing tenant-scoped policies apply
-- automatically to the new column.
alter table patients add column if not exists prior_surgeries jsonb;
```

- [ ] **Step 2: Write the failing test**

In `__tests__/services/patientService.test.ts`, find the `makeRow` fixture (around line 43-72) and add `prior_surgeries: null,` to its default fields (alongside the existing `pac_checklist: null,` line). Then add a new `describe` block right after the existing `fetchActivePatients` describe block:

```ts
describe('priorSurgeries mapping', () => {
  it('maps prior_surgeries to an empty array when null', async () => {
    mockState.result = { data: [makeRow({ prior_surgeries: null })], error: null };
    const patients = await fetchActivePatients();
    expect(patients[0].priorSurgeries).toEqual([]);
  });

  it('maps prior_surgeries rows through unchanged', async () => {
    const surgeries = [{ procedure: 'DHS fixation', dos: '2026-06-01' }];
    mockState.result = { data: [makeRow({ prior_surgeries: surgeries })], error: null };
    const patients = await fetchActivePatients();
    expect(patients[0].priorSurgeries).toEqual(surgeries);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- patientService`
Expected: FAIL — `priorSurgeries` is `undefined`, not `[]` (mapping not implemented yet).

- [ ] **Step 4: Implement the mapping**

In `services/patientService.ts`:

1. `PatientRow` interface — add after `pod: number | null;` (currently line 78):

```ts
  prior_surgeries: PriorSurgery[] | null;
```

2. Add `PriorSurgery` to the type import at the top of the file (currently `import { Patient, DailyRound, Investigation, LabResult, ToDoItem, PacChecklistItem, PreOpChecklist, DischargeSummary, DamaSummary, DeathSummary, VitalSigns, ManagementPlan, PacFlowData } from '../types';`) — add `PriorSurgery` to that list.

3. `rowToPatient` — add after `pod: row.pod ?? undefined,` (currently line 195):

```ts
    priorSurgeries: Array.isArray(row.prior_surgeries) ? row.prior_surgeries : [],
```

4. `patientToRow` — add after `pod: patient.pod ?? null,` (currently line 256):

```ts
    prior_surgeries:   patient.priorSurgeries    ?? [],
```

5. Both `PATIENT_LIST_SELECT` and `PATIENT_SELECT` — add `'prior_surgeries'` to the line containing `'pod'` (currently `'diagnosis', 'mode_of_injury', 'procedure', 'comorbidities', 'doa', 'dos', 'planned_dos', 'dod', 'pod', 'admission_source',` at lines 285 and 297) so it reads:

```ts
  'diagnosis', 'mode_of_injury', 'procedure', 'comorbidities', 'doa', 'dos', 'planned_dos', 'dod', 'pod', 'prior_surgeries', 'admission_source',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- patientService`
Expected: PASS (both new tests, plus all pre-existing tests in this file still green — 24+2 = 26 tests).

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260717120000_add_prior_surgeries_to_patients.sql services/patientService.ts __tests__/services/patientService.test.ts
git commit -m "feat(patients): persist priorSurgeries (new prior_surgeries column)"
```

**Note for the human running this plan:** the migration needs to actually be applied to the Supabase project (e.g. `supabase db push`, or via the Supabase dashboard SQL editor) — this plan only creates the file. Do this before testing the feature against a live database.

---

### Task 4: `PatientContext.addSurgery`

**Files:**
- Modify: `contexts/PatientContext.tsx`

**Interfaces:**
- Consumes: `buildSurgeryUpdate` (Task 2), existing `updatePatient` (unchanged, already handles sanitization/versioning/offline-queue/audit-log)
- Produces: `addSurgery(ipNo: string, newProcedure: string, newDos: string): void`, exposed on `PatientContextType` (and therefore on `useApp()`/`usePatients()`)

- [ ] **Step 1: Add `buildSurgeryUpdate` to the imports**

In `contexts/PatientContext.tsx`, find `import { enrichPatientData } from '../utils/calculations';` and change it to:

```ts
import { enrichPatientData, buildSurgeryUpdate } from '../utils/calculations';
```

- [ ] **Step 2: Add `addSurgery` to the `PatientContextType` interface**

Find (currently lines 77-78):

```ts
  updatePatient: (patient: Patient) => void;
  addPatient: (patient: Patient) => void;
```

Change to:

```ts
  updatePatient: (patient: Patient) => void;
  /** Records a new (possibly second) surgery: archives the current procedure/dos
   *  into priorSurgeries (if one exists), sets the new ones as current, clears
   *  plannedDos. No-op if the patient isn't found. */
  addSurgery: (ipNo: string, newProcedure: string, newDos: string) => void;
  addPatient: (patient: Patient) => void;
```

- [ ] **Step 3: Implement `addSurgery`**

Find the `addPatient` function definition (currently starts at line 775, `const addPatient = useCallback((patient: Patient) => {`). Add `addSurgery` directly **before** it (it needs to be defined after `updatePatient`, which it depends on — `updatePatient` is defined starting at line 695, so anywhere after that and before the `value` memo works; placing it right before `addPatient` keeps the "Patient CRUD" section together):

```ts
  const addSurgery = useCallback((ipNo: string, newProcedure: string, newDos: string) => {
    const patient = patients.find(p => p.ipNo === ipNo);
    if (!patient) return;
    updatePatient({ ...patient, ...buildSurgeryUpdate(patient, newProcedure, newDos) });
  }, [patients, updatePatient]);

```

- [ ] **Step 4: Add `addSurgery` to the context value and its dependency array**

Find the `value` memo (currently lines 1031-1062). Add `addSurgery,` right after `updatePatient,` in both the object (line 1041) and the dependency array (line 1058):

```ts
  const value = useMemo<PatientContextType>(() => ({
    patients,
    isLoadingPatients,
    isStale,
    cacheTimestamp,
    hasMore,
    isLoadingMore,
    loadMorePatients,
    hasLoadedAll,
    loadAllPatients,
    updatePatient,
    addSurgery,
    addPatient,
    deletePatient,
    addLabResult,
    addInvestigation,
    deleteInvestigation,
    getPatient,
    saveRound,
    addVitalSign,
    concurrentEditConflict,
    resolveConcurrentEdit,
    realtimeStatus,
    forceReconnect,
    sessionExpired,
  }), [
    patients, isLoadingPatients, isStale, cacheTimestamp,
    hasMore, isLoadingMore, loadMorePatients,
    hasLoadedAll, loadAllPatients, updatePatient, addSurgery, addPatient, deletePatient,
    addLabResult, addInvestigation, deleteInvestigation, getPatient,
    saveRound, addVitalSign, concurrentEditConflict, resolveConcurrentEdit,
    realtimeStatus, forceReconnect, sessionExpired,
  ]);
```

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Run the full test suite**

Run: `pnpm test`
Expected: all pre-existing tests still pass (no PatientContext-level tests exist today — `addSurgery`'s actual logic is already covered by Task 2's `buildSurgeryUpdate` tests; this task is thin, mechanical wiring on top of it).

- [ ] **Step 7: Commit**

```bash
git add contexts/PatientContext.tsx
git commit -m "feat(patients): add addSurgery to PatientContext"
```

---

### Task 5: Fix the OT pending-list exclusion bug

**Files:**
- Modify: `components/OTListManagement.tsx`

**Interfaces:**
- Consumes: `hasPendingSurgery` (Task 2)

- [ ] **Step 1: Import `hasPendingSurgery`**

Find the existing import of patient-related utils in `components/OTListManagement.tsx` (check the top imports for anything from `'../utils/calculations'`; if none exists yet, add a new import line near the other local imports):

```ts
import { hasPendingSurgery } from '../utils/calculations';
```

- [ ] **Step 2: Fix the auto-populate filter**

Find (currently line 173):

```ts
        const dated = patients.filter(p => p.plannedDos === date && !p.dos);
```

Change to:

```ts
        const dated = patients.filter(p => p.plannedDos === date && hasPendingSurgery(p));
```

- [ ] **Step 3: Fix the manual pending-import filter**

Find (currently lines 222-225):

```ts
  const pendingPatients = patients.filter(p =>
    !p.dos &&
    !otList.some(ot => ot.ipNo === p.ipNo && ot.otType === activeTab)
  );
```

Change to:

```ts
  const pendingPatients = patients.filter(p =>
    hasPendingSurgery(p) &&
    !otList.some(ot => ot.ipNo === p.ipNo && ot.otType === activeTab)
  );
```

- [ ] **Step 4: Typecheck, lint, and run existing tests**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test -- OTListManagement`
Expected: no errors, existing `SortableRow` tests still pass (this component has no filter-level tests today — the filter logic itself is already covered by Task 2's `hasPendingSurgery` unit tests; this task only wires it in).

- [ ] **Step 5: Commit**

```bash
git add components/OTListManagement.tsx
git commit -m "fix(ot-list): patient with a completed surgery can reappear in pending list for a second surgery"
```

---

### Task 6: Fix the ward dashboard "Pending" view exclusion bug

**Files:**
- Modify: `components/WardDashboard.tsx`

**Interfaces:**
- Consumes: `hasPendingSurgery` (Task 2)

- [ ] **Step 1: Import `hasPendingSurgery`**

Find the existing import from `'../utils/calculations'` in `components/WardDashboard.tsx` (currently `import { getStatusColor, sortByBed, groupByWard, getTriageBorderClass, needsPac } from '../utils/calculations';`) and add `hasPendingSurgery`:

```ts
import { getStatusColor, sortByBed, groupByWard, getTriageBorderClass, needsPac, hasPendingSurgery } from '../utils/calculations';
```

- [ ] **Step 2: Fix the pending viewMode filter**

Find (currently line 106-108):

```ts
      } else if (viewMode === 'pending') {
        if (p.patientStatus === PatientStatus.Discharged) return false;
        if (p.dos) return false;
```

Change to:

```ts
      } else if (viewMode === 'pending') {
        if (p.patientStatus === PatientStatus.Discharged) return false;
        if (!hasPendingSurgery(p)) return false;
```

- [ ] **Step 3: Typecheck, lint, and run tests**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test`
Expected: no errors, full suite still green (no dedicated `WardDashboard` test file exists today — same reasoning as Task 5, the logic itself is already unit-tested).

- [ ] **Step 4: Commit**

```bash
git add components/WardDashboard.tsx
git commit -m "fix(dashboard): patient with a completed surgery can reappear in Pending view for a second surgery"
```

---

### Task 7: Extract `DateBottomSheet` into a shared component

**Files:**
- Create: `components/ui/DateBottomSheet.tsx`
- Modify: `components/PatientDetail.tsx`

**Interfaces:**
- Produces: `DateBottomSheet({ label, value, onSave, onClose, max? }): JSX.Element` — default export, reusable by both `PatientDetail.tsx` and the new `SurgicalHistorySection.tsx` (Task 9)

This is a pure refactor (move, no behavior change) so Patient Detail's existing DOA/DOS date editing keeps working exactly as today — needed because Task 9 reuses this same sheet for "Plan next surgery" from a different file.

- [ ] **Step 1: Create the shared component**

Create `components/ui/DateBottomSheet.tsx` with the exact current implementation from `components/PatientDetail.tsx` (currently lines 55-90), made independently importable:

```tsx
/**
 * DateBottomSheet.tsx — a single date-input bottom sheet shared by Patient
 * Detail (DOA/DOS editing) and the Surgical History section (planning a
 * next surgery's date). Extracted so both can use the identical component
 * instead of two copies drifting apart.
 */
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { todayYmd } from '../../utils/dates';

interface Props {
  label: string;
  value: string;
  onSave: (v: string) => void;
  onClose: () => void;
  /** Defaults to today — pass a future date (or omit the cap) for planning ahead. */
  max?: string;
}

const DateBottomSheet: React.FC<Props> = ({ label, value, onSave, onClose, max = todayYmd() }) => {
  const [date, setDate] = useState(value);
  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-surface-card rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-5 pb-10 sm:pb-6 animate-[slideUp_0.25s_ease-out] sm:animate-none">
        <div className="w-10 h-1 bg-surface-sunken rounded-full mx-auto mb-5 sm:hidden" />
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-ink">{label}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full text-ink-faint hover:text-ink hover:bg-surface-sunken transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <input
          type="date"
          aria-label={label}
          value={date}
          onChange={e => setDate(e.target.value)}
          max={max}
          className="w-full px-4 py-3.5 border border-line rounded-2xl text-base text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent mb-4"
          autoFocus
        />
        <button
          onClick={() => { onSave(date); onClose(); }}
          className="w-full py-3.5 bg-accent hover:bg-accent-pressed text-white text-sm font-bold rounded-2xl transition-colors"
        >
          Confirm Date
        </button>
      </div>
    </div>
  );
};

export default DateBottomSheet;
```

(`aria-label={label}` is new — added so callers can reliably target the input in tests via `getByLabelText`, and so screen readers announce which date this is, not just "date" — a small accessibility fix picked up while extracting the component.)

Note the one behavior addition: `max` is now a prop defaulting to `todayYmd()` (the original hardcoded behavior) — Task 9's "Plan next surgery" needs to pick a **future** date, so it must be able to override this cap.

- [ ] **Step 2: Remove the local definition from PatientDetail.tsx and import the shared one**

In `components/PatientDetail.tsx`, delete the local `DateBottomSheet` component definition (currently lines 55-90, from `// ─── Date Bottom Sheet ──` through the closing `};` before `// ─── Main Component ───`).

Add this import near the other local imports (e.g. next to `import ConfirmDialog from './ConfirmDialog';`):

```ts
import DateBottomSheet from './ui/DateBottomSheet';
```

- [ ] **Step 3: Typecheck, lint, and run tests**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test`
Expected: no errors, full suite green — this step changes no behavior, only where the component lives.

- [ ] **Step 4: Commit**

```bash
git add components/ui/DateBottomSheet.tsx components/PatientDetail.tsx
git commit -m "refactor(patient-detail): extract DateBottomSheet into components/ui for reuse"
```

---

### Task 8: Clear `plannedDos` when a DOS gets recorded directly

**Files:**
- Modify: `components/PatientDetail.tsx`

This closes the other half of the "stale plannedDos" hazard: Task 5/6 made `plannedDos` the pending-list signal, so it must actually get cleared once its surgery happens — for the *first* surgery, that happens via this plain inline editor (the *second+* surgery path is Task 9's `addSurgery`, which already clears it via `buildSurgeryUpdate`).

- [ ] **Step 1: Update the DOS editor's save handler**

Find (currently lines 758-763, using the post-Task-7 line numbers this will have shifted slightly — search for the `editingDate &&` block):

```tsx
      {editingDate && (
        <DateBottomSheet
          label={editingDate === 'doa' ? 'Date of Admission' : 'Date of Surgery'}
          value={(editingDate === 'doa' ? patient.doa : patient.dos) ?? ''}
          onSave={val => updatePatient({ ...patient, [editingDate === 'doa' ? 'doa' : 'dos']: val || undefined })}
```

Change the `onSave` line to clear `plannedDos` specifically when it's the DOS field being saved (not DOA):

```tsx
          onSave={val => updatePatient(
            editingDate === 'doa'
              ? { ...patient, doa: val || undefined }
              : { ...patient, dos: val || undefined, plannedDos: undefined },
          )}
```

- [ ] **Step 2: Typecheck, lint, and run tests**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test`
Expected: no errors, full suite green.

- [ ] **Step 3: Commit**

```bash
git add components/PatientDetail.tsx
git commit -m "fix(patient-detail): recording DOS directly clears any stale plannedDos"
```

---

### Task 9: "Add another surgery" form component

**Files:**
- Create: `components/patient/AddSurgerySheet.tsx`

**Interfaces:**
- Produces: `AddSurgerySheet({ onSave, onClose, defaultDate? }): JSX.Element` — default export
- Consumes: nothing from earlier tasks directly (pure presentational form); wired to `addSurgery` in Task 10

- [ ] **Step 1: Create the component**

Create `components/patient/AddSurgerySheet.tsx`:

```tsx
/**
 * AddSurgerySheet.tsx — records that a (second or further) surgery happened:
 * procedure name + date entered together, submitted as one atomic action.
 * Deliberately NOT two separate field edits — see the design spec
 * (docs/superpowers/specs/2026-07-17-second-surgery-support-design.md) for
 * why editing procedure and DOS independently risks losing the prior
 * surgery's data depending on which field is changed first.
 */
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { todayYmd } from '../../utils/dates';

interface Props {
  onSave: (procedure: string, dos: string) => void;
  onClose: () => void;
  /** Pre-fills the date — e.g. a previously-planned date for this surgery. */
  defaultDate?: string;
}

const AddSurgerySheet: React.FC<Props> = ({ onSave, onClose, defaultDate }) => {
  const [procedure, setProcedure] = useState('');
  const [dos, setDos] = useState(defaultDate ?? '');
  const canSave = procedure.trim().length > 0 && dos.length > 0;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-surface-card rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-5 pb-10 sm:pb-6 animate-[slideUp_0.25s_ease-out] sm:animate-none">
        <div className="w-10 h-1 bg-surface-sunken rounded-full mx-auto mb-5 sm:hidden" />
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-ink">Add another surgery</h3>
          <button onClick={onClose} className="p-1.5 rounded-full text-ink-faint hover:text-ink hover:bg-surface-sunken transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label htmlFor="add-surgery-procedure" className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
          Procedure name
        </label>
        <input
          id="add-surgery-procedure"
          type="text"
          value={procedure}
          onChange={e => setProcedure(e.target.value)}
          placeholder="e.g. Implant removal"
          className="w-full px-4 py-3.5 border border-line rounded-2xl text-base text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent mb-4"
          autoFocus
        />

        <label htmlFor="add-surgery-dos" className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
          Date of surgery
        </label>
        <input
          id="add-surgery-dos"
          type="date"
          value={dos}
          onChange={e => setDos(e.target.value)}
          max={todayYmd()}
          className="w-full px-4 py-3.5 border border-line rounded-2xl text-base text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent mb-4"
        />

        <button
          onClick={() => { onSave(procedure.trim(), dos); onClose(); }}
          disabled={!canSave}
          className="w-full py-3.5 bg-accent hover:bg-accent-pressed disabled:opacity-40 text-white text-sm font-bold rounded-2xl transition-colors"
        >
          Save surgery
        </button>
      </div>
    </div>
  );
};

export default AddSurgerySheet;
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors (nothing imports this component yet, so no runtime to test — Task 10 wires it in and is where its behavior gets exercised).

- [ ] **Step 3: Commit**

```bash
git add components/patient/AddSurgerySheet.tsx
git commit -m "feat(patient-detail): add AddSurgerySheet form component"
```

---

### Task 10: "Surgical History" section — wire everything into Patient Detail

**Files:**
- Create: `components/patient/SurgicalHistorySection.tsx`
- Test: `__tests__/components/SurgicalHistorySection.test.tsx`
- Modify: `components/PatientDetail.tsx`

**Interfaces:**
- Consumes: `DateBottomSheet` (Task 7), `AddSurgerySheet` (Task 9), `addSurgery` (Task 4), existing `updatePatient`
- Produces: `SurgicalHistorySection({ patient, canEdit, onUpdate, onAddSurgery }): JSX.Element` — default export

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/SurgicalHistorySection.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SurgicalHistorySection from '../../components/patient/SurgicalHistorySection';
import { Patient, PatientStatus, PacStatus, Gender } from '../../types';

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  bed: '5', ward: 'Ortho A', ipNo: 'IP001', name: 'Ravi Kumar', mobile: '9876543210',
  age: 52, gender: Gender.Male, diagnosis: 'Intertrochanteric fracture', comorbidities: [],
  doa: '2024-01-15', pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [], todos: [],
  ...overrides,
});

describe('SurgicalHistorySection', () => {
  it('renders nothing when there are no prior surgeries and no completed surgery yet', () => {
    const { container } = render(
      <SurgicalHistorySection patient={makePatient()} canEdit onUpdate={vi.fn()} onAddSurgery={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists prior surgeries once the patient has any', () => {
    const patient = makePatient({
      dos: '2026-07-20', procedure: 'Implant removal',
      priorSurgeries: [{ procedure: 'DHS fixation', dos: '2026-06-01' }],
    });
    render(<SurgicalHistorySection patient={patient} canEdit onUpdate={vi.fn()} onAddSurgery={vi.fn()} />);
    expect(screen.getByText('DHS fixation')).toBeInTheDocument();
    expect(screen.getByText(/2026-06-01/)).toBeInTheDocument();
  });

  it('"Add another surgery" calls onAddSurgery with the entered procedure and date', () => {
    const onAddSurgery = vi.fn();
    const patient = makePatient({ dos: '2026-06-01', procedure: 'DHS fixation' });
    render(<SurgicalHistorySection patient={patient} canEdit onUpdate={vi.fn()} onAddSurgery={onAddSurgery} />);

    fireEvent.click(screen.getByRole('button', { name: /add another surgery/i }));
    fireEvent.change(screen.getByPlaceholderText(/implant removal/i), { target: { value: 'Revision fixation' } });
    fireEvent.change(screen.getByLabelText(/date of surgery/i), { target: { value: '2026-08-01' } });
    fireEvent.click(screen.getByRole('button', { name: /save surgery/i }));

    expect(onAddSurgery).toHaveBeenCalledWith('IP001', 'Revision fixation', '2026-08-01');
  });

  it('"Plan next surgery" calls onUpdate with only plannedDos changed', () => {
    const onUpdate = vi.fn();
    const patient = makePatient({ dos: '2026-06-01', procedure: 'DHS fixation' });
    render(<SurgicalHistorySection patient={patient} canEdit onUpdate={onUpdate} onAddSurgery={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /plan next surgery/i }));
    fireEvent.change(screen.getByLabelText('Plan next surgery date'), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm date/i }));

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ ipNo: 'IP001', plannedDos: '2026-09-01' }));
  });

  it('does not show "Add another surgery" when canEdit is false', () => {
    const patient = makePatient({ dos: '2026-06-01', procedure: 'DHS fixation' });
    render(<SurgicalHistorySection patient={patient} canEdit={false} onUpdate={vi.fn()} onAddSurgery={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /add another surgery/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- SurgicalHistorySection`
Expected: FAIL — `components/patient/SurgicalHistorySection.tsx` does not exist yet.

- [ ] **Step 3: Implement the component**

Create `components/patient/SurgicalHistorySection.tsx`:

```tsx
/**
 * SurgicalHistorySection.tsx — shows past (superseded) surgeries and offers
 * the two second-surgery actions: planning a future date, or recording that
 * one already happened. Renders nothing for the common case (a patient with
 * exactly one surgery and nothing further planned) — this section only
 * earns its place on screen once there's something to show or do.
 */
import React, { useState } from 'react';
import { CalendarClock, Plus } from 'lucide-react';
import { Patient } from '../../types';
import DateBottomSheet from '../ui/DateBottomSheet';
import AddSurgerySheet from './AddSurgerySheet';

interface Props {
  patient: Patient;
  canEdit: boolean;
  onUpdate: (patient: Patient) => void;
  onAddSurgery: (ipNo: string, procedure: string, dos: string) => void;
}

const SurgicalHistorySection: React.FC<Props> = ({ patient, canEdit, onUpdate, onAddSurgery }) => {
  const [showPlanNext, setShowPlanNext] = useState(false);
  const [showAddSurgery, setShowAddSurgery] = useState(false);

  const priorSurgeries = patient.priorSurgeries ?? [];
  const hasCurrentSurgery = !!patient.dos;

  // Nothing to show and nothing actionable yet — stay invisible.
  if (priorSurgeries.length === 0 && !hasCurrentSurgery) return null;

  return (
    <div className="bg-surface-card rounded-2xl shadow-sm border border-line px-4 py-3 mb-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint mb-2">
        Surgical history
      </p>

      {priorSurgeries.length > 0 && (
        <ul className="space-y-1.5 mb-3">
          {priorSurgeries.map((s, i) => (
            <li key={`${s.procedure}-${s.dos}-${i}`} className="flex items-center justify-between text-sm">
              <span className="text-ink">{s.procedure}</span>
              <span className="text-ink-muted tabular-nums">{s.dos}</span>
            </li>
          ))}
        </ul>
      )}

      {canEdit && hasCurrentSurgery && (
        <div className="flex gap-2">
          <button
            onClick={() => setShowPlanNext(true)}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 bg-surface-sunken rounded-xl text-xs font-bold text-ink-muted hover:bg-accent-soft hover:text-accent-fg transition-colors"
          >
            <CalendarClock className="w-3.5 h-3.5" /> Plan next surgery
          </button>
          <button
            onClick={() => setShowAddSurgery(true)}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 bg-accent-soft rounded-xl text-xs font-bold text-accent-fg hover:bg-accent hover:text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add another surgery
          </button>
        </div>
      )}

      {showPlanNext && (
        <DateBottomSheet
          label="Plan next surgery date"
          value={patient.plannedDos ?? ''}
          max="9999-12-31"
          onSave={val => onUpdate({ ...patient, plannedDos: val || undefined })}
          onClose={() => setShowPlanNext(false)}
        />
      )}

      {showAddSurgery && (
        <AddSurgerySheet
          defaultDate={patient.plannedDos}
          onSave={(procedure, dos) => onAddSurgery(patient.ipNo, procedure, dos)}
          onClose={() => setShowAddSurgery(false)}
        />
      )}
    </div>
  );
};

export default SurgicalHistorySection;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- SurgicalHistorySection`
Expected: PASS (all 5 tests green).

- [ ] **Step 5: Wire the section into Patient Detail**

In `components/PatientDetail.tsx`:

1. Add the import near the other `./patient/*` imports (e.g. next to `import ComorbiditiesSection from './patient/ComorbiditiesSection';`):

```ts
import SurgicalHistorySection from './patient/SurgicalHistorySection';
```

2. Find the `ComorbiditiesSection` render (currently around line 470):

```tsx
      {/* ─── COMORBIDITIES & ALLERGIES (inline-editable) ───────────────── */}
      <ComorbiditiesSection patient={patient} canEdit={canEdit} onUpdate={updatePatient} />
```

Add directly after it:

```tsx
      {/* ─── SURGICAL HISTORY (second-surgery support) ─────────────────── */}
      <SurgicalHistorySection patient={patient} canEdit={canEdit} onUpdate={updatePatient} onAddSurgery={addSurgery} />
```

3. `addSurgery` comes from `useApp()` — find the destructuring at the top of the component (currently `const { navParams, navigateTo, patients, updatePatient, deletePatient, user } = useApp();`) and add it:

```ts
  const { navParams, navigateTo, patients, updatePatient, addSurgery, deletePatient, user } = useApp();
```

- [ ] **Step 6: Typecheck, lint, and run the full test suite**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test`
Expected: no errors, full suite green (this task's 5 new tests plus every pre-existing test).

- [ ] **Step 7: Commit**

```bash
git add components/patient/SurgicalHistorySection.tsx __tests__/components/SurgicalHistorySection.test.tsx components/PatientDetail.tsx
git commit -m "feat(patient-detail): add Surgical History section (plan/record a second surgery)"
```

---

## Post-implementation checklist

- [ ] Apply the migration to the actual Supabase project (`supabase db push` or dashboard SQL editor) — Task 3 only creates the file.
- [ ] Manual smoke test: open a patient with a completed surgery, use "Plan next surgery", confirm they appear in the OT pending list and ward "Pending" view; then use "Add another surgery" and confirm the first surgery now shows under "Surgical history" while the dashboard POD/procedure reflect the new one.
- [ ] Final full run: `pnpm tsc --noEmit && pnpm lint && pnpm test` — all green.
- [ ] Push the branch and open a PR (per this project's merge policy — patient data paths always wait for human review, no self-merge).
