import { describe, it, expect, vi, beforeEach } from 'vitest';

// Force the native (Capacitor) path so we can capture the generated PDF
// instead of jsPDF trying to trigger a browser download in jsdom. This is
// exactly the path the previous window.open()+window.print() implementation
// never exercised — that's the bug this file replaces.
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

import { exportAdmissionListPDF } from '../utils/exportAdmissionList';
import { Patient, PatientStatus, PacStatus, Gender } from '../types';

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  ipNo: 'IP001',
  name: 'Ravi Kumar',
  mobile: '9876543210',
  age: 52,
  gender: Gender.Male,
  ward: 'Ward 22',
  bed: '5',
  diagnosis: 'Intertrochanteric fracture femur — LEFT',
  comorbidities: [],
  doa: '2026-07-26',
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

describe('exportAdmissionListPDF', () => {
  it('generates a PDF and hands it to the native share sheet', async () => {
    await exportAdmissionListPDF({
      source: 'OPD',
      patients: [makePatient(), makePatient({ ipNo: 'IP002', name: 'Dasan' })],
      dateLabel: '26/07/2026',
      unit: 'OR 2',
    });

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const call = writeFileMock.mock.calls[0][0];
    // Base64 PDF payload of a plausible size (a valid empty PDF is ~1 KB)
    expect(call.data.length).toBeGreaterThan(2000);
    expect(call.path).toMatch(/^admission-list-opd-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(shareMock).toHaveBeenCalledTimes(1);
  });

  it('sanitises the source name in the file name', async () => {
    await exportAdmissionListPDF({
      source: 'Casualty',
      patients: [makePatient()],
      dateLabel: '26/07/2026',
    });
    expect(writeFileMock.mock.calls[0][0].path).toMatch(/^admission-list-casualty-/);
  });
});
