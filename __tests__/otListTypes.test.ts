import { describe, it, expect } from 'vitest';
import { getOTTypeForDate, getTableOptionsForType, getDefaultCategoryForType, PENDING_ID_PREFIX, OTPatient } from '../utils/otListTypes';

describe('PENDING_ID_PREFIX', () => {
  it('is the shared prefix pending-card drag ids are built from and parsed with', () => {
    // PendingSurgeryPanel builds `${PENDING_ID_PREFIX}${ipNo}`; OTListManagement's
    // handleDragEnd/DragOverlay parse it back the same way. Pinning the value
    // here means a future rename of the constant's contents shows up as a
    // failing test instead of silently breaking assign-by-drag.
    expect(PENDING_ID_PREFIX).toBe('pending-');
  });
});

describe('getOTTypeForDate', () => {
  it('returns Major on the unit\'s major OT day', () => {
    // OR1: admit Mon, major Thu, minor Wed (see utils/otSchedule.ts UNIT_SCHEDULE)
    expect(getOTTypeForDate('OR1', '2026-08-06')).toBe('Major'); // a Thursday
  });

  it('returns Minor on the unit\'s minor OT day', () => {
    expect(getOTTypeForDate('OR1', '2026-08-05')).toBe('Minor'); // a Wednesday
  });

  it('returns EOT on the unit\'s admission day', () => {
    expect(getOTTypeForDate('OR1', '2026-08-03')).toBe('EOT'); // a Monday
  });

  it('returns null for an unknown unit', () => {
    expect(getOTTypeForDate('NOT-A-UNIT', '2026-08-03')).toBeNull();
  });
});

describe('getTableOptionsForType', () => {
  it('returns two tables for Major', () => {
    expect(getTableOptionsForType('Major')).toEqual(['TABLE 1', 'TABLE 2']);
  });

  it('returns two tables for Minor', () => {
    expect(getTableOptionsForType('Minor')).toEqual(['SPINAL TABLE', 'LOCAL TABLE']);
  });

  it('returns one table for EOT', () => {
    expect(getTableOptionsForType('EOT')).toEqual(['SPINAL TABLE']);
  });
});

describe('getDefaultCategoryForType', () => {
  it('returns the first table option for the given type', () => {
    expect(getDefaultCategoryForType('Major')).toBe('TABLE 1');
    expect(getDefaultCategoryForType('Minor')).toBe('SPINAL TABLE');
    expect(getDefaultCategoryForType('EOT')).toBe('SPINAL TABLE');
  });
});

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
