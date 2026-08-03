# OT List Pending Panel & Drag-to-Assign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent pending-surgery panel to the OT List Management page, with drag-(or tap-)to-assign onto Major/Minor/EOT category lists, while splitting the 1,024-line `OTListManagement.tsx` into focused pieces.

**Architecture:** The pending panel's cards become a second draggable source inside the same `@dnd-kit` `DndContext` already used for in-list reordering. Category tables become explicit droppable zones (`useDroppable`) so drops land reliably even on empty categories. One shared pure function builds a new `OTPatient` entry from a `Patient`, used by both the existing "add" path and the new drag path, so they can never diverge.

**Tech Stack:** React 19, TypeScript strict, `@dnd-kit/core` + `@dnd-kit/sortable` (already a dependency), Tailwind 4, Vitest + `@testing-library/react`.

## Global Constraints

- TypeScript strict mode; `pnpm tsc --noEmit` must pass after every task.
- `pnpm lint` (`eslint . --max-warnings 0`) must pass after every task.
- No component file over ~250 lines (the reason for this split).
- pnpm only — never `npm`/`yarn`.
- Vitest globals are enabled (`globals: true` in `vite.config.ts`), but this codebase's existing test files still import `describe`/`it`/`expect`/`vi` explicitly — match that convention.
- When mocking a context hook (`usePatients`, `useAuth`, `useConfig`, etc.) in a test, return **stable object/array references**, not a fresh literal on every call — an unstable mock previously caused an infinite-render-loop crash that took down the whole Vitest worker process in this exact test suite (`__tests__/contexts/UIContext.test.tsx`).
- Commit convention: one logical change per commit, message like `feat(ot-list): extract Excel/PDF export to utils/otListExport.ts`.
- Every new/extracted pure-logic file gets a same-named test file; UI-only behavior (styling, drag gestures themselves) is verified manually, not simulated in tests — simulating `@dnd-kit` gestures exercises the library more than this project's own code.

---

### Task 1: Extract shared OT-list types and pure helpers

**Files:**
- Create: `utils/otListTypes.ts`
- Modify: `components/OTListManagement.tsx:39-69` (remove the extracted definitions, import from the new file)
- Test: `__tests__/otListTypes.test.ts`

**Interfaces:**
- Produces: `OTPatient` interface, `OTType` type (`'Major' | 'Minor' | 'EOT'`), `getOTTypeForDate(unit: string, dateStr: string): OTType | null`, `getTableOptionsForType(otType: OTType): string[]`, `getDefaultCategoryForType(otType: OTType): string` — all later tasks import these from `utils/otListTypes.ts`.

This is a pure move — no behavior change. `components/OTListManagement.tsx` currently defines these inline (lines 39-69) as `OTPatient`, `OTType`, `getOTTypeForDate`, plus later (lines 233-239) `getTableOptions`/`getDefaultCategory`, which default their `tab` parameter to the component's `activeTab` closure variable. As standalone exported functions they need an explicit required parameter instead — every call site in the file changes from `getTableOptions()` to `getTableOptionsForType(activeTab)` (and same for `getDefaultCategory()` → `getDefaultCategoryForType(activeTab)`).

- [ ] **Step 1: Write the failing test**

Create `__tests__/otListTypes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getOTTypeForDate, getTableOptionsForType, getDefaultCategoryForType } from '../utils/otListTypes';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run __tests__/otListTypes.test.ts`
Expected: FAIL with "Cannot find module '../utils/otListTypes'".

- [ ] **Step 3: Create `utils/otListTypes.ts`**

```ts
import { UNIT_SCHEDULE } from './otSchedule';

export type OTType = 'Major' | 'Minor' | 'EOT';

export interface OTPatient {
  id: string;
  sequence: number;
  ipNo: string;
  name: string;
  age: string;
  gender: 'M' | 'F' | string;
  ward: string;
  unit: string;
  diagnosis: string;
  procedure: string;
  side: string;
  anesthesia: string;
  cArm: 'Yes' | 'No' | string;
  implants: string;
  remarks: string;
  category?: string; // e.g., "Spinal Table", "Local Table"
  otType: OTType;    // which OT list this entry belongs to
}

export function getOTTypeForDate(unit: string, dateStr: string): OTType | null {
  const s = UNIT_SCHEDULE[unit?.toUpperCase()];
  if (!s) return null;
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  if (dow === s.majorDay)     return 'Major';
  if (dow === s.minorDay)     return 'Minor';
  if (dow === s.admissionDay) return 'EOT';
  return null;
}

export function getTableOptionsForType(otType: OTType): string[] {
  if (otType === 'Major') return ['TABLE 1', 'TABLE 2'];
  if (otType === 'Minor') return ['SPINAL TABLE', 'LOCAL TABLE'];
  return ['SPINAL TABLE']; // EOT — single table
}

export function getDefaultCategoryForType(otType: OTType): string {
  return getTableOptionsForType(otType)[0];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run __tests__/otListTypes.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Update `components/OTListManagement.tsx` to import from the new file and use the renamed functions**

Remove lines 39-69 (the `OTPatient` interface, `OTType` type, `getOTTypeForDate`) entirely, and add this import near the top (alongside the other local imports):

```ts
import { OTPatient, OTType, getOTTypeForDate, getTableOptionsForType, getDefaultCategoryForType } from '../utils/otListTypes';
```

Remove the old inline `getTableOptions`/`getDefaultCategory` functions (lines 233-239):

```ts
// DELETE these two functions:
const getTableOptions = (tab = activeTab) => { ... };
const getDefaultCategory = (tab = activeTab) => getTableOptions(tab)[0];
```

Every remaining call site in the file must change (the old `getTableOptions`/`getDefaultCategory` closures no longer exist after this step — later tasks that relocate some of these call sites, like Task 2's rewrite of `handleImportPatient` and Task 4's extraction of the table JSX, will overwrite the fix made here, but the file must compile at the end of *this* task too, since every task ends in a passing type-check). The exact call sites, by their surrounding code:

- `groupedItems` useMemo: `const opts = getTableOptions();` → `const opts = getTableOptionsForType(activeTab);`
- `handleDragOver`: `const overCategory = overItem ? overItem.category : (getTableOptions().includes(overId) ? overId : null);` → replace `getTableOptions()` with `getTableOptionsForType(activeTab)` in that line.
- `handleDragEnd`: `const opts = getTableOptions();` → `const opts = getTableOptionsForType(activeTab);`
- `handleImportPatient`: `const defaultCategory = getDefaultCategory();` → `const defaultCategory = getDefaultCategoryForType(activeTab);` (this function is rewritten entirely in Task 2 — fixing it here just keeps this task's intermediate state compiling).
- `handleAddManualEntry`: `const defaultCategory = getDefaultCategory();` → `const defaultCategory = getDefaultCategoryForType(activeTab);`
- JSX render, category loop: `{getTableOptions().map(category => (` → `{getTableOptionsForType(activeTab).map(category => (`
- JSX render, category `BottomSheetPicker` inside each row: `options={getTableOptions().map(opt => ({ value: opt, label: opt }))}` → `options={getTableOptionsForType(activeTab).map(opt => ({ value: opt, label: opt }))}`

`handleExportExcel`/`handleExportPDF` do not call either function (they only sort/filter `otList` directly) — nothing to change there.

- [ ] **Step 6: Run the full test suite and type-check**

Run: `pnpm vitest run` then `pnpm tsc --noEmit`
Expected: existing tests still pass, no new type errors.

- [ ] **Step 7: Commit**

```bash
git add utils/otListTypes.ts __tests__/otListTypes.test.ts components/OTListManagement.tsx
git commit -m "refactor(ot-list): extract OTPatient/OTType/table-option helpers to utils/otListTypes.ts"
```

---

### Task 2: Extract the shared "build an OT list entry" function

**Files:**
- Create: `utils/otListAssign.ts`
- Modify: `components/OTListManagement.tsx` (simplify `handleImportPatient` to use it)
- Test: `__tests__/otListAssign.test.ts`

**Interfaces:**
- Consumes: `OTPatient`, `OTType` from `utils/otListTypes.ts` (Task 1); `Patient` from `types.ts`.
- Produces: `buildOTPatientEntry(patient: Patient, otType: OTType, category: string, existingInCategory: OTPatient[]): OTPatient` — Task 6 (the new drag-to-assign wiring) also consumes this.

The current `handleImportPatient` (lines 324-346) and the auto-populate effect (lines 161-202) each build an `OTPatient` from a `Patient` with slightly different field defaults — notably `unit: patient.unit ?? 'OR1'` in `handleImportPatient` vs. `unit: p.unit ?? ''` in the auto-populate effect. This task consolidates the "manual add" path (`handleImportPatient`, and the new drag path in Task 6) on the `?? 'OR1'` behavior, since both are user-initiated single-patient actions — the auto-populate effect (which bulk-adds anyone whose `plannedDos` matches a date) is **out of scope for this task** and keeps its own inline logic unchanged.

- [ ] **Step 1: Write the failing test**

Create `__tests__/otListAssign.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildOTPatientEntry } from '../utils/otListAssign';
import { OTPatient } from '../utils/otListTypes';
import { Patient, Gender, PacStatus, PatientStatus } from '../types';

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  ipNo: 'IP001',
  name: 'Ravi Kumar',
  mobile: '9876543210',
  age: 52,
  gender: Gender.Male,
  ward: 'Ward 22',
  bed: '5',
  unit: 'OR1',
  diagnosis: 'Intertrochanteric fracture femur',
  procedure: 'DHS fixation',
  comorbidities: ['HTN', 'DM'],
  doa: '2026-07-26',
  pacStatus: PacStatus.Fit,
  patientStatus: PatientStatus.Fit,
  dailyRounds: [],
  investigations: [],
  labResults: [],
  todos: [],
  ...overrides,
});

describe('buildOTPatientEntry', () => {
  it('maps patient fields onto a new OT entry', () => {
    const entry = buildOTPatientEntry(makePatient(), 'Major', 'TABLE 1', []);
    expect(entry.ipNo).toBe('IP001');
    expect(entry.name).toBe('Ravi Kumar');
    expect(entry.age).toBe('52');
    expect(entry.gender).toBe('M');
    expect(entry.ward).toBe('22'); // "Ward 22" -> "22"
    expect(entry.unit).toBe('OR1');
    expect(entry.diagnosis).toBe('Intertrochanteric fracture femur');
    expect(entry.procedure).toBe('DHS fixation');
    expect(entry.remarks).toBe('HTN, DM');
    expect(entry.category).toBe('TABLE 1');
    expect(entry.otType).toBe('Major');
    expect(entry.cArm).toBe('No');
  });

  it('defaults unit to OR1 when the patient has none', () => {
    const entry = buildOTPatientEntry(makePatient({ unit: undefined }), 'Major', 'TABLE 1', []);
    expect(entry.unit).toBe('OR1');
  });

  it('maps Female to F', () => {
    const entry = buildOTPatientEntry(makePatient({ gender: Gender.Female }), 'Major', 'TABLE 1', []);
    expect(entry.gender).toBe('F');
  });

  it('computes sequence as one past the highest existing sequence in that category', () => {
    const existing: OTPatient[] = [
      { id: 'a', sequence: 1, ipNo: 'x', name: '', age: '', gender: 'M', ward: '', unit: '', diagnosis: '', procedure: '', side: '', anesthesia: '', cArm: 'No', implants: '', remarks: '', category: 'TABLE 1', otType: 'Major' },
      { id: 'b', sequence: 3, ipNo: 'y', name: '', age: '', gender: 'M', ward: '', unit: '', diagnosis: '', procedure: '', side: '', anesthesia: '', cArm: 'No', implants: '', remarks: '', category: 'TABLE 1', otType: 'Major' },
    ];
    const entry = buildOTPatientEntry(makePatient(), 'Major', 'TABLE 1', existing);
    expect(entry.sequence).toBe(4);
  });

  it('starts sequence at 1 when the category is empty', () => {
    const entry = buildOTPatientEntry(makePatient(), 'Major', 'TABLE 1', []);
    expect(entry.sequence).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run __tests__/otListAssign.test.ts`
Expected: FAIL with "Cannot find module '../utils/otListAssign'".

- [ ] **Step 3: Create `utils/otListAssign.ts`**

```ts
import { Patient } from '../types';
import { OTPatient, OTType } from './otListTypes';

/**
 * Builds a new OT-list entry for a patient being added to a specific
 * category (e.g. "TABLE 1"). Used by every "add this pending patient to
 * the list" entry point (the "+" button and drag-to-assign) so they can
 * never produce a different result from each other.
 */
export function buildOTPatientEntry(
  patient: Patient,
  otType: OTType,
  category: string,
  existingInCategory: OTPatient[],
): OTPatient {
  const maxSeq = Math.max(0, ...existingInCategory.map(p => p.sequence));
  return {
    id: crypto.randomUUID(),
    sequence: maxSeq + 1,
    ipNo: patient.ipNo,
    name: patient.name,
    age: patient.age.toString(),
    gender: patient.gender === 'Male' ? 'M' : patient.gender === 'Female' ? 'F' : '',
    ward: patient.ward.replace(/Ward\s*/i, '').trim(),
    unit: patient.unit ?? 'OR1',
    diagnosis: patient.diagnosis,
    procedure: patient.procedure ?? '',
    side: '', anesthesia: '', cArm: 'No', implants: '',
    remarks: patient.comorbidities.join(', '),
    category,
    otType,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run __tests__/otListAssign.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Simplify `handleImportPatient` in `components/OTListManagement.tsx` to use it**

Replace the current `handleImportPatient` (lines 324-346):

```ts
const handleImportPatient = (patient: Patient) => {
  const wardNumber      = patient.ward.replace(/Ward\s*/i, '').trim();
  const defaultCategory = getDefaultCategory();
  const existingInTab   = otList.filter(p => p.otType === activeTab && p.category === defaultCategory);
  const maxSeq          = Math.max(0, ...existingInTab.map(p => p.sequence));
  const newEntry: OTPatient = {
    id: crypto.randomUUID(),
    sequence: maxSeq + 1,
    ipNo: patient.ipNo,
    name: patient.name,
    age: patient.age.toString(),
    gender: patient.gender === 'Male' ? 'M' : patient.gender === 'Female' ? 'F' : '',
    ward: wardNumber,
    unit: patient.unit ?? 'OR1',
    diagnosis: patient.diagnosis,
    procedure: patient.procedure ?? '',
    side: '', anesthesia: '', cArm: 'No', implants: '',
    remarks: patient.comorbidities.join(', '),
    category: defaultCategory,
    otType: activeTab,
  };
  setOtList(prev => [...prev, newEntry]);
};
```

with:

```ts
const handleAssignPatient = (patient: Patient, category: string = getDefaultCategoryForType(activeTab)) => {
  const existingInCategory = otList.filter(p => p.otType === activeTab && p.category === category);
  const newEntry = buildOTPatientEntry(patient, activeTab, category, existingInCategory);
  setOtList(prev => [...prev, newEntry]);
};
```

Add the import: `import { buildOTPatientEntry } from '../utils/otListAssign';`

Rename the one call site (inside the still-present import modal, which Task 6 removes) from `handleImportPatient(patient)` to `handleAssignPatient(patient)`.

- [ ] **Step 6: Run the full test suite and type-check**

Run: `pnpm vitest run` then `pnpm tsc --noEmit`
Expected: all pass, no new errors.

- [ ] **Step 7: Commit**

```bash
git add utils/otListAssign.ts __tests__/otListAssign.test.ts components/OTListManagement.tsx
git commit -m "refactor(ot-list): extract shared buildOTPatientEntry, used by handleAssignPatient"
```

---

### Task 3: Extract Excel/PDF export to `utils/otListExport.ts`

**Files:**
- Create: `utils/otListExport.ts`
- Modify: `components/OTListManagement.tsx:375-629` (delete the two inline handlers, call the extracted functions instead)
- Test: `__tests__/otListExport.test.ts`

**Interfaces:**
- Consumes: `OTPatient`, `OTType` from `utils/otListTypes.ts` (Task 1); `getTableOptionsForType` for column layout.
- Produces: `exportOTListToExcel(otList: OTPatient[], activeTab: OTType, meta: OTListExportMeta): void`, `exportOTListToPDF(otList: OTPatient[], activeTab: OTType, meta: OTListExportMeta): void`, and the `OTListExportMeta` interface — no other task consumes these directly, but `components/OTListManagement.tsx`'s export buttons call them.

This is a pure relocation of `handleExportExcel` (lines 375-517) and `handleExportPDF` (lines 519-629) — same logic, same output, just taking their former closure variables (`otList`, `activeTab`, `selectedDate`, `surgeon`, `surgeonUnit`, `otTime`, `hospitalName`, `department`) as explicit parameters instead.

- [ ] **Step 1: Write the failing test**

Create `__tests__/otListExport.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const writeFileMock = vi.hoisted(() => vi.fn());
vi.mock('xlsx-js-style', async () => {
  const actual = await vi.importActual<typeof import('xlsx-js-style')>('xlsx-js-style');
  return { ...actual, writeFile: writeFileMock };
});

const saveMock = vi.hoisted(() => vi.fn());
const autoTableMock = vi.hoisted(() => vi.fn());
vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(() => ({
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    text: vi.fn(),
    internal: { pageSize: { getWidth: () => 297 } },
    save: saveMock,
  })),
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run __tests__/otListExport.test.ts`
Expected: FAIL with "Cannot find module '../utils/otListExport'".

- [ ] **Step 3: Create `utils/otListExport.ts`**

Move `handleExportExcel`'s and `handleExportPDF`'s bodies from `components/OTListManagement.tsx:375-629` verbatim, changing only the function signatures and replacing every reference to the old closure variables with the new parameters:

```ts
import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { OTPatient, OTType } from './otListTypes';

export interface OTListExportMeta {
  hospitalName: string;
  department: string;
  selectedDate: string;
  surgeon: string;
  surgeonUnit: string;
  otTime: string;
}

export function exportOTListToExcel(otList: OTPatient[], activeTab: OTType, meta: OTListExportMeta): void {
  const { hospitalName, department, selectedDate, surgeon, surgeonUnit, otTime } = meta;
  const wb = XLSX.utils.book_new();
  const wsData: any[][] = [];

  wsData.push([hospitalName]);
  wsData.push([department]);
  wsData.push([`${activeTab.toUpperCase()} OPERATION LIST`]);

  const dateStr = selectedDate.split('-').reverse().join('/');
  wsData.push([`DATE:${dateStr}    SURGEON : ${surgeon}    UNIT :${surgeonUnit}               TIME:${otTime}`]);

  let lastCategory = '';
  let displaySequence = 1;

  const exportList = [...otList].filter(p => p.otType === activeTab).sort((a, b) => {
      if (a.category === b.category) return a.sequence - b.sequence;
      return (a.category || '').localeCompare(b.category || '');
  });

  const colHeaders = ["SL NO", "IP NO", "UNIT", "NAME", "AGE", "WARD", "DIAGNOSIS", "OPERATION", "C ARM", "IMPLANTS"];

  let currentRowIndex = 4;
  const headerRows = [0, 1, 2, 3];
  const categoryHeaderRows: number[] = [];
  const dataRows: number[] = [];

  exportList.forEach(patient => {
      if (patient.category && patient.category !== lastCategory) {
          wsData.push([patient.category, ...colHeaders]);
          categoryHeaderRows.push(currentRowIndex);
          currentRowIndex++;
          lastCategory = patient.category;
          displaySequence = 1;
      }

      const wardNum = patient.ward.replace(/Ward\s*/i, '').trim();

      wsData.push([
          '', displaySequence++, patient.ipNo, patient.unit, patient.name,
          `${patient.age}/${patient.gender}`, wardNum, patient.diagnosis,
          patient.procedure, patient.cArm, patient.implants
      ]);
      dataRows.push(currentRowIndex);
      currentRowIndex++;
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const borderStyle = {
      top: { style: "thin", color: { rgb: "000000" } },
      bottom: { style: "thin", color: { rgb: "000000" } },
      left: { style: "thin", color: { rgb: "000000" } },
      right: { style: "thin", color: { rgb: "000000" } }
  };

  const globalHeaderStyle = {
      font: { bold: true, sz: 12 },
      alignment: { horizontal: "center", vertical: "center" },
      fill: { fgColor: { rgb: "FFFFFF" } }
  };

  const categoryHeaderStyle = {
      font: { bold: true },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      fill: { fgColor: { rgb: "FFF2CC" } },
      border: borderStyle
  };

  const dataCellStyle = {
      font: { sz: 10 },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: borderStyle
  };

  const range = XLSX.utils.decode_range(ws['!ref'] || "A1:A1");

  for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellRef]) continue;

          if (headerRows.includes(R)) {
              ws[cellRef].s = globalHeaderStyle;
          } else if (categoryHeaderRows.includes(R)) {
              ws[cellRef].s = categoryHeaderStyle;
          } else if (dataRows.includes(R)) {
              ws[cellRef].s = dataCellStyle;
          }
      }
  }

  if (!ws['!merges']) ws['!merges'] = [];
  headerRows.forEach(r => {
      ws['!merges']?.push({ s: { r: r, c: 0 }, e: { r: r, c: 10 } });
  });

  ws['!cols'] = [
      { wch: 15 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 25 },
      { wch: 10 }, { wch: 8 }, { wch: 30 }, { wch: 30 }, { wch: 10 }, { wch: 20 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, `${activeTab} OT List`);
  XLSX.writeFile(wb, `${activeTab}_OT_List_${selectedDate}.xlsx`);
}

export function exportOTListToPDF(otList: OTPatient[], activeTab: OTType, meta: OTListExportMeta): void {
  const { hospitalName, department, selectedDate, surgeon, surgeonUnit, otTime } = meta;
  const doc = new jsPDF('l', 'mm', 'a4');

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);

  const pageWidth = doc.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;

  doc.text(hospitalName, centerX, 10, { align: 'center' });
  doc.text(department, centerX, 16, { align: 'center' });
  doc.text(`${activeTab.toUpperCase()} OPERATION LIST`, centerX, 22, { align: 'center' });

  doc.setFontSize(10);
  const dateStr = selectedDate.split('-').reverse().join('/');
  const subHeaderY = 30;
  doc.text(
    `DATE:${dateStr}    SURGEON : ${surgeon}    UNIT :${surgeonUnit}               TIME:${otTime}`,
    14, subHeaderY
  );

  const tableRows: any[] = [];
  let lastCategory = '';
  let displaySequence = 1;

  const sortedList = [...otList].filter(p => p.otType === activeTab).sort((a, b) => {
      if (a.category === b.category) return a.sequence - b.sequence;
      return (a.category || '').localeCompare(b.category || '');
  });

  const headers = ["SL NO", "IP NO", "UNIT", "NAME", "AGE", "WARD", "DIAGNOSIS", "OPERATION", "C ARM", "IMPLANTS"];

  sortedList.forEach(patient => {
      if (patient.category && patient.category !== lastCategory) {
          tableRows.push([
              { content: patient.category, styles: { fontStyle: 'bold', halign: 'center', valign: 'middle' } },
              ...headers.map(h => ({ content: h, styles: { fontStyle: 'bold', halign: 'center', valign: 'middle' } }))
          ]);
          lastCategory = patient.category;
          displaySequence = 1;
      }

      const wardNum = patient.ward.replace(/Ward\s*/i, '').trim();

      tableRows.push([
          '', displaySequence++, patient.ipNo, patient.unit, patient.name,
          `${patient.age}/${patient.gender}`, wardNum, patient.diagnosis,
          patient.procedure, patient.cArm, patient.implants
      ]);
  });

  autoTable(doc, {
    body: tableRows,
    startY: 35,
    theme: 'grid',
    styles: {
        fontSize: 8, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.1,
        font: 'helvetica', fontStyle: 'bold', textColor: [0, 0, 0],
        valign: 'middle', overflow: 'linebreak', halign: 'center'
    },
    didParseCell: (data: any) => {
        const row = data.row;
        if (row && Array.isArray(row.raw)) {
           const cell2 = row.raw[1] as unknown;
           const isHeader = typeof cell2 === 'object' && cell2 !== null &&
             'content' in cell2 && (cell2 as { content: unknown }).content === 'SL NO';

           if (isHeader) {
               data.cell.styles.fillColor = [255, 242, 204];
           }
        }
    },
    columnStyles: {
        0: { cellWidth: 15 }, 1: { cellWidth: 10 }, 2: { cellWidth: 15 }, 3: { cellWidth: 12 },
        4: { cellWidth: 35 }, 5: { cellWidth: 15 }, 6: { cellWidth: 12 }, 7: { cellWidth: 45 },
        8: { cellWidth: 45 }, 9: { cellWidth: 15 }, 10: { cellWidth: 'auto' }
    },
    margin: { top: 35, left: 10, right: 10 }
  });

  doc.save(`${activeTab}_OT_List_${selectedDate}.pdf`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run __tests__/otListExport.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Replace the inline handlers in `components/OTListManagement.tsx`**

Delete `handleExportExcel` (lines 375-517) and `handleExportPDF` (lines 519-629) entirely, replacing both with:

```ts
const handleExportExcel = () => {
  exportOTListToExcel(otList, activeTab, { hospitalName, department, selectedDate, surgeon, surgeonUnit, otTime });
};

const handleExportPDF = () => {
  exportOTListToPDF(otList, activeTab, { hospitalName, department, selectedDate, surgeon, surgeonUnit, otTime });
};
```

Add the import: `import { exportOTListToExcel, exportOTListToPDF } from '../utils/otListExport';`
Remove the now-unused direct imports of `* as XLSX`, `jsPDF`, `autoTable` from `components/OTListManagement.tsx` (they now live only in `utils/otListExport.ts`).

- [ ] **Step 6: Run the full test suite and type-check**

Run: `pnpm vitest run` then `pnpm tsc --noEmit`
Expected: all pass, no new errors.

- [ ] **Step 7: Manually verify export output is unchanged**

Since automated tests only check that the save/write functions were called correctly (not byte-for-byte file content), manually run the app, generate one Excel and one PDF export from the OT List page both before and after this change, and confirm they look identical. Note the result in the task report even if this manual check can't be completed in this environment — see this plan's final task for the project's known local-auth-testing limitation.

- [ ] **Step 8: Commit**

```bash
git add utils/otListExport.ts __tests__/otListExport.test.ts components/OTListManagement.tsx
git commit -m "refactor(ot-list): extract Excel/PDF export to utils/otListExport.ts"
```

---

### Task 4: Extract `OTListTable.tsx` and make categories real droppable zones

**Files:**
- Create: `components/otlist/OTListTable.tsx`
- Modify: `components/OTListManagement.tsx` (remove the inline table JSX and `SortableRow`, render `<OTListTable>` instead; keep `DndContext`/sensors/drag handlers in the orchestrator)

**Interfaces:**
- Consumes: `OTPatient`, `OTType`, `getTableOptionsForType` from `utils/otListTypes.ts` (Task 1).
- Produces: `OTListTable` component with props `{ activeTab: OTType; groupedItems: Record<string, OTPatient[]>; onUpdateEntry: (id: string, field: keyof OTPatient, value: string) => void; onRemove: (id: string) => void }` — Task 6 renders this inside the shared `DndContext`.

The table's reorder behavior (drag within/between categories) is unchanged — this task only relocates it and adds one real improvement: each category becomes an explicit `useDroppable` zone (it currently is **not** one — `handleDragOver`'s `getTableOptions().includes(overId)` check assumes something registers `id === category name` as droppable, but nothing currently does, so dropping onto an empty category's placeholder row silently does nothing today). Task 6's new drag-from-pending feature needs this to work reliably (assigning the first patient of the day into an empty category), so it's fixed here where the category rendering lives.

- [ ] **Step 1: Create `components/otlist/OTListTable.tsx`**

```tsx
import React from 'react';
import { GripVertical, Trash2 } from 'lucide-react';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import BottomSheetPicker from '../ui/BottomSheetPicker';
import { OTPatient, OTType, getTableOptionsForType } from '../../utils/otListTypes';

/** Exported for tests. */
export const SortableRow = ({ id, children, className }: { id: string, children: React.ReactNode, className?: string }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
    position: isDragging ? 'relative' as const : undefined,
    WebkitUserSelect: 'none' as const,
    userSelect: 'none' as const,
    WebkitTouchCallout: 'none' as const,
  };

  const childrenWithProps = React.Children.map(children, child => {
    if (React.isValidElement(child) && (child.props as any)['data-drag-handle']) {
        return React.cloneElement(child, { ...attributes, ...listeners } as any);
    }
    return child;
  });

  return (
    <tr ref={setNodeRef} style={style} className={className}>
      {childrenWithProps}
    </tr>
  );
};

/** Makes an entire category's <tbody> a real drop target (id = category
 * name), so dropping onto an empty category — or a pending patient being
 * assigned there — always registers, not just drops onto an existing row. */
function CategoryDropZone({ category, isEmpty, children }: { category: string; isEmpty: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: category });
  return (
    <tbody
      ref={setNodeRef}
      className={`divide-y divide-slate-100 border-b-4 border-slate-100 transition-colors ${
        isOver ? 'bg-teal-50 ring-2 ring-inset ring-teal-300' : ''
      }`}
    >
      <tr className="bg-slate-100">
        <td colSpan={13} className="p-2 px-4 font-bold text-slate-700 text-sm">
          {category}
        </td>
      </tr>
      {isEmpty ? (
        <tr>
          <td colSpan={13} className="p-4 text-center text-slate-400 text-xs italic">
            Drag items here
          </td>
        </tr>
      ) : children}
    </tbody>
  );
}

interface OTListTableProps {
  activeTab: OTType;
  groupedItems: Record<string, OTPatient[]>;
  onUpdateEntry: (id: string, field: keyof OTPatient, value: string) => void;
  onRemove: (id: string) => void;
}

const OTListTable: React.FC<OTListTableProps> = ({ activeTab, groupedItems, onUpdateEntry, onRemove }) => {
  const options = getTableOptionsForType(activeTab);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[1200px]">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold">
            <th className="p-4 w-12"></th>
            <th className="p-4 w-32">Table/Category</th>
            <th className="p-4 w-12">Seq</th>
            <th className="p-4 w-28">IP Number</th>
            <th className="p-4 w-20">Unit</th>
            <th className="p-4 w-40">Name</th>
            <th className="p-4 w-20">Age/Sex</th>
            <th className="p-4 w-20">Ward</th>
            <th className="p-4 w-48">Diagnosis</th>
            <th className="p-4 w-48">Operation</th>
            <th className="p-4 w-24">C-Arm</th>
            <th className="p-4 w-48">Implants</th>
            <th className="p-4 w-16"></th>
          </tr>
        </thead>
        {options.map(category => (
          <SortableContext
              key={category}
              id={category}
              items={groupedItems[category] || []}
              strategy={verticalListSortingStrategy}
          >
              <CategoryDropZone category={category} isEmpty={(groupedItems[category]?.length ?? 0) === 0}>
                  {groupedItems[category]?.map((patient, index) => (
                      <SortableRow key={patient.id} id={patient.id} className="hover:bg-slate-50 group bg-white">
                          <td className="p-4 cursor-grab touch-none" data-drag-handle>
                              <GripVertical className="w-4 h-4 text-slate-400" />
                          </td>
                          <td className="p-4">
                              <BottomSheetPicker
                                  title="Category"
                                  value={patient.category || ''}
                                  options={options.map(opt => ({ value: opt, label: opt }))}
                                  onChange={val => onUpdateEntry(patient.id, 'category', val)}
                                  triggerClassName="w-full text-sm font-bold text-slate-700 flex items-center gap-1 cursor-pointer p-0"
                              />
                          </td>
                          <td className="p-4 text-slate-500 font-mono font-bold">
                              {index + 1}
                          </td>
                          <td className="p-4">
                              <input
                                  type="text"
                                  value={patient.ipNo}
                                  onChange={(e) => onUpdateEntry(patient.id, 'ipNo', e.target.value)}
                                  className="w-full bg-transparent border-none focus:ring-0 p-0 font-mono text-sm"
                                  placeholder="IP No"
                              />
                          </td>
                          <td className="p-4">
                              <input
                                  type="text"
                                  value={patient.unit}
                                  onChange={(e) => onUpdateEntry(patient.id, 'unit', e.target.value)}
                                  className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm"
                                  placeholder="Unit"
                              />
                          </td>
                          <td className="p-4 font-medium text-slate-900">
                              <input
                                  type="text"
                                  value={patient.name}
                                  onChange={(e) => onUpdateEntry(patient.id, 'name', e.target.value)}
                                  className="w-full bg-transparent border-none focus:ring-0 p-0 font-medium"
                                  placeholder="Name"
                              />
                          </td>
                          <td className="p-4 text-slate-600">
                              <div className="flex gap-1 items-center">
                                  <input
                                  type="text"
                                  value={patient.age}
                                  onChange={(e) => onUpdateEntry(patient.id, 'age', e.target.value)}
                                  className="w-8 bg-transparent border-b border-transparent focus:border-blue-500 focus:ring-0 p-0 text-center"
                                  placeholder="Age"
                                  />
                                  <span className="text-slate-400">/</span>
                                  <BottomSheetPicker
                                      title="Gender"
                                      value={patient.gender}
                                      options={[{ value: 'M', label: 'M' }, { value: 'F', label: 'F' }]}
                                      onChange={val => onUpdateEntry(patient.id, 'gender', val)}
                                      triggerClassName="w-12 text-sm font-medium text-slate-700 flex items-center gap-0.5 cursor-pointer p-0"
                                  />
                              </div>
                          </td>
                          <td className="p-4">
                              <input
                                  type="text"
                                  value={patient.ward}
                                  onChange={(e) => onUpdateEntry(patient.id, 'ward', e.target.value)}
                                  className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm"
                                  placeholder="Ward"
                              />
                          </td>
                          <td className="p-4">
                              <textarea
                                  value={patient.diagnosis}
                                  onChange={(e) => onUpdateEntry(patient.id, 'diagnosis', e.target.value)}
                                  className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm resize-none"
                                  rows={2}
                                  placeholder="Diagnosis"
                              />
                          </td>
                          <td className="p-4">
                              <textarea
                                  value={patient.procedure}
                                  onChange={(e) => onUpdateEntry(patient.id, 'procedure', e.target.value)}
                                  className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm resize-none"
                                  rows={2}
                                  placeholder="Operation"
                              />
                          </td>
                          <td className="p-4">
                              <BottomSheetPicker
                                  title="C-Arm Required"
                                  value={patient.cArm}
                                  options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
                                  onChange={val => onUpdateEntry(patient.id, 'cArm', val)}
                                  triggerClassName="w-full text-sm font-medium text-slate-700 flex items-center gap-1 cursor-pointer p-0"
                              />
                          </td>
                          <td className="p-4">
                              <textarea
                                  value={patient.implants}
                                  onChange={(e) => onUpdateEntry(patient.id, 'implants', e.target.value)}
                                  className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm resize-none text-slate-500"
                                  rows={2}
                                  placeholder="Implants..."
                              />
                          </td>
                          <td className="p-4 text-right">
                              <button
                                  onClick={() => onRemove(patient.id)}
                                  className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                  <Trash2 className="w-4 h-4" />
                              </button>
                          </td>
                      </SortableRow>
                  ))}
              </CategoryDropZone>
          </SortableContext>
        ))}
      </table>
    </div>
  );
};

export default OTListTable;
```

- [ ] **Step 2: Remove the extracted pieces from `components/OTListManagement.tsx`**

Remove the `SortableRow` component definition (lines 71-117) and the entire `<table>` JSX block (inside the `<DndContext>`, roughly lines 780-946 — everything from `<div className="bg-white rounded-xl shadow-sm...">` through its closing `</div>`, but **keep** the `<DndContext>` opening/closing tags, the sensors, and the `<DragOverlay>` in the orchestrator).

Replace the removed table JSX with:

```tsx
<OTListTable
  activeTab={activeTab}
  groupedItems={groupedItems}
  onUpdateEntry={handleUpdateEntry}
  onRemove={handleRemove}
/>
```

Add the import: `import OTListTable from './otlist/OTListTable';`
Remove now-unused imports from `components/OTListManagement.tsx`: `BottomSheetPicker` (moved into `OTListTable.tsx`), `SortableContext`/`verticalListSortingStrategy`/`useSortable`/`CSS` (only `DndContext`, `closestCenter`, sensors, `DragOverlay`, and the drag event types stay).

- [ ] **Step 3: Run the full test suite and type-check**

Run: `pnpm vitest run` then `pnpm tsc --noEmit`
Expected: all pass, no new errors. No new tests are needed for this task — the reorder behavior is unchanged, only relocated (per the spec: "No new tests needed for the extracted `OTListTable.tsx`'s reorder behavior — it's unchanged, moved as-is").

- [ ] **Step 4: Commit**

```bash
git add components/otlist/OTListTable.tsx components/OTListManagement.tsx
git commit -m "refactor(ot-list): extract OTListTable.tsx, make categories real drop zones"
```

---

### Task 5: Build `PendingSurgeryPanel.tsx`

**Files:**
- Create: `components/otlist/PendingSurgeryPanel.tsx`
- Test: `__tests__/components/PendingSurgeryPanel.test.tsx`

**Interfaces:**
- Consumes: `Patient` from `types.ts`.
- Produces: `PendingSurgeryPanel` component with props `{ pendingPatients: Patient[]; onAssign: (patient: Patient) => void }` — Task 6 renders this and wires `onAssign` to `handleAssignPatient`. Each pending card is a `useDraggable` item with id `pending-<ipNo>` — Task 6's drag handler depends on this exact id format.

This component owns its own search state (replacing the search box that used to live in the now-removed import modal) and sorts by earliest `doa` first (longest-waiting patients surface at the top), per the spec's Goals.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/PendingSurgeryPanel.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import PendingSurgeryPanel from '../../components/otlist/PendingSurgeryPanel';
import { Patient, Gender, PacStatus, PatientStatus } from '../../types';

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  ipNo: 'IP001', name: 'Ravi Kumar', mobile: '9876543210', age: 52,
  gender: Gender.Male, ward: 'Ward 22', bed: '5', diagnosis: 'Fracture femur',
  comorbidities: [], doa: '2026-07-26',
  pacStatus: PacStatus.Fit, patientStatus: PatientStatus.Fit,
  dailyRounds: [], investigations: [], labResults: [], todos: [],
  ...overrides,
});

// PendingSurgeryPanel's draggable cards need a DndContext ancestor to call
// useDraggable — a plain, no-op one is enough for these tests.
function renderPanel(pendingPatients: Patient[], onAssign = vi.fn()) {
  render(
    <DndContext>
      <PendingSurgeryPanel pendingPatients={pendingPatients} onAssign={onAssign} />
    </DndContext>,
  );
  return { onAssign };
}

describe('PendingSurgeryPanel', () => {
  it('sorts patients by earliest admission date first', () => {
    renderPanel([
      makePatient({ ipNo: 'IP001', name: 'Later Admit', doa: '2026-07-28' }),
      makePatient({ ipNo: 'IP002', name: 'Earliest Admit', doa: '2026-07-20' }),
      makePatient({ ipNo: 'IP003', name: 'Middle Admit', doa: '2026-07-25' }),
    ]);
    // Query the drag-handle buttons' aria-labels (each names its own patient
    // unambiguously) rather than text content, which would otherwise match
    // both the name's own text node and its nested IP-number <span>.
    const order = screen.getAllByLabelText(/^Drag /).map(el => el.getAttribute('aria-label'));
    expect(order).toEqual(['Drag Earliest Admit', 'Drag Middle Admit', 'Drag Later Admit']);
  });

  it('filters by name or IP number as you search', () => {
    renderPanel([
      makePatient({ ipNo: 'IP001', name: 'Ravi Kumar' }),
      makePatient({ ipNo: 'IP002', name: 'Sarada Nair' }),
    ]);
    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: 'Sarada' } });
    // exact: false — the name text sits beside a nested IP-number <span>, so
    // no single element's *own* full text is exactly the bare name.
    expect(screen.queryByText('Ravi Kumar', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText('Sarada Nair', { exact: false })).toBeInTheDocument();
  });

  it('calls onAssign when the "+" button is pressed', () => {
    const { onAssign } = renderPanel([makePatient()]);
    fireEvent.click(screen.getByLabelText(/Add Ravi Kumar/i));
    expect(onAssign).toHaveBeenCalledTimes(1);
    expect(onAssign.mock.calls[0][0].ipNo).toBe('IP001');
  });

  it('shows an empty state when there are no pending patients', () => {
    renderPanel([]);
    expect(screen.getByText(/No patients pending surgery/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run __tests__/components/PendingSurgeryPanel.test.tsx`
Expected: FAIL with "Cannot find module '../../components/otlist/PendingSurgeryPanel'".

- [ ] **Step 3: Create `components/otlist/PendingSurgeryPanel.tsx`**

```tsx
import React, { useState, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Search, GripVertical, Plus } from 'lucide-react';
import { Patient } from '../../types';

function daysPending(doa: string): number {
  const admitted = new Date(doa + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - admitted.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

interface PendingCardProps {
  patient: Patient;
  onAssign: (patient: Patient) => void;
}

function PendingCard({ patient, onAssign }: PendingCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `pending-${patient.ipNo}`,
  });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 1000 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 p-3 bg-white rounded-lg border border-slate-200 hover:border-teal-300 transition-colors"
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="cursor-grab touch-none text-slate-400 mt-0.5 shrink-0"
        aria-label={`Drag ${patient.name}`}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-900 text-sm truncate">
          {patient.name} <span className="text-slate-500 font-normal">({patient.ipNo})</span>
        </div>
        <div className="text-xs text-slate-600 truncate">{patient.diagnosis}</div>
        <div className="text-xs text-slate-400 mt-0.5">Pending {daysPending(patient.doa)}d</div>
      </div>
      <button
        type="button"
        onClick={() => onAssign(patient)}
        className="p-1.5 bg-teal-100 text-teal-700 rounded-md hover:bg-teal-200 shrink-0"
        aria-label={`Add ${patient.name} to current list`}
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

interface PendingSurgeryPanelProps {
  pendingPatients: Patient[];
  onAssign: (patient: Patient) => void;
}

const PendingSurgeryPanel: React.FC<PendingSurgeryPanelProps> = ({ pendingPatients, onAssign }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const sorted = useMemo(
    () => [...pendingPatients].sort((a, b) => a.doa.localeCompare(b.doa)),
    [pendingPatients],
  );

  const filtered = sorted.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.ipNo.includes(searchTerm),
  );

  return (
    <div className="w-full lg:w-80 shrink-0 bg-slate-50 rounded-xl border border-slate-200 p-3 flex flex-col gap-3 max-h-[calc(100vh-200px)]">
      <div>
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Pending Surgery ({pendingPatients.length})
        </h2>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search name or IP..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">No patients pending surgery.</div>
        ) : (
          filtered.map(patient => (
            <PendingCard key={patient.ipNo} patient={patient} onAssign={onAssign} />
          ))
        )}
      </div>
    </div>
  );
};

export default PendingSurgeryPanel;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run __tests__/components/PendingSurgeryPanel.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full test suite and type-check**

Run: `pnpm vitest run` then `pnpm tsc --noEmit`
Expected: all pass, no new errors.

- [ ] **Step 6: Commit**

```bash
git add components/otlist/PendingSurgeryPanel.tsx __tests__/components/PendingSurgeryPanel.test.tsx
git commit -m "feat(ot-list): add persistent PendingSurgeryPanel with drag source + tap-to-add"
```

---

### Task 6: Wire the shared drag context, final layout, remove the old modal

**Files:**
- Modify: `components/OTListManagement.tsx`

**Interfaces:**
- Consumes: `PendingSurgeryPanel` (Task 5), `OTListTable` (Task 4), `buildOTPatientEntry`/`handleAssignPatient` (Task 2).
- Produces: the final page layout — no other task depends on this one.

This is the integration task: render `PendingSurgeryPanel` and `OTListTable` inside one shared `DndContext`, extend `handleDragEnd` to recognize drags originating from the pending panel (id prefix `pending-`) as an *assign* action rather than a *reorder*, and delete the now-redundant "Add from Pending" modal and its button/state entirely (the panel replaces it — per the spec's Goals: "a persistent pending-surgery panel... (not a modal)").

- [ ] **Step 1: Extend `handleDragEnd` to handle drags from the pending panel**

Replace the current `handleDragEnd` (already updated in earlier tasks only for `getTableOptionsForType`/renaming — this step adds the new branch):

```ts
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  setActiveId(null);
  if (!over) return;

  const activeIdStr = active.id as string;

  // A drag that started on a pending-panel card is an *assign*, not a
  // reorder — build a new entry in whichever category it was dropped on.
  if (activeIdStr.startsWith('pending-')) {
    const ipNo = activeIdStr.slice('pending-'.length);
    const patient = patients.find(p => p.ipNo === ipNo);
    if (!patient) return;

    const overId = over.id as string;
    const overItem = otList.find(i => i.id === overId);
    const targetCategory = overItem
      ? overItem.category
      : (getTableOptionsForType(activeTab).includes(overId) ? overId : null);
    if (!targetCategory) return;

    const existingInCategory = otList.filter(i => i.otType === activeTab && i.category === targetCategory);
    const newEntry = buildOTPatientEntry(patient, activeTab, targetCategory, existingInCategory);
    setOtList(prev => [...prev, newEntry]);
    return;
  }

  if (active.id !== over.id) {
    setOtList((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      const newItems = arrayMove(items, oldIndex, newIndex);

      const opts = getTableOptionsForType(activeTab);
      const groups: Record<string, OTPatient[]> = {};
      opts.forEach(opt => { groups[opt] = []; });

      newItems.filter(i => i.otType === activeTab).forEach(item => {
        const cat = item.category && groups[item.category] !== undefined ? item.category : opts[0];
        groups[cat].push(item);
      });

      const resequenced: OTPatient[] = [];
      Object.keys(groups).forEach(cat => {
        groups[cat].forEach((item, index) => {
          resequenced.push({ ...item, sequence: index + 1 });
        });
      });

      const otherTabItems = newItems.filter(i => i.otType !== activeTab);
      return [...otherTabItems, ...resequenced];
    });
  }
};
```

Note: `handleDragOver` needs **no changes** — its existing `const activeItem = otList.find(i => i.id === activeId); if (!activeItem) return;` guard already safely no-ops for `pending-`-prefixed ids (they're never found in `otList`), so the live "preview the item moving between categories while dragging" behavior correctly does nothing for a pending-sourced drag — the category highlight from Task 4's `useDroppable` is the only visual feedback needed during that drag, and it's already handled inside `OTListTable.tsx` independently.

- [ ] **Step 2: Remove the import modal and its state (but keep the `UserPlus`/`X` icon imports — Step 3 reuses them for the new mobile drawer button)**

Delete:
- `const [isImportModalOpen, setIsImportModalOpen] = useState(false);`
- `const [searchTerm, setSearchTerm] = useState('');`
- `const filteredPending = pendingPatients.filter(...)` (the panel now does its own filtering internally)
- The "Add from Pending" button in the Actions Toolbar (`<UserPlus className="w-4 h-4" /> Add from Pending`)
- The entire `{isImportModalOpen && (...)}` modal JSX block at the end of the file

Keep `pendingPatients` (the filter computing who's eligible: `hasPendingSurgery(p) && !otList.some(...)`) — it's now passed to `PendingSurgeryPanel` as a prop. Keep the `UserPlus` and `X` icon imports from `lucide-react` — they were only used by the button/modal removed here, but Step 3 immediately reuses both for the phone drawer.

Add one new state for the phone drawer: `const [mobileOpen, setMobileOpen] = useState(false);`

- [ ] **Step 3: Render `PendingSurgeryPanel` alongside `OTListTable` inside the shared `DndContext`, with a phone-only drawer**

Per the spec's Goals, this page targets tablet/desktop primarily — the pending panel stays always-visible there — but on a phone-sized screen it degrades to a floating button that opens the same panel in a bottom drawer, rather than an always-visible column that would crowd out the table.

Replace the `<DndContext>` block's contents with:

```tsx
<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragStart={handleDragStart}
  onDragOver={handleDragOver}
  onDragEnd={handleDragEnd}
>
  <div className="flex flex-col lg:flex-row gap-4 items-start">
    <div className="flex-1 min-w-0 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <OTListTable
        activeTab={activeTab}
        groupedItems={groupedItems}
        onUpdateEntry={handleUpdateEntry}
        onRemove={handleRemove}
      />
    </div>

    {/* Tablet/desktop: persistent inline panel */}
    <div className="hidden lg:block">
      <PendingSurgeryPanel pendingPatients={pendingPatients} onAssign={handleAssignPatient} />
    </div>
  </div>

  <DragOverlay>
      {activeId ? (
          <div className="p-2 bg-white rounded shadow-lg border border-slate-200 cursor-grabbing">
              <GripVertical className="w-4 h-4 text-slate-600" />
          </div>
      ) : null}
  </DragOverlay>
</DndContext>

{/* Phone: floating button + bottom drawer (dragging onto a hidden table
    doesn't make sense once the drawer covers it, so this is a "+"-button-only
    surface on phone — matches the drag cards' existing tap-to-add fallback) */}
<button
  onClick={() => setMobileOpen(true)}
  className="lg:hidden fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-teal-600 text-white rounded-full shadow-lg"
>
  <UserPlus className="w-5 h-5" />
  Pending ({pendingPatients.length})
</button>

{mobileOpen && (
  <div
    className="lg:hidden fixed inset-0 z-50 bg-black/50 flex items-end"
    onClick={() => setMobileOpen(false)}
  >
    <div
      className="w-full bg-white rounded-t-2xl max-h-[80vh] overflow-hidden flex flex-col"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex justify-between items-center p-4 border-b border-slate-100 shrink-0">
        <h2 className="font-bold text-slate-900">Pending Surgery</h2>
        <button onClick={() => setMobileOpen(false)} className="text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-3 overflow-y-auto">
        <PendingSurgeryPanel
          pendingPatients={pendingPatients}
          onAssign={patient => { handleAssignPatient(patient); setMobileOpen(false); }}
        />
      </div>
    </div>
  </div>
)}
```

Add the import: `import PendingSurgeryPanel from './otlist/PendingSurgeryPanel';`
The `Search` icon import can be removed if nothing else in the file uses it (check — it was only used by the removed modal's search box; `PendingSurgeryPanel.tsx` has its own separate `Search` import already).

- [ ] **Step 4: Run the full test suite, type-check, and lint**

Run: `pnpm vitest run` then `pnpm tsc --noEmit` then `pnpm lint`
Expected: all pass, no new errors, zero lint warnings.

- [ ] **Step 5: Manually verify in the browser**

Run `pnpm dev`, log in, navigate to the OT List page, and confirm: the pending panel shows on the right with real pending patients sorted longest-waiting-first; dragging a card onto a category adds it there; the "+" button does the same; the category highlights while dragging over it; existing reorder-within-list still works; Excel/PDF export still produce the same output as before this whole plan started.

If the authenticated app can't be driven locally in this environment (a known, previously-documented limitation), say so plainly in the task report rather than assuming success, and note that a manual check on the deployed app (or by the user directly) is still needed before this is considered fully verified.

- [ ] **Step 6: Commit**

```bash
git add components/OTListManagement.tsx
git commit -m "feat(ot-list): wire pending-panel drag-to-assign into shared DndContext, remove old modal"
```

---

## Final check (not a task — a reminder for whoever finishes this plan)

After all 6 tasks: `components/OTListManagement.tsx` should now be well under 250 lines (state, effects, handlers, and the layout shell only — no table markup, no export logic, no modal). Confirm with `wc -l components/OTListManagement.tsx` before considering this plan done.
