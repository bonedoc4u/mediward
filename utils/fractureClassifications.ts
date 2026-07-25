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
  /** 1 = Proximal, 2 = Diaphyseal, 3 = Distal. Tibia/fibula also has a distinct
   *  4 = Malleolar (ankle) segment — official AO/OTA numbers the malleolar
   *  segment "44", separate from "43" (distal tibia/pilon), even though both
   *  sit anatomically near the distal tibia/fibula. */
  segment: '1' | '2' | '3' | '4';
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
    // Malleolar segment is "4" (44-series), distinct from pilon's "3" (43-series).
    aoOtaBone: { boneCode: '4', segment: '4' },
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
    systems: [{ name: 'Anderson-D\'Alonzo', grades: ['I', 'II', 'III'] }],
  },
  {
    key: 'c2_hangman', label: 'C2 Traumatic Spondylolisthesis (Hangman\'s)', group: 'Spine',
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
