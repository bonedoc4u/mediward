# Fracture Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a patient have one or more classified fractures recorded, each carrying multiple simultaneous classification assignments (e.g. Garden IV + Pauwels III + AO/OTA 31-B3 on one neck-of-femur fracture), covering ~28 standard regions/systems plus AO/OTA everywhere.

**Architecture:** One new field `Patient.fractures?: Fracture[]`, each `Fracture` holding a region/side and a list of `{system, grade}` classification entries. The reference data (which systems/grades exist per region) is a static TypeScript file, not a database table — these are universal medical standards, not per-hospital config. No new PatientContext function is needed: the UI computes the updated `fractures` array locally and saves it through the existing generic `updatePatient`, the same pattern `ComorbiditiesSection.tsx` already uses for `comorbidities`.

**Tech Stack:** React 19 + TypeScript (strict), Supabase (Postgres/JSONB column, no RLS changes), Vitest + @testing-library/react.

## Global Constraints

- `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test` must all pass before any task is considered done.
- pnpm only — never npm/yarn.
- No new RLS policy needed (same `patients` table, same existing tenant-scoped policies).
- The new field is optional/additive — no existing Patient object literal needs to change.
- Small, focused commits — one task per commit.
- AO/OTA is structured (bone + segment + type + group picker) ONLY for the 15 regions listed with `aoOtaBone` set in Task 2's reference data. Everywhere else, AO/OTA is a free-text input. Do not invent AO/OTA numeric codes for regions without `aoOtaBone` set.

---

### Task 1: Data model

**Files:**
- Modify: `types.ts`

**Interfaces:**
- Produces: `FractureClassificationEntry { system: string; grade: string }`, `Fracture { id: string; region: string; side?: 'left' | 'right' | 'bilateral'; classifications: FractureClassificationEntry[] }`, `Patient.fractures?: Fracture[]`

- [ ] **Step 1: Add the new interfaces**

In `types.ts`, find this block (currently lines 465-470):

```ts
// ─── Prior Surgery Archive ───────────────────────────────────────────────────────
/** A superseded surgery, archived when a later surgery overwrites `procedure`/`dos`. */
export interface PriorSurgery {
  procedure: string;
  dos: string;
}
```

Add directly after it:

```ts

// ─── Fracture Classification ─────────────────────────────────────────────────
/** One classification assigned to a fracture, e.g. { system: "Garden", grade: "IV" }.
 *  A single fracture can carry several of these at once (Garden + Pauwels + AO/OTA
 *  are complementary systems doctors commonly record together, not alternatives). */
export interface FractureClassificationEntry {
  system: string;
  grade: string;
}

/** One distinct fracture on a patient. A polytrauma patient can have several. */
export interface Fracture {
  id: string;
  /** Key into the static reference dataset in utils/fractureClassifications.ts, e.g. "nof". */
  region: string;
  side?: 'left' | 'right' | 'bilateral';
  classifications: FractureClassificationEntry[];
}
```

- [ ] **Step 2: Add the `fractures` field to `Patient`**

Find this block (currently lines 560-566):

```ts
  /**
   * Archive of superseded surgeries. `procedure`/`dos` always represent the
   * CURRENT/most-recent surgery; when a new one is recorded over an existing
   * one, the old {procedure, dos} pair is pushed here first. Most patients
   * have zero entries (only one surgery, ever).
   */
  priorSurgeries?: PriorSurgery[];
```

Add directly after it:

```ts
  /** Classified fractures — see the Fracture interface. Most patients have one
   *  entry (or zero, if their diagnosis isn't a classified fracture type). */
  fractures?: Fracture[];
```

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add types.ts
git commit -m "feat(patients): add Fracture/FractureClassificationEntry types"
```

---

### Task 2: Reference dataset

**Files:**
- Create: `utils/fractureClassifications.ts`
- Test: `__tests__/fractureClassifications.test.ts`

**Interfaces:**
- Produces:
  - `ClassificationSystemDef { name: string; grades: string[] }`
  - `AoOtaBone { boneCode: '1' | '2' | '3' | '4'; segment: '1' | '2' | '3' }`
  - `FractureRegionDef { key: string; label: string; group: string; systems: ClassificationSystemDef[]; aoOtaBone?: AoOtaBone }`
  - `FRACTURE_REGIONS: FractureRegionDef[]`
  - `GUSTILO_ANDERSON: ClassificationSystemDef`
  - `AO_OTA_TYPES: readonly ['A', 'B', 'C']`, `AO_OTA_GROUPS: readonly ['1', '2', '3']`
  - `buildAoOtaCode(bone: AoOtaBone, type: string, group: string): string` — e.g. `buildAoOtaCode({boneCode:'3',segment:'1'}, 'B', '2')` → `"31-B2"`
  - `REGION_GROUPS: string[]` — the ordered list of group names for the region picker

This is pure reference/static data — no side effects, nothing to mock.

- [ ] **Step 1: Write the failing test**

Create `__tests__/fractureClassifications.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FRACTURE_REGIONS, GUSTILO_ANDERSON, buildAoOtaCode, REGION_GROUPS } from '../utils/fractureClassifications';

describe('FRACTURE_REGIONS', () => {
  it('has 28 regions, each with a unique key and at least one system', () => {
    expect(FRACTURE_REGIONS.length).toBe(28);
    const keys = FRACTURE_REGIONS.map(r => r.key);
    expect(new Set(keys).size).toBe(keys.length); // no duplicate keys
    FRACTURE_REGIONS.forEach(r => {
      expect(r.systems.length).toBeGreaterThan(0);
      r.systems.forEach(s => expect(s.grades.length).toBeGreaterThan(0));
    });
  });

  it('every group name in a region appears in REGION_GROUPS', () => {
    FRACTURE_REGIONS.forEach(r => expect(REGION_GROUPS).toContain(r.group));
  });

  it('exactly 15 regions have structured AO/OTA metadata (the four classic long bones)', () => {
    const withAo = FRACTURE_REGIONS.filter(r => r.aoOtaBone);
    expect(withAo.length).toBe(15);
    withAo.forEach(r => {
      expect(['1', '2', '3', '4']).toContain(r.aoOtaBone!.boneCode);
      expect(['1', '2', '3']).toContain(r.aoOtaBone!.segment);
    });
  });

  it('neck of femur has Garden and Pauwels, with AO/OTA bone=3 (femur) segment=1 (proximal)', () => {
    const nof = FRACTURE_REGIONS.find(r => r.key === 'nof');
    expect(nof).toBeDefined();
    expect(nof!.systems.map(s => s.name)).toEqual(expect.arrayContaining(['Garden', 'Pauwels']));
    expect(nof!.systems.find(s => s.name === 'Garden')!.grades).toEqual(['I', 'II', 'III', 'IV']);
    expect(nof!.aoOtaBone).toEqual({ boneCode: '3', segment: '1' });
  });
});

describe('GUSTILO_ANDERSON', () => {
  it('has the 5 standard open-fracture grades', () => {
    expect(GUSTILO_ANDERSON.grades).toEqual(['I', 'II', 'IIIA', 'IIIB', 'IIIC']);
  });
});

describe('buildAoOtaCode', () => {
  it('composes bone-segment-type-group into the standard AO/OTA format', () => {
    expect(buildAoOtaCode({ boneCode: '3', segment: '1' }, 'B', '2')).toBe('31-B2');
    expect(buildAoOtaCode({ boneCode: '4', segment: '3' }, 'C', '1')).toBe('44-C1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- fractureClassifications`
Expected: FAIL — `utils/fractureClassifications.ts` does not exist yet.

- [ ] **Step 3: Create the reference dataset**

Create `utils/fractureClassifications.ts`:

```ts
/**
 * fractureClassifications.ts — static reference data for the Fracture
 * Classification feature. Universal medical standards, not per-hospital
 * config, so this is a plain data file rather than an admin-editable table.
 *
 * AO/OTA scope: structured (bone+segment+type+group) ONLY for the four
 * classic long bones (humerus, radius/ulna, femur, tibia/fibula) — the
 * regions below with `aoOtaBone` set. Every other region offers AO/OTA as
 * free text instead of a hardcoded numeric code, to avoid asserting specific
 * codes outside high-confidence territory (see the design spec's "AO/OTA
 * modeling" section).
 */

export interface ClassificationSystemDef {
  name: string;
  grades: string[];
}

export interface AoOtaBone {
  /** 1 = Humerus, 2 = Radius/Ulna, 3 = Femur, 4 = Tibia/Fibula (standard AO/OTA bone codes). */
  boneCode: '1' | '2' | '3' | '4';
  /** 1 = Proximal, 2 = Diaphyseal, 3 = Distal. */
  segment: '1' | '2' | '3';
}

export interface FractureRegionDef {
  key: string;
  label: string;
  group: string;
  /** Eponymous systems specific to this region (not including Gustilo-Anderson or AO/OTA, which are universal add-ons offered everywhere). */
  systems: ClassificationSystemDef[];
  /** Present only for the four classic long bones — enables the structured AO/OTA picker instead of free text. */
  aoOtaBone?: AoOtaBone;
}

/** Offered as an add-on for any region when the fracture is open. */
export const GUSTILO_ANDERSON: ClassificationSystemDef = {
  name: 'Gustilo-Anderson',
  grades: ['I', 'II', 'IIIA', 'IIIB', 'IIIC'],
};

export const AO_OTA_TYPES = ['A', 'B', 'C'] as const;
export const AO_OTA_GROUPS = ['1', '2', '3'] as const;

/** Composes AO/OTA bone-segment-type-group into the standard code, e.g. "31-B2". */
export function buildAoOtaCode(bone: AoOtaBone, type: string, group: string): string {
  return `${bone.boneCode}${bone.segment}-${type}${group}`;
}

export const REGION_GROUPS = ['Upper Limb', 'Pelvis & Hip', 'Lower Limb', 'Foot & Ankle', 'Spine'] as const;

export const FRACTURE_REGIONS: FractureRegionDef[] = [
  // ── Upper Limb ──────────────────────────────────────────────────────────
  {
    key: 'clavicle', label: 'Clavicle', group: 'Upper Limb',
    systems: [
      { name: 'Allman', grades: ['I (Midshaft)', 'II (Distal)', 'III (Medial)'] },
      { name: 'Neer (Distal Clavicle)', grades: ['I', 'II', 'III', 'IV', 'V'] },
    ],
  },
  {
    key: 'prox_humerus', label: 'Proximal Humerus', group: 'Upper Limb',
    systems: [{ name: 'Neer', grades: ['1-part', '2-part', '3-part', '4-part'] }],
    aoOtaBone: { boneCode: '1', segment: '1' },
  },
  {
    key: 'humeral_shaft', label: 'Humeral Shaft', group: 'Upper Limb',
    systems: [],
    aoOtaBone: { boneCode: '1', segment: '2' },
  },
  {
    key: 'distal_humerus', label: 'Distal Humerus', group: 'Upper Limb',
    systems: [
      { name: 'Milch (Lateral Condyle)', grades: ['I', 'II'] },
      { name: 'Jakob (Paediatric Lateral Condyle)', grades: ['I', 'II'] },
    ],
    aoOtaBone: { boneCode: '1', segment: '3' },
  },
  {
    key: 'supracondylar_humerus_paed', label: 'Supracondylar Humerus (Paediatric)', group: 'Upper Limb',
    systems: [{ name: 'Gartland', grades: ['I', 'II', 'III'] }],
    aoOtaBone: { boneCode: '1', segment: '3' },
  },
  {
    key: 'radial_head', label: 'Radial Head', group: 'Upper Limb',
    systems: [{ name: 'Mason', grades: ['I', 'II', 'III', 'IV'] }],
    aoOtaBone: { boneCode: '2', segment: '1' },
  },
  {
    key: 'olecranon', label: 'Olecranon', group: 'Upper Limb',
    systems: [{ name: 'Mayo', grades: ['IA', 'IB', 'IIA', 'IIB', 'IIIA', 'IIIB'] }],
    aoOtaBone: { boneCode: '2', segment: '1' },
  },
  {
    key: 'monteggia', label: 'Monteggia Fracture-Dislocation', group: 'Upper Limb',
    systems: [{ name: 'Bado', grades: ['I', 'II', 'III', 'IV'] }],
  },
  {
    key: 'distal_radius', label: 'Distal Radius', group: 'Upper Limb',
    systems: [
      { name: 'Frykman', grades: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'] },
      { name: 'Fernandez', grades: ['I', 'II', 'III', 'IV', 'V'] },
      { name: 'Melone', grades: ['I', 'II', 'III', 'IV'] },
    ],
    aoOtaBone: { boneCode: '2', segment: '3' },
  },
  {
    key: 'scaphoid', label: 'Scaphoid', group: 'Upper Limb',
    systems: [
      { name: 'Herbert', grades: ['A1', 'A2', 'B1', 'B2', 'B3', 'B4', 'C', 'D1', 'D2'] },
      { name: 'Mayo', grades: ['Proximal pole', 'Waist', 'Distal pole'] },
    ],
  },

  // ── Pelvis & Hip ────────────────────────────────────────────────────────
  {
    key: 'pelvic_ring', label: 'Pelvic Ring', group: 'Pelvis & Hip',
    systems: [
      { name: 'Young-Burgess', grades: ['LC-I', 'LC-II', 'LC-III', 'APC-I', 'APC-II', 'APC-III', 'Vertical Shear', 'Combined Mechanism'] },
      { name: 'Tile', grades: ['A', 'B', 'C'] },
    ],
  },
  {
    key: 'acetabulum', label: 'Acetabulum', group: 'Pelvis & Hip',
    systems: [{
      name: 'Judet-Letournel',
      grades: [
        'Posterior Wall', 'Posterior Column', 'Anterior Wall', 'Anterior Column', 'Transverse',
        'Posterior Column + Posterior Wall', 'Transverse + Posterior Wall', 'T-shaped',
        'Anterior Column + Posterior Hemitransverse', 'Both-Column',
      ],
    }],
  },
  {
    key: 'nof', label: 'Neck of Femur', group: 'Pelvis & Hip',
    systems: [
      { name: 'Garden', grades: ['I', 'II', 'III', 'IV'] },
      { name: 'Pauwels', grades: ['I', 'II', 'III'] },
    ],
    aoOtaBone: { boneCode: '3', segment: '1' },
  },
  {
    key: 'intertrochanteric', label: 'Intertrochanteric', group: 'Pelvis & Hip',
    systems: [
      { name: 'Boyd-Griffin', grades: ['I', 'II', 'III', 'IV'] },
      { name: 'Evans', grades: ['I', 'II', 'III', 'IV', 'Reverse Oblique'] },
    ],
    aoOtaBone: { boneCode: '3', segment: '1' },
  },
  {
    key: 'subtrochanteric', label: 'Subtrochanteric', group: 'Pelvis & Hip',
    systems: [
      { name: 'Russell-Taylor', grades: ['IA', 'IB', 'IIA', 'IIB'] },
      { name: 'Seinsheimer', grades: ['I', 'II', 'III', 'IV', 'V'] },
    ],
    aoOtaBone: { boneCode: '3', segment: '1' },
  },

  // ── Lower Limb ──────────────────────────────────────────────────────────
  {
    key: 'femoral_shaft', label: 'Femoral Shaft', group: 'Lower Limb',
    systems: [{ name: 'Winquist-Hansen', grades: ['0', 'I', 'II', 'III', 'IV'] }],
    aoOtaBone: { boneCode: '3', segment: '2' },
  },
  {
    key: 'distal_femur', label: 'Distal Femur', group: 'Lower Limb',
    systems: [{ name: 'Su (Supracondylar)', grades: ['I', 'II', 'III'] }],
    aoOtaBone: { boneCode: '3', segment: '3' },
  },
  {
    key: 'tibial_plateau', label: 'Tibial Plateau', group: 'Lower Limb',
    systems: [{ name: 'Schatzker', grades: ['I', 'II', 'III', 'IV', 'V', 'VI'] }],
    aoOtaBone: { boneCode: '4', segment: '1' },
  },
  {
    key: 'tibial_shaft', label: 'Tibial Shaft', group: 'Lower Limb',
    systems: [],
    aoOtaBone: { boneCode: '4', segment: '2' },
  },
  {
    key: 'pilon', label: 'Pilon (Distal Tibia)', group: 'Lower Limb',
    systems: [{ name: 'Rüedi-Allgower', grades: ['I', 'II', 'III'] }],
    aoOtaBone: { boneCode: '4', segment: '3' },
  },

  // ── Foot & Ankle ────────────────────────────────────────────────────────
  {
    key: 'ankle', label: 'Ankle', group: 'Foot & Ankle',
    systems: [
      { name: 'Weber (Danis-Weber)', grades: ['A', 'B', 'C'] },
      { name: 'Lauge-Hansen', grades: ['Supination-Adduction', 'Supination-External Rotation', 'Pronation-Abduction', 'Pronation-External Rotation'] },
    ],
    aoOtaBone: { boneCode: '4', segment: '3' },
  },
  {
    key: 'talus_neck', label: 'Talus (Neck)', group: 'Foot & Ankle',
    systems: [{ name: 'Hawkins', grades: ['I', 'II', 'III', 'IV'] }],
  },
  {
    key: 'calcaneus', label: 'Calcaneus', group: 'Foot & Ankle',
    systems: [
      { name: 'Sanders', grades: ['I', 'II', 'III', 'IV'] },
      { name: 'Essex-Lopresti', grades: ['Tongue-type', 'Joint depression'] },
    ],
  },

  // ── Spine ───────────────────────────────────────────────────────────────
  {
    key: 'thoracolumbar_spine', label: 'Thoracolumbar Spine', group: 'Spine',
    systems: [
      { name: 'Denis (Three-Column)', grades: ['Compression', 'Burst', 'Seatbelt', 'Fracture-Dislocation'] },
      { name: 'AO Spine', grades: ['A', 'B', 'C'] },
    ],
  },
  {
    key: 'c1_atlas', label: 'C1 (Atlas)', group: 'Spine',
    systems: [{ name: 'Landells/Jefferson', grades: ['2-part', '3-part', '4-part'] }],
  },
  {
    key: 'c2_odontoid', label: 'C2 Odontoid', group: 'Spine',
    systems: [{ name: 'Anderson-D’Alonzo', grades: ['I', 'II', 'III'] }],
  },
  {
    key: 'c2_hangman', label: 'C2 Traumatic Spondylolisthesis (Hangman’s)', group: 'Spine',
    systems: [{ name: 'Levine-Edwards', grades: ['I', 'II', 'IIA', 'III'] }],
  },
  {
    key: 'subaxial_cervical', label: 'Subaxial Cervical', group: 'Spine',
    systems: [{
      name: 'Allen-Ferguson',
      grades: ['Compression Flexion', 'Vertical Compression', 'Distraction Flexion', 'Compression Extension', 'Distraction Extension', 'Lateral Flexion'],
    }],
  },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- fractureClassifications`
Expected: PASS (all 5 tests green). If the region count assertion fails, count the entries in `FRACTURE_REGIONS` above — there should be exactly 28 (10 Upper Limb + 5 Pelvis & Hip + 5 Lower Limb + 3 Foot & Ankle + 5 Spine).

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add utils/fractureClassifications.ts __tests__/fractureClassifications.test.ts
git commit -m "feat(patients): add fracture classification reference dataset"
```

---

### Task 3: Persist `fractures` — DB column + service mapping

**Files:**
- Create: `supabase/migrations/20260726120000_add_fractures_to_patients.sql`
- Modify: `services/patientService.ts`
- Test: `__tests__/services/patientService.test.ts`

**Interfaces:**
- Consumes: `Fracture` (Task 1)
- Produces: `rowToPatient`/`patientToRow` round-trip `fractures`; both SELECT constants include `fractures`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260726120000_add_fractures_to_patients.sql`:

```sql
-- Classified fractures per patient. Nullable — absence means no classified
-- fractures recorded (most patients, if their diagnosis isn't a fracture
-- classification use case). No RLS change needed: same `patients` table,
-- same existing tenant-scoped policies apply automatically to the new column.
alter table patients add column if not exists fractures jsonb;
```

- [ ] **Step 2: Write the failing test**

In `__tests__/services/patientService.test.ts`, find the `makeRow` fixture and add `fractures: null,` next to the existing `prior_surgeries: null,` line. Then add a new `describe` block right after the existing `priorSurgeries mapping` describe block:

```ts
describe('fractures mapping', () => {
  it('maps fractures to an empty array when null', async () => {
    mockState.result = { data: [makeRow({ fractures: null })], error: null };
    const patients = await fetchActivePatients();
    expect(patients[0].fractures).toEqual([]);
  });

  it('maps fractures rows through unchanged', async () => {
    const fractures = [{
      id: 'f1', region: 'nof', side: 'right',
      classifications: [{ system: 'Garden', grade: 'IV' }],
    }];
    mockState.result = { data: [makeRow({ fractures })], error: null };
    const patients = await fetchActivePatients();
    expect(patients[0].fractures).toEqual(fractures);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- patientService`
Expected: FAIL — `fractures` is `undefined`, not `[]` (mapping not implemented yet).

- [ ] **Step 4: Implement the mapping**

In `services/patientService.ts`:

1. Add `Fracture` to the type import at the top of the file (the line currently reading `ManagementPlan, PacFlowData, PriorSurgery,` — add `Fracture` to that list).

2. `PatientRow` interface — add after `prior_surgeries: PriorSurgery[] | null;` (currently line 79):

```ts
  fractures: Fracture[] | null;
```

3. `rowToPatient` — add after `priorSurgeries:   Array.isArray(row.prior_surgeries) ? row.prior_surgeries : [],` (currently line 197):

```ts
    fractures:        Array.isArray(row.fractures) ? row.fractures : [],
```

4. `patientToRow` — add after `prior_surgeries:   patient.priorSurgeries    ?? [],` (currently line 259):

```ts
    fractures:         patient.fractures         ?? [],
```

5. Both `PATIENT_LIST_SELECT` and `PATIENT_SELECT` — add `'fractures'` to the line containing `'prior_surgeries'` (currently `'diagnosis', 'mode_of_injury', 'procedure', 'comorbidities', 'doa', 'dos', 'planned_dos', 'dod', 'pod', 'prior_surgeries', 'admission_source',` at lines 288 and 300) so it reads:

```ts
  'diagnosis', 'mode_of_injury', 'procedure', 'comorbidities', 'doa', 'dos', 'planned_dos', 'dod', 'pod', 'prior_surgeries', 'fractures', 'admission_source',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- patientService`
Expected: PASS (26 pre-existing + 2 new = 28 tests).

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260726120000_add_fractures_to_patients.sql services/patientService.ts __tests__/services/patientService.test.ts
git commit -m "feat(patients): persist fractures (new fractures column)"
```

**Note for the human running this plan:** the migration needs to actually be applied to the Supabase project (e.g. via the `apply_migration` MCP tool, `supabase db push`, or the dashboard SQL editor) — this task only creates the file.

---

### Task 4: `AddFractureSheet` — region + side picker

**Files:**
- Create: `components/patient/AddFractureSheet.tsx`

**Interfaces:**
- Consumes: `FRACTURE_REGIONS`, `REGION_GROUPS` (Task 2), `BottomSheetPicker` (existing, `components/ui/BottomSheetPicker.tsx` — props `{ value, options: {value,label,description?}[], onChange, placeholder?, title? }`)
- Produces: `AddFractureSheet({ onSave, onClose }): JSX.Element` — default export. `onSave: (region: string, side?: 'left' | 'right' | 'bilateral') => void`

- [ ] **Step 1: Create the component**

Create `components/patient/AddFractureSheet.tsx`:

```tsx
/**
 * AddFractureSheet.tsx — records a new distinct fracture: pick the region,
 * then optionally which side. Classifications are added separately per
 * fracture afterward (see AddClassificationSheet) — this step only creates
 * the fracture entry itself.
 */
import React, { useState } from 'react';
import { X } from 'lucide-react';
import BottomSheetPicker from '../ui/BottomSheetPicker';
import { FRACTURE_REGIONS, REGION_GROUPS } from '../../utils/fractureClassifications';

interface Props {
  onSave: (region: string, side?: 'left' | 'right' | 'bilateral') => void;
  onClose: () => void;
}

const SIDE_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'bilateral', label: 'Bilateral' },
];

const AddFractureSheet: React.FC<Props> = ({ onSave, onClose }) => {
  const [region, setRegion] = useState('');
  const [side, setSide] = useState('');

  const regionOptions = REGION_GROUPS.flatMap(group =>
    FRACTURE_REGIONS.filter(r => r.group === group).map(r => ({
      value: r.key,
      label: r.label,
      description: group,
    })),
  );

  const canSave = region.length > 0;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-surface-card rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-5 pb-10 sm:pb-6 animate-[slideUp_0.25s_ease-out] sm:animate-none">
        <div className="w-10 h-1 bg-surface-sunken rounded-full mx-auto mb-5 sm:hidden" />
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-ink">Add fracture</h3>
          <button onClick={onClose} className="p-1.5 rounded-full text-ink-faint hover:text-ink hover:bg-surface-sunken transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
          Region
        </label>
        <div className="mb-4">
          <BottomSheetPicker
            title="Fracture region"
            value={region}
            options={regionOptions}
            onChange={setRegion}
            placeholder="Select region…"
          />
        </div>

        <label className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
          Side (optional)
        </label>
        <div className="mb-4">
          <BottomSheetPicker
            title="Side"
            value={side}
            options={SIDE_OPTIONS}
            onChange={setSide}
            placeholder="Not specified"
          />
        </div>

        <button
          onClick={() => { onSave(region, (side || undefined) as 'left' | 'right' | 'bilateral' | undefined); onClose(); }}
          disabled={!canSave}
          className="w-full py-3.5 bg-accent hover:bg-accent-pressed disabled:opacity-40 text-white text-sm font-bold rounded-2xl transition-colors"
        >
          Save fracture
        </button>
      </div>
    </div>
  );
};

export default AddFractureSheet;
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/patient/AddFractureSheet.tsx
git commit -m "feat(patients): add AddFractureSheet region+side picker"
```

---

### Task 5: `AddClassificationSheet` — system + grade picker

**Files:**
- Create: `components/patient/AddClassificationSheet.tsx`

**Interfaces:**
- Consumes: `FractureRegionDef`, `GUSTILO_ANDERSON`, `AO_OTA_TYPES`, `AO_OTA_GROUPS`, `buildAoOtaCode` (Task 2), `BottomSheetPicker` (existing)
- Produces: `AddClassificationSheet({ region, onSave, onClose }): JSX.Element` — default export. `region: FractureRegionDef`, `onSave: (entry: { system: string; grade: string }) => void`

- [ ] **Step 1: Create the component**

Create `components/patient/AddClassificationSheet.tsx`:

```tsx
/**
 * AddClassificationSheet.tsx — assigns one classification to an existing
 * fracture. Offered systems: the region's own eponymous systems, plus
 * Gustilo-Anderson (always, for open fractures), plus AO/OTA (always).
 * AO/OTA is a structured bone+segment+type+group picker for the four
 * classic long bones (region.aoOtaBone set) and a free-text field
 * everywhere else — see the design spec's AO/OTA scope boundary.
 */
import React, { useState } from 'react';
import { X } from 'lucide-react';
import BottomSheetPicker from '../ui/BottomSheetPicker';
import {
  FractureRegionDef, GUSTILO_ANDERSON, AO_OTA_TYPES, AO_OTA_GROUPS, buildAoOtaCode,
} from '../../utils/fractureClassifications';

interface Props {
  region: FractureRegionDef;
  onSave: (entry: { system: string; grade: string }) => void;
  onClose: () => void;
}

const AO_OTA = 'AO/OTA';

const AddClassificationSheet: React.FC<Props> = ({ region, onSave, onClose }) => {
  const [system, setSystem] = useState('');
  const [grade, setGrade] = useState('');
  const [aoType, setAoType] = useState('');
  const [aoGroup, setAoGroup] = useState('');
  const [aoFreeText, setAoFreeText] = useState('');

  const systemOptions = [
    ...region.systems.map(s => ({ value: s.name, label: s.name })),
    { value: GUSTILO_ANDERSON.name, label: GUSTILO_ANDERSON.name },
    { value: AO_OTA, label: AO_OTA },
  ];

  const selectedEponymous = region.systems.find(s => s.name === system);
  const gradeOptions = selectedEponymous?.grades ?? (system === GUSTILO_ANDERSON.name ? GUSTILO_ANDERSON.grades : []);

  const isAoOta = system === AO_OTA;
  const isStructuredAoOta = isAoOta && !!region.aoOtaBone;

  const canSave = system.length > 0 && (
    isStructuredAoOta ? (aoType.length > 0 && aoGroup.length > 0)
      : isAoOta ? aoFreeText.trim().length > 0
        : grade.length > 0
  );

  const handleSave = () => {
    const finalGrade = isStructuredAoOta
      ? buildAoOtaCode(region.aoOtaBone!, aoType, aoGroup)
      : isAoOta ? aoFreeText.trim() : grade;
    onSave({ system, grade: finalGrade });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-surface-card rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-5 pb-10 sm:pb-6 animate-[slideUp_0.25s_ease-out] sm:animate-none">
        <div className="w-10 h-1 bg-surface-sunken rounded-full mx-auto mb-5 sm:hidden" />
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-ink">Add classification</h3>
          <button onClick={onClose} className="p-1.5 rounded-full text-ink-faint hover:text-ink hover:bg-surface-sunken transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
          System
        </label>
        <div className="mb-4">
          <BottomSheetPicker
            title="Classification system"
            value={system}
            options={systemOptions}
            onChange={val => { setSystem(val); setGrade(''); setAoType(''); setAoGroup(''); setAoFreeText(''); }}
            placeholder="Select system…"
          />
        </div>

        {isStructuredAoOta && (
          <>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
              Type
            </label>
            <div className="mb-4">
              <BottomSheetPicker
                title="AO/OTA type"
                value={aoType}
                options={AO_OTA_TYPES.map(t => ({ value: t, label: t }))}
                onChange={setAoType}
                placeholder="A / B / C…"
              />
            </div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
              Group
            </label>
            <div className="mb-4">
              <BottomSheetPicker
                title="AO/OTA group"
                value={aoGroup}
                options={AO_OTA_GROUPS.map(g => ({ value: g, label: g }))}
                onChange={setAoGroup}
                placeholder="1 / 2 / 3…"
              />
            </div>
          </>
        )}

        {isAoOta && !isStructuredAoOta && (
          <>
            <label htmlFor="ao-ota-free-text" className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
              AO/OTA code
            </label>
            <input
              id="ao-ota-free-text"
              type="text"
              value={aoFreeText}
              onChange={e => setAoFreeText(e.target.value)}
              placeholder="e.g. 62-B1"
              className="w-full px-4 py-3.5 border border-line rounded-2xl text-base text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent mb-4"
            />
          </>
        )}

        {!isAoOta && system.length > 0 && (
          <>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
              Grade
            </label>
            <div className="mb-4">
              <BottomSheetPicker
                title="Grade"
                value={grade}
                options={gradeOptions.map(g => ({ value: g, label: g }))}
                onChange={setGrade}
                placeholder="Select grade…"
              />
            </div>
          </>
        )}

        <button
          onClick={handleSave}
          disabled={!canSave}
          className="w-full py-3.5 bg-accent hover:bg-accent-pressed disabled:opacity-40 text-white text-sm font-bold rounded-2xl transition-colors"
        >
          Save classification
        </button>
      </div>
    </div>
  );
};

export default AddClassificationSheet;
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/patient/AddClassificationSheet.tsx
git commit -m "feat(patients): add AddClassificationSheet system+grade picker"
```

---

### Task 6: `FractureClassificationSection` — list + wire the two sheets

**Files:**
- Create: `components/patient/FractureClassificationSection.tsx`
- Test: `__tests__/components/FractureClassificationSection.test.tsx`

**Interfaces:**
- Consumes: `AddFractureSheet` (Task 4), `AddClassificationSheet` (Task 5), `FRACTURE_REGIONS` (Task 2)
- Produces: `FractureClassificationSection({ patient, canEdit, onUpdate }): JSX.Element` — default export

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/FractureClassificationSection.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FractureClassificationSection from '../../components/patient/FractureClassificationSection';
import { Patient, PatientStatus, PacStatus, Gender } from '../../types';

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  bed: '5', ward: 'Ortho A', ipNo: 'IP001', name: 'Ravi Kumar', mobile: '9876543210',
  age: 52, gender: Gender.Male, diagnosis: 'Intertrochanteric fracture', comorbidities: [],
  doa: '2024-01-15', pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [], todos: [],
  ...overrides,
});

describe('FractureClassificationSection', () => {
  it('renders nothing when there are no fractures and the user cannot edit', () => {
    const { container } = render(
      <FractureClassificationSection patient={makePatient()} canEdit={false} onUpdate={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "Add fracture" even with zero fractures when the user can edit', () => {
    // Unlike SurgicalHistorySection (where "add another" only makes sense once
    // a first surgery already exists), there's no such gate here — a patient
    // with zero fractures who canEdit should still be able to add their first.
    render(<FractureClassificationSection patient={makePatient()} canEdit onUpdate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /add fracture/i })).toBeInTheDocument();
  });

  it('lists an existing fracture and its classifications', () => {
    const patient = makePatient({
      fractures: [{
        id: 'f1', region: 'nof', side: 'right',
        classifications: [{ system: 'Garden', grade: 'IV' }, { system: 'Pauwels', grade: 'III' }],
      }],
    });
    render(<FractureClassificationSection patient={patient} canEdit onUpdate={vi.fn()} />);
    expect(screen.getByText(/Neck of Femur/i)).toBeInTheDocument();
    expect(screen.getByText(/Garden.*IV/i)).toBeInTheDocument();
    expect(screen.getByText(/Pauwels.*III/i)).toBeInTheDocument();
  });

  it('"Add fracture" creates a new fracture entry via onUpdate', () => {
    const onUpdate = vi.fn();
    render(<FractureClassificationSection patient={makePatient()} canEdit onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: /add fracture/i }));
    fireEvent.click(screen.getByRole('button', { name: /select region/i }));
    fireEvent.click(screen.getByRole('option', { name: /neck of femur/i }));
    fireEvent.click(screen.getByRole('button', { name: /save fracture/i }));

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      ipNo: 'IP001',
      fractures: [expect.objectContaining({ region: 'nof', classifications: [] })],
    }));
  });

  it('"Add classification" appends a classification to the right fracture via onUpdate', () => {
    const onUpdate = vi.fn();
    const patient = makePatient({
      fractures: [{ id: 'f1', region: 'nof', classifications: [] }],
    });
    render(<FractureClassificationSection patient={patient} canEdit onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: /add classification/i }));
    fireEvent.click(screen.getByRole('button', { name: /select system/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Garden' }));
    fireEvent.click(screen.getByRole('button', { name: /select grade/i }));
    fireEvent.click(screen.getByRole('option', { name: 'IV' }));
    fireEvent.click(screen.getByRole('button', { name: /save classification/i }));

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      ipNo: 'IP001',
      fractures: [expect.objectContaining({
        id: 'f1', region: 'nof',
        classifications: [{ system: 'Garden', grade: 'IV' }],
      })],
    }));
  });

  it('does not show "Add fracture" when canEdit is false', () => {
    render(<FractureClassificationSection patient={makePatient({
      fractures: [{ id: 'f1', region: 'nof', classifications: [] }],
    })} canEdit={false} onUpdate={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /add fracture/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- FractureClassificationSection`
Expected: FAIL — `components/patient/FractureClassificationSection.tsx` does not exist yet.

- [ ] **Step 3: Implement the component**

Create `components/patient/FractureClassificationSection.tsx`:

```tsx
/**
 * FractureClassificationSection.tsx — lists a patient's classified fractures
 * and lets a clinician add a fracture or assign a classification to one.
 * Computes the updated `fractures` array locally and saves it through the
 * generic `onUpdate` (= PatientContext.updatePatient) — same pattern
 * ComorbiditiesSection uses for `comorbidities`, no dedicated context
 * function needed since there's no archive/supersede behavior here.
 */
import React, { useState } from 'react';
import { Bone, Plus, X } from 'lucide-react';
import { Patient, Fracture } from '../../types';
import { FRACTURE_REGIONS } from '../../utils/fractureClassifications';
import { generateId } from '../../utils/sanitize';
import AddFractureSheet from './AddFractureSheet';
import AddClassificationSheet from './AddClassificationSheet';

interface Props {
  patient: Patient;
  canEdit: boolean;
  onUpdate: (patient: Patient) => void;
}

const regionLabel = (key: string) => FRACTURE_REGIONS.find(r => r.key === key)?.label ?? key;

const FractureClassificationSection: React.FC<Props> = ({ patient, canEdit, onUpdate }) => {
  const [showAddFracture, setShowAddFracture] = useState(false);
  const [classifyingFractureId, setClassifyingFractureId] = useState<string | null>(null);

  const fractures = patient.fractures ?? [];
  if (fractures.length === 0 && !canEdit) return null;

  const saveFractures = (next: Fracture[]) => onUpdate({ ...patient, fractures: next });

  const handleAddFracture = (region: string, side?: 'left' | 'right' | 'bilateral') => {
    saveFractures([...fractures, { id: generateId(), region, side, classifications: [] }]);
  };

  const handleRemoveFracture = (id: string) => {
    saveFractures(fractures.filter(f => f.id !== id));
  };

  const handleAddClassification = (fractureId: string, entry: { system: string; grade: string }) => {
    saveFractures(fractures.map(f =>
      f.id === fractureId ? { ...f, classifications: [...f.classifications, entry] } : f,
    ));
  };

  const handleRemoveClassification = (fractureId: string, index: number) => {
    saveFractures(fractures.map(f =>
      f.id === fractureId ? { ...f, classifications: f.classifications.filter((_, i) => i !== index) } : f,
    ));
  };

  const classifyingFracture = fractures.find(f => f.id === classifyingFractureId);
  const classifyingRegion = classifyingFracture ? FRACTURE_REGIONS.find(r => r.key === classifyingFracture.region) : undefined;

  return (
    <div className="bg-surface-card rounded-2xl shadow-sm border border-line px-4 py-3 mb-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint mb-2 flex items-center gap-1.5">
        <Bone className="w-3.5 h-3.5" /> Fracture classification
      </p>

      {fractures.length > 0 && (
        <ul className="space-y-2.5 mb-3">
          {fractures.map(f => (
            <li key={f.id} className="border border-line rounded-xl p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-ink">
                  {regionLabel(f.region)}{f.side ? ` (${f.side})` : ''}
                </span>
                {canEdit && (
                  <button onClick={() => handleRemoveFracture(f.id)} aria-label={`Remove ${regionLabel(f.region)}`} className="text-ink-faint hover:text-vital-critical-fg">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {f.classifications.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {f.classifications.map((c, i) => (
                    <span key={`${c.system}-${i}`} className="inline-flex items-center gap-1 px-2 py-0.5 bg-surface-sunken text-ink-muted rounded text-xs">
                      {c.system} {c.grade}
                      {canEdit && (
                        <button onClick={() => handleRemoveClassification(f.id, i)} aria-label={`Remove ${c.system} ${c.grade}`} className="hover:text-vital-critical-fg">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {canEdit && (
                <button
                  onClick={() => setClassifyingFractureId(f.id)}
                  className="flex items-center gap-1 text-xs font-bold text-accent-fg hover:text-accent-pressed"
                >
                  <Plus className="w-3 h-3" /> Add classification
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <button
          onClick={() => setShowAddFracture(true)}
          className="flex items-center justify-center gap-1.5 min-h-[44px] w-full px-3 py-2 bg-accent-soft rounded-xl text-xs font-bold text-accent-fg hover:bg-accent hover:text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add fracture
        </button>
      )}

      {showAddFracture && (
        <AddFractureSheet onSave={handleAddFracture} onClose={() => setShowAddFracture(false)} />
      )}

      {classifyingFracture && classifyingRegion && (
        <AddClassificationSheet
          region={classifyingRegion}
          onSave={entry => handleAddClassification(classifyingFracture.id, entry)}
          onClose={() => setClassifyingFractureId(null)}
        />
      )}
    </div>
  );
};

export default FractureClassificationSection;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- FractureClassificationSection`
Expected: PASS (all 5 tests green).

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/patient/FractureClassificationSection.tsx __tests__/components/FractureClassificationSection.test.tsx
git commit -m "feat(patients): add FractureClassificationSection"
```

---

### Task 7: Wire into Patient Detail

**Files:**
- Modify: `components/PatientDetail.tsx`

**Interfaces:**
- Consumes: `FractureClassificationSection` (Task 6)

- [ ] **Step 1: Import the new section**

Add this import near the other `./patient/*` imports (currently `import SurgicalHistorySection from './patient/SurgicalHistorySection';` at line 18):

```ts
import FractureClassificationSection from './patient/FractureClassificationSection';
```

- [ ] **Step 2: Render it after SurgicalHistorySection**

Find (currently line 433):

```tsx
      <SurgicalHistorySection patient={patient} canEdit={canEdit} onUpdate={updatePatient} onAddSurgery={addSurgery} />
```

Add directly after it:

```tsx

      {/* ─── FRACTURE CLASSIFICATION ─────────────────────────────────── */}
      <FractureClassificationSection patient={patient} canEdit={canEdit} onUpdate={updatePatient} />
```

- [ ] **Step 3: Typecheck, lint, and run the full test suite**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test`
Expected: no errors, full suite green.

- [ ] **Step 4: Commit**

```bash
git add components/PatientDetail.tsx
git commit -m "feat(patients): wire FractureClassificationSection into Patient Detail"
```

---

### Task 8: Discharge summary

**Files:**
- Modify: `components/DischargeSummary.tsx`

**Interfaces:**
- Consumes: `FRACTURE_REGIONS` (Task 2), `Patient.fractures` (Task 1)

This file has two independent render paths for the same data (the on-screen editable view, and inline jsPDF generation for the download) — both need the new line, matching how `patient.procedure` already appears in both.

- [ ] **Step 1: Add a formatting helper**

Near the top of `components/DischargeSummary.tsx` (after the existing imports), add:

```ts
import { FRACTURE_REGIONS } from '../utils/fractureClassifications';

/** "Neck of Femur (Right): Garden IV, Pauwels III" per fracture, joined with "; ". */
function formatFractures(patient: Patient): string {
  return (patient.fractures ?? []).map(f => {
    const label = FRACTURE_REGIONS.find(r => r.key === f.region)?.label ?? f.region;
    const side = f.side ? ` (${f.side})` : '';
    const classifications = f.classifications.map(c => `${c.system} ${c.grade}`).join(', ');
    return `${label}${side}${classifications ? `: ${classifications}` : ''}`;
  }).join('; ');
}
```

(If `Patient` isn't already imported in this file, add `import { Patient } from '../types';` — check the existing imports first, since a component this size likely already imports it for its props.)

- [ ] **Step 2: Add to the PDF generation path**

Find (currently lines 763-766):

```ts
    if (patient.procedure) {
      sectionHeader('PROCEDURE / OPERATION DONE');
      bodyText(patient.procedure + (patient.dos ? `  (Date: ${patient.dos})` : ''));
    }
```

Add directly after it:

```ts

    if ((patient.fractures ?? []).length > 0) {
      sectionHeader('FRACTURE CLASSIFICATION');
      bodyText(formatFractures(patient));
    }
```

- [ ] **Step 3: Add to the on-screen DocField view**

Find (currently lines 958-964):

```tsx
          {patient.procedure && (
            <DocField
              label={`Procedure / Operation Done${patient.dos ? ` (Date: ${patient.dos})` : ''}`}
              value={patient.procedure}
              readOnly
            />
          )}
```

Add directly after it:

```tsx
          {(patient.fractures ?? []).length > 0 && (
            <DocField
              label="Fracture Classification"
              value={formatFractures(patient)}
              readOnly
            />
          )}
```

- [ ] **Step 4: Typecheck, lint, and run the full test suite**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test`
Expected: no errors, full suite green.

- [ ] **Step 5: Commit**

```bash
git add components/DischargeSummary.tsx
git commit -m "feat(patients): show fracture classification in discharge summary"
```

---

### Task 9: Referral letter

**Files:**
- Modify: `components/ReferralLetter.tsx`

**Interfaces:**
- Consumes: `FRACTURE_REGIONS` (Task 2), `Patient.fractures` (Task 1)

This file builds one editable text blob (`clinicalSummary`) that feeds both the on-screen view and the PDF — a single edit point covers both, unlike Task 8.

- [ ] **Step 1: Add the same formatting helper**

Near the top of `components/ReferralLetter.tsx` (after the existing imports), add:

```ts
import { FRACTURE_REGIONS } from '../utils/fractureClassifications';

/** "Neck of Femur (Right): Garden IV, Pauwels III" per fracture, joined with "; ". */
function formatFractures(patient: Patient): string {
  return (patient.fractures ?? []).map(f => {
    const label = FRACTURE_REGIONS.find(r => r.key === f.region)?.label ?? f.region;
    const side = f.side ? ` (${f.side})` : '';
    const classifications = f.classifications.map(c => `${c.system} ${c.grade}`).join(', ');
    return `${label}${side}${classifications ? `: ${classifications}` : ''}`;
  }).join('; ');
}
```

- [ ] **Step 2: Add a line to the initial `clinicalSummary`**

Find (currently lines 24-29):

```ts
  const [clinicalSummary, setClinicalSummary] = useState(
    `${patient.name}, ${patient.age}Y/${patient.gender}, IP No: ${patient.ipNo}\n` +
    `Admitted: ${patient.doa}\nDiagnosis: ${patient.diagnosis}\n` +
    (patient.comorbidities?.length ? `Comorbidities: ${patient.comorbidities.join(', ')}\n` : '') +
    (patient.procedure ? `Procedure: ${patient.procedure}\n` : '')
  );
```

Change to:

```ts
  const [clinicalSummary, setClinicalSummary] = useState(
    `${patient.name}, ${patient.age}Y/${patient.gender}, IP No: ${patient.ipNo}\n` +
    `Admitted: ${patient.doa}\nDiagnosis: ${patient.diagnosis}\n` +
    (patient.comorbidities?.length ? `Comorbidities: ${patient.comorbidities.join(', ')}\n` : '') +
    (patient.procedure ? `Procedure: ${patient.procedure}\n` : '') +
    ((patient.fractures ?? []).length > 0 ? `Fracture Classification: ${formatFractures(patient)}\n` : '')
  );
```

- [ ] **Step 3: Typecheck, lint, and run the full test suite**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test`
Expected: no errors, full suite green.

- [ ] **Step 4: Commit**

```bash
git add components/ReferralLetter.tsx
git commit -m "feat(patients): show fracture classification in referral letter"
```

---

## Post-implementation checklist

- [ ] Apply the migration to the actual Supabase project — Task 3 only creates the file.
- [ ] Manual smoke test: open a patient, add a neck-of-femur fracture, assign Garden IV + Pauwels III + AO/OTA (structured picker: 31-B2), confirm all three show as chips; open discharge summary and referral letter, confirm the line appears; remove one classification, confirm it disappears.
- [ ] Final full run: `pnpm tsc --noEmit && pnpm lint && pnpm test` — all green.
- [ ] Push the branch and open a PR (per this project's merge policy — patient data paths always wait for human review, no self-merge).
