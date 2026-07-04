import { describe, it, expect, vi, beforeEach } from 'vitest';

// Force the native (Capacitor) path so we can capture the generated PDF
// instead of jsPDF trying to trigger a browser download in jsdom.
const writeFileMock = vi.hoisted(() => vi.fn().mockResolvedValue({ uri: 'file:///cache/test.pdf' }));
const shareMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: writeFileMock },
  Directory: { Cache: 'CACHE' },
}));
vi.mock('@capacitor/share', () => ({
  Share: { share: shareMock },
}));

import { exportWardListPDF } from '../utils/exportWardList';
import { Patient, PatientStatus, PacStatus, Gender } from '../types';

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  ipNo: 'IP001',
  name: 'Ravi Kumar',
  mobile: '9876543210',
  age: 52,
  gender: Gender.Male,
  ward: 'Ortho A',
  bed: '5',
  diagnosis: 'Intertrochanteric fracture femur — LEFT',
  comorbidities: ['DM', 'HTN'],
  doa: '2026-07-01',
  pacStatus: PacStatus.Fit,
  patientStatus: PatientStatus.Fit,
  dailyRounds: [],
  investigations: [],
  labResults: [],
  todos: [],
  ...overrides,
});

beforeEach(() => {
  writeFileMock.mockClear();
  shareMock.mockClear();
});

describe('exportWardListPDF', () => {
  it('generates a PDF and hands it to the native share sheet', async () => {
    await exportWardListPDF({
      sections: [
        { name: 'Ortho A', patients: [makePatient(), makePatient({ ipNo: 'IP002', bed: '2', name: 'Dasan' })] },
        { name: 'ICU', patients: [makePatient({ ipNo: 'IP003', bed: '1', ward: 'ICU' })] },
      ],
      hospitalName: 'GMC Test',
      department: 'DEPARTMENT OF ORTHOPAEDICS',
      scopeLabel: 'All',
    });

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const call = writeFileMock.mock.calls[0][0];
    // Base64 PDF payload of a plausible size (a valid empty PDF is ~1 KB)
    expect(call.data.length).toBeGreaterThan(2000);
    expect(call.path).toMatch(/^ward-list-all-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(shareMock).toHaveBeenCalledTimes(1);
  });

  it('sanitises the ward name in the file name', async () => {
    await exportWardListPDF({
      sections: [{ name: 'Post-Op Ward (Male)', patients: [makePatient()] }],
      scopeLabel: 'Post-Op Ward (Male)',
    });
    expect(writeFileMock.mock.calls[0][0].path).toMatch(/^ward-list-post-op-ward-male-/);
  });
});
