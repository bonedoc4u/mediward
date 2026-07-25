# Second-Surgery Support — Design Spec

**Date:** 2026-07-17
**Status:** Approved by user, ready for implementation planning

## Context

`Patient` models exactly one surgery: `procedure?: string`, `dos?: string` (date of
surgery, set once it happens), `plannedDos?: string` (scheduled date, before it
happens). Most patients only ever need one surgery, but some need a second (or
further) procedure on a different day. Today there is no way to record a second
surgery without overwriting the first, and — a real, currently-live bug — a patient
who already has a `dos` from a completed first surgery can **never** reappear in the
OT pending list or ward "Pending" view, even if a second surgery genuinely needs
scheduling, because both list filters hard-exclude on `!p.dos`.

## Goals

- Record a second (or further) surgery without losing the first surgery's procedure
  name, DOS, and its already-uploaded pre/post-op radiology.
- Once a second surgery happens, the dashboard's live POD counter and "current
  procedure" switch to counting from it (confirmed with user) — the first surgery
  becomes historical, viewable in Patient Detail.
- Support planning a second surgery ahead of time, with the patient correctly
  reappearing in the OT pending list / ward "Pending" view.
- Zero changes to the ~140 existing call sites across the app (OT scheduling,
  discharge summary, referral letter, PDF export, FHIR, AI assistant, etc.) that
  read `patient.procedure`/`dos`/`plannedDos` as scalars — they should keep working
  unchanged, now correctly reflecting "the current/most recent surgery."

## Non-goals

- No support for reassigning radiology images to a specific surgical episode.
  Every new upload already tags an explicit pre-op/post-op phase (not inferred), so
  surgery-1 images keep their correct label regardless of what happens later. A
  narrow, pre-existing edge case is out of scope: very old legacy images with no
  explicit phase infer their label from date-vs-`dos`, so a handful of untagged
  historical images could show a stale inferred label once `dos` moves to surgery
  2's date. Not fixing this now — narrow blast radius, separate concern.
- No arbitrary reordering/editing of surgical history — `priorSurgeries` entries are
  archival records, not independently editable after the fact.
- **Pre-Op Prep and PAC Management do not yet recognize a planned second surgery.**
  `hasPendingSurgery()` was adopted by the OT pending list and ward "Pending" view
  (so a second surgery correctly gets scheduled), but `PreOpPrep.tsx` and
  `PacManagement.tsx` still gate on the old bare "no DOS yet" check — a patient
  with surgery 1 done and surgery 2 planned won't appear in either. Deliberately
  out of scope here: a correct fix isn't a filter swap, since `pacStatus` and
  `preOpChecklist` are scalar fields carried over from surgery 1 and would show
  stale "PAC Fit" / already-completed-checklist state for a surgery that hasn't
  actually been cleared. Making the pre-op workflow itself per-surgery is a
  separate design question and a follow-up feature, not a bug in this branch.

## Data model

Add one new field, purely additive:

```ts
export interface PriorSurgery {
  procedure: string;
  dos: string;
}

// on Patient:
priorSurgeries?: PriorSurgery[];
```

`procedure`/`dos`/`plannedDos` remain scalars, always representing the
current/most-recent surgery — this is what keeps every existing reader correct
with no changes.

**DB migration** (additive, no RLS changes needed — same `patients` table, same
existing tenant-scoped policies apply automatically):

```sql
alter table patients add column prior_surgeries jsonb;
```

Nullable, no default needed — absence means "no prior surgeries," mapped to `[]` in
`rowToPatient` (same pattern as `pac_checklist`).

## Behavior

### The key sequencing hazard (why this isn't just "edit two fields")

Procedure name and DOS are edited as two independent fields today. If recording a
second surgery meant just re-editing those same two fields, whichever one is
changed first would silently overwrite surgery 1's data before there's any chance
to archive it — order-dependent and unsafe. So recording a new surgery is a single
**atomic action** (see "Add another surgery" below), not incidental field edits.

### Planning ahead — "Plan next surgery"

New action in Patient Detail (Surgical History section). Opens a date picker and
sets `plannedDos` only — reuses the exact existing `onAssignDate` handler already
wired in `App.tsx` for `WardDashboard`'s pending view (`updatePatient({ ...patient,
plannedDos })`), just newly exposed from Patient Detail too. `dos` and `procedure`
are untouched. This is the missing entry point: today `plannedDos` can only be set
from the ward "Pending" view, which an already-operated patient can never reach —
chicken-and-egg. Patient Detail is always reachable regardless of that filter.

### Recording a surgery — "Add another surgery"

New action in Patient Detail, shown once a patient already has a completed surgery
(`dos` set). Small form: procedure name + date, submitted together as one step
(pre-filled with `plannedDos` if one was set, for convenience). On submit:

1. If `patient.dos` is set (there's a current surgery being superseded), append
   `{ procedure: patient.procedure, dos: patient.dos }` to `priorSurgeries`.
2. Set `procedure` and `dos` to the new values from the form.
3. Clear `plannedDos` — whatever was staged is now resolved.

The existing plain inline DOS editor (used to record the *first* surgery, or to fix
a typo'd date) also clears `plannedDos` in its save payload when it sets a new
`dos` — same resolved-plan reasoning, no archiving needed since there's no prior
surgery yet.

The **WardDashboard "assign planned date" flow is unchanged** — it only ever sets
`plannedDos`, never touches `dos`, so it's unaffected and keeps working exactly as
today for both first-time and second-surgery planning.

### Pending-list fix (closes the live bug)

Both `OTListManagement.tsx` filters currently exclude on bare `!p.dos`:
- Line 173: `p.plannedDos === date && !p.dos` → drop `&& !p.dos` (plannedDos alone
  is now a reliable signal, since it's cleared the moment its surgery is recorded).
- Line 224: `!p.dos && ...` → `(!p.dos || !!p.plannedDos) && ...`

`WardDashboard.tsx` pending viewMode filter (line 108, `if (p.dos) return false;`)
→ `if (p.dos && !p.plannedDos) return false;` (equivalent to keeping in pending
when `!p.dos || p.plannedDos`).

This composite condition is safe specifically *because* `plannedDos` is now
guaranteed to be cleared the moment its surgery is recorded (previous section) —
without that guarantee, stale leftover `plannedDos` values would wrongly resurrect
already-fully-done patients into the pending lists.

## UI changes

**Patient Detail — new "Surgical History" section** (near current procedure/DOS
display): read-only list of `priorSurgeries` (procedure + date each), plus the two
new actions described above ("Plan next surgery", "+ Add another surgery"). Only
shown once `priorSurgeries` is non-empty or the "add another" action becomes
relevant (i.e., once the patient has at least one completed surgery).

No changes needed anywhere else — dashboard cards, discharge summary, referral
letter, PDF export, FHIR, AI assistant all keep reading the scalar fields as-is.

## Affected files

| File | Change |
|---|---|
| `supabase/migrations/*.sql` (new) | add `prior_surgeries jsonb` column to `patients` |
| `types.ts` | add `PriorSurgery` interface, `Patient.priorSurgeries?` |
| `services/patientService.ts` | `PatientRow.prior_surgeries`, `rowToPatient`/`patientToRow` mapping, add to both SELECT field-list constants |
| `contexts/PatientContext.tsx` | new function encapsulating the archive-then-overwrite-then-clear-plannedDos step; existing DOS-editor save path clears `plannedDos` too |
| `components/PatientDetail.tsx` | new Surgical History section + "Plan next surgery" (reuses `onAssignDate`) + "Add another surgery" form |
| `components/OTListManagement.tsx` | relax the two `!p.dos` filters as above |
| `components/WardDashboard.tsx` | relax the pending viewMode filter as above |

## Testing

- `patientService.test.ts`: `prior_surgeries` round-trips correctly through
  `rowToPatient`/`patientToRow`; defaults to `[]` when column is null.
- `PatientContext` (or a focused unit test of the new function): archives the
  current procedure/dos into `priorSurgeries` before overwriting; clears
  `plannedDos`; a patient with no prior `dos` does not get a spurious archive entry.
- `OTListManagement`/`WardDashboard` filter tests: a patient with a completed
  `dos` and a fresh `plannedDos` for a second surgery appears in the pending
  list/view; a patient with a completed `dos` and no `plannedDos` does not.
