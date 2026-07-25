import { describe, it, expect } from 'vitest';
import { FRACTURE_REGIONS, GUSTILO_ANDERSON, buildAoOtaCode, REGION_GROUPS } from '../utils/fractureClassifications';

describe('FRACTURE_REGIONS', () => {
  it('has 28 regions, each with a unique key and at least one system or an AO/OTA mapping', () => {
    expect(FRACTURE_REGIONS.length).toBe(28);
    const keys = FRACTURE_REGIONS.map(r => r.key);
    expect(new Set(keys).size).toBe(keys.length); // no duplicate keys
    FRACTURE_REGIONS.forEach(r => {
      // A region may have zero eponymous systems (e.g. a plain shaft fracture
      // has no widely-used named classification), but it must then at least
      // offer the structured AO/OTA mapping — never neither.
      if (r.systems.length === 0) {
        expect(r.aoOtaBone).toBeDefined();
      } else {
        r.systems.forEach(s => expect(s.grades.length).toBeGreaterThan(0));
      }
    });
  });

  it('every group name in a region appears in REGION_GROUPS', () => {
    FRACTURE_REGIONS.forEach(r => expect(REGION_GROUPS).toContain(r.group));
  });

  it('exactly 16 regions have structured AO/OTA metadata (the four classic long bones, incl. the ankle\'s distinct malleolar segment)', () => {
    const withAo = FRACTURE_REGIONS.filter(r => r.aoOtaBone);
    expect(withAo.length).toBe(16);
    withAo.forEach(r => {
      expect(['1', '2', '3', '4']).toContain(r.aoOtaBone!.boneCode);
      expect(['1', '2', '3', '4']).toContain(r.aoOtaBone!.segment);
    });
  });

  it('neck of femur has Garden and Pauwels, with AO/OTA bone=3 (femur) segment=1 (proximal)', () => {
    const nof = FRACTURE_REGIONS.find(r => r.key === 'nof');
    expect(nof).toBeDefined();
    expect(nof!.systems.map(s => s.name)).toEqual(expect.arrayContaining(['Garden', 'Pauwels']));
    expect(nof!.systems.find(s => s.name === 'Garden')!.grades).toEqual(['I', 'II', 'III', 'IV']);
    expect(nof!.aoOtaBone).toEqual({ boneCode: '3', segment: '1' });
  });

  it('ankle uses the distinct malleolar segment "4", not pilon\'s segment "3"', () => {
    // Regression pin: this exact region entry was twice found reverted to
    // segment '3' during implementation (matching pilon, anatomically
    // adjacent but a different official AO/OTA segment). The generic
    // buildAoOtaCode tests above only prove the composer function works —
    // they don't catch this region's OWN data entry regressing.
    const ankle = FRACTURE_REGIONS.find(r => r.key === 'ankle');
    expect(ankle).toBeDefined();
    expect(ankle!.aoOtaBone).toEqual({ boneCode: '4', segment: '4' });
    const pilon = FRACTURE_REGIONS.find(r => r.key === 'pilon');
    expect(pilon!.aoOtaBone).toEqual({ boneCode: '4', segment: '3' });
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
    expect(buildAoOtaCode({ boneCode: '4', segment: '3' }, 'C', '1')).toBe('43-C1');
  });

  it('supports segment "4" for the ankle/malleolar special case', () => {
    // Official AO/OTA numbers the malleolar (ankle) segment "44", distinct
    // from "43" (distal tibia/pilon) — both anatomically near the distal
    // tibia/fibula, but numbered as different segments.
    expect(buildAoOtaCode({ boneCode: '4', segment: '4' }, 'B', '2')).toBe('44-B2');
  });
});
