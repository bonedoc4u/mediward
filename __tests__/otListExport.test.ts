import { describe, it, expect, vi, beforeEach } from 'vitest';

const writeFileMock = vi.hoisted(() => vi.fn());
vi.mock('xlsx-js-style', async () => {
  // xlsx-js-style is CJS-only (no "exports"/"module" package.json field), so
  // vi.importActual doesn't flatten it to named exports the way Vite's normal
  // CJS interop does for the real import elsewhere — it comes back as
  // { default, 'module.exports' } only. Spread the .default to keep the real
  // XLSX.utils.* cell-building/styling logic while only intercepting writeFile.
  const actual = await vi.importActual<any>('xlsx-js-style');
  return { ...actual.default, writeFile: writeFileMock };
});

const saveMock = vi.hoisted(() => vi.fn());
const autoTableMock = vi.hoisted(() => vi.fn());
vi.mock('jspdf', () => ({
  // A regular `function` (not an arrow function) is required here: the
  // component calls `new jsPDF(...)`, and mockImplementation only behaves as
  // a constructor when its implementation itself is constructible.
  default: vi.fn().mockImplementation(function () {
    return {
      setFont: vi.fn(),
      setFontSize: vi.fn(),
      text: vi.fn(),
      internal: { pageSize: { getWidth: () => 297 } },
      save: saveMock,
    };
  }),
}));
vi.mock('jspdf-autotable', () => ({ default: autoTableMock }));

import { exportOTListToExcel, exportOTListToPDF, OTListExportMeta } from '../utils/otListExport';
import { OTPatient } from '../utils/otListTypes';

const makeEntry = (overrides: Partial<OTPatient> = {}): OTPatient => ({
  id: '1', sequence: 1, ipNo: 'IP001', name: 'Ravi Kumar', age: '52', gender: 'M',
  ward: '22', unit: 'OR1', diagnosis: 'Fracture femur', procedure: 'DHS fixation',
  side: '', anesthesia: '', cArm: 'No', implants: '', remarks: '',
  category: 'TABLE 1', otType: 'Major',
  ...overrides,
});

const meta: OTListExportMeta = {
  hospitalName: 'Test Hospital', department: 'Orthopaedics',
  selectedDate: '2026-08-06', surgeon: 'Dr. Rao', surgeonUnit: 'OR1', otTime: '8.00AM',
};

beforeEach(() => {
  writeFileMock.mockClear();
  saveMock.mockClear();
  autoTableMock.mockClear();
});

describe('exportOTListToExcel', () => {
  it('writes a workbook named after the tab and date', () => {
    exportOTListToExcel([makeEntry()], 'Major', meta);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock.mock.calls[0][1]).toBe('Major_OT_List_2026-08-06.xlsx');
  });
});

describe('exportOTListToPDF', () => {
  it('saves a PDF named after the tab and date', () => {
    exportOTListToPDF([makeEntry()], 'Major', meta);
    expect(autoTableMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith('Major_OT_List_2026-08-06.pdf');
  });
});
