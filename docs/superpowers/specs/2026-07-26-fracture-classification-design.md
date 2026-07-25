# Fracture Classification — Design Spec

**Date:** 2026-07-26
**Status:** Approved by user, ready for implementation planning

## Context

Orthopaedic diagnoses in MediWard are currently a single free-text `diagnosis` field
on `Patient`. There is no structured way to record which standard classification
system(s) apply to a fracture (Garden, Weber, Schatzker, AO/OTA, etc.), which matters
for handover, discharge summaries, and clinical communication with other services.

This adds a structured, multi-fracture, multi-classification-per-fracture system,
covering the standard eponymous classifications for the fracture sites an ortho
service actually sees, plus the universal AO/OTA system as an add-on everywhere.

## Goals

- Record one or more distinct fractures per patient (e.g. a polytrauma patient with
  both a neck-of-femur fracture and a distal radius fracture).
- Each fracture can carry multiple classification assignments simultaneously (e.g.
  a neck-of-femur fracture classified as both Garden IV *and* Pauwels III *and*
  AO/OTA 31-B3 at once) — these are complementary systems doctors commonly record
  together, not mutually exclusive alternatives.
- AO/OTA is assignable on every fracture regardless of region, alongside whatever
  eponymous systems apply there.
- Guided assignment flow: pick the fracture's region → pick a system valid for that
  region → pick the grade. Prevents assigning a mismatched system to the wrong bone.
- Assigned classifications are visible in Patient Detail and travel with the
  patient's paperwork (discharge summary and referral letter — each of these
  generates its own PDF inline; there is no separate third "PDF export" surface
  for patient records).

## Non-goals

- No admin customization of the classification reference data (which systems exist,
  their grades) — these are universal medical standards, not hospital-specific
  config like ward names or lab types. The reference dataset is a static file, not
  an editable table.
- Full official AO/OTA coding (bone-segment-type-group-subgroup-qualifier) is not
  modeled for every anatomical region. See "AO/OTA modeling" below for the precise
  scope boundary.
- No classification history/versioning — a fracture's classifications can be edited
  in place (unlike `priorSurgeries`, there's no "supersede and archive" concept
  here; a classification is either assigned or it isn't).

## Reference dataset (confirmed with user)

Static data, one entry per region, each listing the eponymous systems and their
grades that apply there. ~25 regions, ~30 systems total:

| Region | Systems (grades) |
|---|---|
| Clavicle | Allman (I midshaft · II distal · III medial) · Neer (distal clavicle, I–V) |
| Proximal humerus | Neer (1-/2-/3-/4-part) |
| Humeral shaft | *(AO/OTA only)* |
| Distal humerus | Milch (lateral condyle, I/II) · Jakob (paediatric lateral condyle) |
| Supracondylar humerus (paediatric) | Gartland (I · II · III) |
| Radial head | Mason (I · II · III · IV) |
| Olecranon | Mayo (I · II · III, each A/B) |
| Monteggia fracture-dislocation | Bado (I · II · III · IV) |
| Distal radius | Frykman (I–VIII) · Fernandez (mechanism-based) · Melone (4-part articular) |
| Scaphoid | Herbert (A1/A2 · B1–B4 · C · D1/D2) · Mayo (proximal/waist/distal) |
| Pelvic ring | Young-Burgess (LC I–III · APC I–III · VS · CM) · Tile (A · B · C) |
| Acetabulum | Judet-Letournel (post. wall, post. column, ant. wall, ant. column, transverse, post. column+wall, transverse+post. wall, T-shaped, ant. column+post. hemitransverse, both-column) |
| Neck of femur | Garden (I–IV) · Pauwels (I · II · III) |
| Intertrochanteric | Boyd-Griffin (I–IV) · Evans (I–IV, stable/unstable) |
| Subtrochanteric | Russell-Taylor (IA/IB · IIA/IIB) · Seinsheimer (I–V) |
| Femoral shaft | Winquist-Hansen (comminution 0–IV) |
| Distal femur | Su (supracondylar, I–III) |
| Tibial plateau | Schatzker (I–VI) |
| Tibial shaft | *(AO/OTA only, + Gustilo-Anderson if open)* |
| Pilon (distal tibia) | Rüedi-Allgower (I · II · III) |
| Ankle | Weber/Danis-Weber (A · B · C) · Lauge-Hansen (SA · SER · PA · PER) |
| Talus (neck) | Hawkins (I · II · III · IV) |
| Calcaneus | Sanders (I–IV, CT-based) · Essex-Lopresti (tongue-type / joint depression) |
| Thoracolumbar spine | Denis (3-column) · AO Spine (A · B · C) |
| C1 (atlas) | Landells/Jefferson |
| C2 odontoid | Anderson-D'Alonzo (I · II · III) |
| C2 traumatic spondylolisthesis | Levine-Edwards (I · II · IIA · III) |
| Subaxial cervical | Allen-Ferguson |
| Any region | Gustilo-Anderson (I · II · IIIA · IIIB · IIIC) — offered whenever "open fracture" applies, not region-gated |
| Every region above | + AO/OTA (see below) |

### AO/OTA modeling (scope boundary)

Official AO/OTA classification has a full bone-segment-type-group-subgroup-qualifier
hierarchy. Modeling that completely and correctly for all ~25 regions above risks
getting obscure codes wrong. Scope split:

- **The four classic long bones** (humerus, radius/ulna, femur, tibia/fibula) —
  structured picker: bone (auto-set from region) + segment (1 proximal / 2
  diaphyseal / 3 distal, auto-set from region where unambiguous) + type (A simple /
  B wedge / C complex) + group (1/2/3), composed into the standard code (e.g.
  `31-B2` = femur, proximal segment, wedge type, group 2). This is the well-known,
  confidently-correct core of AO/OTA.
- **Every other region** (pelvis, acetabulum, spine, clavicle, hand/foot bones) —
  AO/OTA is offered as a **free-text field** (the doctor types the code if they
  know it) rather than a structured picker with hardcoded numeric groups I'm less
  certain about for these areas.

## Data model

```ts
export interface FractureClassificationEntry {
  system: string;   // e.g. "Garden", "AO/OTA"
  grade: string;     // e.g. "IV", "31-B3"
}

export interface Fracture {
  id: string;
  region: string;               // key into the static reference dataset, e.g. "nof"
  side?: 'left' | 'right' | 'bilateral';
  classifications: FractureClassificationEntry[];
}

// on Patient:
fractures?: Fracture[];
```

One new field, purely additive — same shape of change as `priorSurgeries`.

**DB migration** (additive, no RLS change — same `patients` table, same existing
tenant-scoped policies apply automatically):

```sql
alter table patients add column if not exists fractures jsonb;
```

## Behavior

### Adding a fracture

New action in Patient Detail: "+ Add fracture" opens a region picker (the ~25
regions above, grouped by anatomical area for a long list — e.g. Upper Limb /
Pelvis & Hip / Lower Limb / Spine), then an optional side picker (left/right/
bilateral, skippable for axial regions like spine/pelvis). Creates a `Fracture`
entry with an empty `classifications` array.

### Assigning a classification to a fracture

Within a fracture's card: "+ Add classification" opens a system picker scoped to
that fracture's region (its eponymous systems from the reference dataset, plus
Gustilo-Anderson always available, plus AO/OTA always available) → then the grade
picker for whichever system was chosen (structured list for eponymous systems and
the four long-bone AO/OTA cases; free text for AO/OTA elsewhere). Appends to that
fracture's `classifications` array — this is what lets one fracture carry Garden +
Pauwels + AO/OTA simultaneously.

### Editing / removing

Both fractures and individual classification entries within a fracture can be
removed (no archival/history — see Non-goals). No in-place editing of a grade;
remove and re-add.

## UI changes

**Patient Detail — new "Fracture Classification" section**, same card style as
`ComorbiditiesSection`/`SurgicalHistorySection`: lists each fracture (region + side
+ its classification chips), "+ Add fracture", and per-fracture "+ Add
classification". Uses the existing `BottomSheetPicker` component for the
region/system/grade pickers (same component already used for Modality and PAC
Status elsewhere).

**Exports** — discharge summary and referral letter (both on-screen and their
inline PDF generation) gain a fracture-classification line per fracture (e.g.
"Neck of Femur (Right): Garden IV, Pauwels III, AO/OTA 31-B3") when
`patient.fractures` is non-empty.

## Affected files

| File | Change |
|---|---|
| `supabase/migrations/*.sql` (new) | add `fractures jsonb` column to `patients` |
| `types.ts` | `FractureClassificationEntry`, `Fracture`, `Patient.fractures?` |
| `utils/fractureClassifications.ts` (new) | static reference dataset: regions, their eponymous systems + grades, AO/OTA long-bone metadata |
| `services/patientService.ts` | `PatientRow.fractures`, `rowToPatient`/`patientToRow` mapping, add to both SELECT field-list constants |
| `components/patient/FractureClassificationSection.tsx` (new) | list + "Add fracture" + per-fracture "Add classification" |
| `components/patient/AddFractureSheet.tsx` (new) | region + side picker |
| `components/patient/AddClassificationSheet.tsx` (new) | system + grade picker (structured or free-text AO/OTA per the scope boundary above) |
| `components/PatientDetail.tsx` | wire in the new section |
| `components/DischargeSummary.tsx`, `components/ReferralLetter.tsx` | each file generates both its on-screen view and its own PDF inline (no separate shared PDF util) — render fracture-classification lines in both when `patient.fractures` is present |

## Testing

- Reference dataset: a pure lookup, no logic to unit test beyond a sanity check
  (every region has at least one system, AO/OTA long-bone metadata covers exactly
  the 4 bones).
- Component tests for `FractureClassificationSection` (add fracture, add
  classification to a fracture, remove either) following the same
  `@testing-library/react` pattern as `SurgicalHistorySection.test.tsx`.
- Export tests: discharge summary / referral letter include the expected line
  when `fractures` is present, omit the section when absent.
