# MediWard Audit Log

## Design tokens — 2026-07-02 (Session 1: discovery + token proposal)

Workflow 4 (UI polish), discovery phase only. **No components modified this session.**
Scope: `mediward/components/**`. Tailwind 4 project — there is currently **no `@theme`
token layer** in `index.css`; all colour comes from raw Tailwind palette classes plus
hardcoded hex. That is the root cause of the inconsistencies below.

### 1a. Hardcoded hex colours (26 occurrences, 4 files)

| Hex | Meaning as used | Files (count) |
|-----|-----------------|---------------|
| `#ef4444` red-500 | systolic series **and** alert/critical (overloaded) | VitalsWidget (5) |
| `#f97316` orange-500 | diastolic + HR series identity | VitalsWidget (2) |
| `#3b82f6` blue-500 | SpO₂ series identity | VitalsWidget (1) |
| `#10b981` emerald-500 | Temp series identity | VitalsWidget (1) |
| `#e2e8f0` slate-200 | grid line | VitalsWidget (1) |
| `#DC2626` red-600 | lab value **above** ref range (HIGH) | LabTrends (1) |
| `#2563EB` blue-600 | lab value **below** ref range (LOW) | LabTrends (1) |
| `#0D9488` teal-600 | lab value **normal** (line stroke) | LabTrends (1) |
| `#D1FAE5` emerald-100 | normal-range reference band fill | LabTrends (1) |
| `#94A3B8` slate-400 | axis tick label | LabTrends (1) |
| `#E2E8F0` slate-200 | tooltip border | LabTrends (1) |
| `#25D366` | WhatsApp brand (share button) | RadiologyComparator (1) |
| dept accents `#0d9488` `#f97316` + print greys (`#94a3b8` `#1e293b` `#64748b` `#f8fafc` `#e2e8f0` `#f1f5f9` `#db2777` `#2563eb`) | department badges + generated print/HTML export document | AdmissionList (12) |

**Note:** AdmissionList's hex live in a generated print/HTML-export string and RadiologyComparator's
is a fixed brand colour — both are lower priority than the on-screen clinical surfaces.

### 1b. Arbitrary Tailwind bracket values (311 occurrences, 46 files)

All 311 are **dimensional** (spacing / sizing / type): `text-[10px]`, `w-[88px]`,
`max-w-[140px]`, `min-w-[860px]`, `h-[72px]`, etc. **Zero** colour brackets
(`text-[#…]` / `bg-[#…]`) exist — so the colour problem is 100% hex-in-attributes,
and the bracket-value problem is a *separate* spacing-token cleanup.

Highest concentrations: DischargeSummary (34), PatientDetail (35), WardDashboard (24),
RoundMode (22), LabTrends (21), RadiologyComparator (20), VitalsWidget (15),
SuperAdminPanel (13). Full per-file counts captured in session grep. This bracket-value
cleanup is deferred to a later session (own PR) — spacing ≠ colour.

### 1c. Clinical surfaces flagged

- **VitalsWidget** — hex `#ef4444/#f97316/#3b82f6/#10b981` for sparkline series + alerts;
  Tailwind `text-red-600` for out-of-range values; NEWS2 badge green/blue/amber/red-50.
- **LabTrends** — hex `#DC2626/#2563EB/#0D9488/#D1FAE5` for chart; Tailwind red/blue/green-50
  badges for HIGH/LOW/NL.
- **ScoringTools** (NEWS2/qSOFA/eGFR/Child-Pugh/MELD/NIHSS/APACHE/GRACE severity) — Tailwind
  `red/amber/orange/green-50…700` severity tiers.
- **MedicationChart** (drug doses/administration) — status green/amber/red + allergy red.
- **RoundMode** — red used **decoratively** for ICU wards (`bg-red-900/700/800`, `text-red-300/800`).
- **PatientStatusBadge** — green-100/800 **and** emerald-100/800 for related "good" states.

### 2. Semantic analysis — same meaning, different colours

| Clinical meaning | Values currently in use | Problem |
|------------------|-------------------------|---------|
| **Critical / abnormal-high** | `#ef4444` (VitalsWidget), `#DC2626` (LabTrends), `red-500/600/700` (ScoringTools, MedicationChart), `red-100/800` (PatientStatusBadge) | Two different reds for the identical "critical" meaning. |
| **Normal / within-range / good** | `#0D9488` teal (LabTrends line), `#D1FAE5` emerald band, `green-50/600` (LabTrends badge), `green-50/700` (VitalsWidget, ScoringTools), `green-100/800` **and** `emerald-100/800` (PatientStatusBadge) | Six values (teal + two greens + emerald) for one concept. |
| **Warning / borderline** | `amber-50/700` (VitalsWidget, ScoringTools, MedicationChart), `orange-50/700` (ScoringTools tier) | Amber vs orange split; LabTrends has no warning tier at all. |
| **Abnormal-low** | `#2563EB` / `blue-*` (LabTrends) | Blue also = SpO₂ **series colour** (VitalsWidget) and = "pending/Due" (MedicationChart, NEWS2 low-medium). Blue means 3 different things. |

**Two clinical-safety red-overload issues (violate ui-standards "never use red decoratively"):**
1. VitalsWidget sparkline paints the **systolic series** red even when normal — the *alert*
   distinction then rests only on dot radius (1.8→2.5px). Red is saturated, so red-means-critical is diluted.
2. RoundMode uses red purely to mark **ICU location**, unrelated to any critical value.

### 3. Proposed token set (see chat for the `index.css` `@theme` diff — awaiting approval)

Four semantic clinical tokens + a categorical chart-series palette (frees red from series use).
`vital-stale` **not** proposed — no stale-reading styling exists in the codebase today, so
there is nothing to consolidate; defer until a real need appears.

**Status: APPROVED + APPLIED (2026-07-02).** `@theme` block added to `index.css`
(24 tokens). Verified: `pnpm tsc --noEmit` clean + `pnpm build` succeeds.
No components migrated yet — that is the next session.

### Next session (migration, not done yet)
File-by-file swap of hardcoded colours → tokens, in clinical-priority order:
1. VitalsWidget — series hex → `chart-*`; alerts/thresholds → `vital-critical`; free red from systolic line.
2. LabTrends — `#DC2626→vital-critical`, `#2563EB→vital-low`, `#0D9488/#D1FAE5→vital-normal`.
3. ScoringTools / MedicationChart / PatientStatusBadge — palette classes → `vital-*` (kill teal/emerald/orange splits).
4. RoundMode — stop using red for ICU location (pick a neutral/location colour, not `vital-critical`).
Each file its own small commit; re-verify tsc/lint/tests after each.

## Data integrity — 2026-07-16 (Session 2: silent write failures)

Workflow 3 (audit), dimension: **data integrity**. Triggered by a real incident: a user
hit a "Conflicting Changes" dialog with no visible way forward. Root cause traced (with
Supabase logs/advisors) to `get_my_hospital_id()` returning `NULL` for a stale/orphaned
session — any RLS-gated `UPDATE` then silently matches 0 rows with **no Postgres error**,
indistinguishable from a real error unless the app explicitly checks rows-affected.
Scope: every `services/*.ts` file with an `.update(...)` call. Read only those.

### Fixed this session (critical — patient/clinical data, fixed immediately)

| File | Issue | Fix |
|------|-------|-----|
| `patientService.ts` (`upsertPatient`, `forceUpdate` branch) | Force-save bypassed the optimistic lock but never checked whether the unconditional UPDATE actually matched a row. If RLS silently zeroed it out, the caller still saw "saved (overwrite)" — a doctor could believe an edit was force-saved when nothing was written. | Added `.select('ip_no')` + rows-affected check; throws `FORCE_SAVE_BLOCKED:` instead of resolving. `PatientContext.resolveConcurrentEdit` now shows an honest "NOT saved — session may have expired" message instead of a false success toast. Regression tests added. |
| `marService.ts` (`stopMedication`) | Didn't check `error` **at all**. `MedicationChart`'s Stop button removed the drug from the UI regardless of whether the DB write succeeded — a discontinued medication could stay active in the DB while the chart shows it stopped. | Now checks `error` and throws; `MedicationChart.tsx` only removes it from local state on success, shows a toast on failure. |
| `marService.ts` (`recordAdministration`) | Same — no `error` check. A recorded dose (given/held/refused) could silently fail to save, and MAR entries are part of the legal clinical record. | Checks `error` and throws; `MedicationChart.tsx handleRecord` wrapped in try/catch with a failure toast. |

Regression tests: `__tests__/services/patientService.test.ts` (force-save rows-affected
cases), `__tests__/services/marService.test.ts` (new file, both functions).

### Logged, not fixed this session (majors — same "0 rows, no throw" class, lower trigger frequency since `error` IS checked; only the silent-RLS-zero-match edge case slips through)

| File / function | Issue | Suggested fix |
|---|---|---|
| `roundsService.ts` `updateRoundTodos` | `.update({todos}).eq(patient_ip_no).eq(date)` — checks `error`, not rows-affected. A todo-list save could silently no-op under the same RLS-null condition. | Add `.select('id')` (or similar) + `if (!data?.length) throw` — mirrors the fix already applied to `upsertRoundVersioned` in the same file, which already does this correctly. |
| `woundCareService.ts` `updateWoundCare` | Same pattern — clinical wound-care record update, no rows-affected check. | Same fix shape as above. |
| `bloodTransfusionService.ts` `updateBloodTransfusion` | Same pattern — blood transfusion record, clinically sensitive. | Same fix shape as above. |

### Logged, not fixed (minors — admin/config paths, not real-time clinical data, low blast radius)

`configService.ts` (`updateWard`, `updateLabType`, `updateHospitalConfig`, `updateMedication`),
`statusService.ts` (incident patch), `superAdminService.ts` (`approveHospital`,
`rejectHospital`, `toggleSuspendHospital`) — all check `error` but not rows-affected.
Same underlying class; deprioritized because these are low-frequency admin actions where
a silent no-op is far more likely to be noticed on the next screen view (ward/lab config
list, hospital approval list) than a clinical bedside action would be.

### Also found, verified NOT an issue

`anon` role holds table grants (INSERT/SELECT/UPDATE/DELETE) on `handovers`,
`consult_requests`, and `blood_transfusion` — looked alarming at first (unauthenticated
grants on clinical tables) but RLS is enabled on all three and every policy is scoped
`TO authenticated` only, so `anon` has no actual access (Postgres default-denies with no
matching policy). Worth a hygiene cleanup (`REVOKE` the unused anon grants) but not a
live security gap.
