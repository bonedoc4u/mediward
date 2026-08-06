# Radiology Multi-Select Crop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user crop/rotate any individual image in a multi-select radiology upload batch, not just when exactly one file is queued.

**Architecture:** Extract the inline `UploadSheet` sub-component out of the oversized `RadiologyComparator.tsx` (819 lines) into its own file with a new index-aware `onEditFile(index)` callback, then wire the parent's existing `showEditor: boolean` state into an `editingIndex: number | null` so the already-working `ImageEditor` modal can be pointed at any file in the batch, not just index 0.

**Tech Stack:** React 19 + TypeScript (strict), existing `react-cropper`-based `ImageEditor` (unchanged), Tailwind CSS.

## Global Constraints

- TypeScript strict mode; `pnpm tsc --noEmit` must pass after every task.
- `pnpm lint` (`eslint . --max-warnings 0`) must pass after every task.
- pnpm only — never `npm`/`yarn`.
- No component over ~250 lines (this project's convention).
- `components/radiology/ImageEditor.tsx` is NOT modified by this plan — its `{ src: string; onApply: (file: File) => void; onClose: () => void; }` interface is already index-agnostic; only the caller's bookkeeping changes.
- No new tests — matches this project's existing precedent (no test file exists for `RadiologyComparator.tsx` or any of its sub-components).
- Commit convention: one logical change per commit.

---

### Task 1: Extract `UploadSheet` into its own file with per-image crop

**Files:**
- Create: `components/radiology/UploadSheet.tsx`

**Interfaces:**
- Consumes: nothing new — same types (`Patient` from `../../types`, `RadPhase` — see note below), same child components (`BottomSheetPicker` from `../ui/BottomSheetPicker`) and icons (`X`, `Loader2`, `Crop as CropIcon` from `lucide-react`) the inline version already used.
- Produces: default-exported `UploadSheet` component with this prop interface — Task 2 imports and wires it:
  ```ts
  interface UploadSheetProps {
    isOpen: boolean;
    files: File[];
    previewUrls: string[];
    patient: Patient;
    isUploading: boolean;
    uploadError: string | null;
    onPhaseChange: (p: 'preop' | 'postop') => void;
    onTypeChange: (t: string) => void;
    phase: 'preop' | 'postop';
    invType: string;
    allowPostOp: boolean;
    onSave: () => void;
    onCancel: () => void;
    onRemoveFile: (index: number) => void;
    /** Opens the crop/rotate editor for the file at this index — offered for
     *  any image file, single or in a batch; never offered for PDFs. */
    onEditFile?: (index: number) => void;
  }
  ```
  Note: `RadPhase` was a local type alias (`type RadPhase = 'preop' | 'postop';`) declared in `RadiologyComparator.tsx` — this new file does not import it (that would create an import from a file that itself will import this one back in Task 2, an awkward circular dependency for a two-value union). Spell the union out directly as `'preop' | 'postop'` in this new file instead.

This is the current inline implementation being moved and extended — read it directly to confirm nothing has drifted before starting: `components/RadiologyComparator.tsx:262-428` (the `UploadSheet` component) and `components/RadiologyComparator.tsx:1-21` (the top-of-file imports, to know which ones `UploadSheet` actually needs — not all of them; e.g. it does not need `Investigation`, `Capacitor`, `CapCamera`, `exportRadiologyPDF`, `getAdmissionDayCohort`).

- [ ] **Step 1: Create the new file with the extracted component, updated interface, and new batch-thumbnail crop interaction**

Create `components/radiology/UploadSheet.tsx`:

```tsx
import React from 'react';
import { Patient } from '../../types';
import { X, Loader2, Crop as CropIcon } from 'lucide-react';
import BottomSheetPicker from '../ui/BottomSheetPicker';

interface UploadSheetProps {
  isOpen: boolean;
  files: File[];
  previewUrls: string[];
  patient: Patient;
  isUploading: boolean;
  uploadError: string | null;
  onPhaseChange: (p: 'preop' | 'postop') => void;
  onTypeChange: (t: string) => void;
  phase: 'preop' | 'postop';
  invType: string;
  allowPostOp: boolean;
  onSave: () => void;
  onCancel: () => void;
  onRemoveFile: (index: number) => void;
  /** Opens the crop/rotate editor for the file at this index — offered for
   *  any image file, single or in a batch; never offered for PDFs. */
  onEditFile?: (index: number) => void;
}

const UploadSheet: React.FC<UploadSheetProps> = ({
  isOpen, files, previewUrls, patient, isUploading, uploadError,
  onPhaseChange, onTypeChange, phase, invType, allowPostOp, onSave, onCancel, onRemoveFile, onEditFile,
}) => {
  if (!isOpen) return null;
  const isSingleImage = files.length === 1 && files[0].type.startsWith('image/');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl
                      animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Preview — single image gets a large preview; a batch gets a thumbnail strip
            so each file can be reviewed/removed/cropped before the shared modality+phase
            is saved. */}
        {isSingleImage ? (
          <div className="relative bg-black h-48 mx-4 rounded-xl overflow-hidden mb-4">
            <img src={previewUrls[0]} alt="Preview" className="w-full h-full object-contain" />
            {!isUploading && (
              <button
                onClick={onCancel}
                aria-label="Discard image"
                className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {!isUploading && onEditFile && (
              <button
                onClick={() => onEditFile(0)}
                className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white text-xs font-semibold px-3 py-2 rounded-full"
              >
                <CropIcon className="w-3.5 h-3.5" /> Crop / Rotate
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto px-4 mb-4 pb-1">
            {files.map((f, i) => {
              const isImage = f.type.startsWith('image/');
              const canCrop = isImage && !!onEditFile;
              return (
                <div
                  key={`${f.name}-${i}`}
                  className="relative shrink-0 w-20 h-20 bg-slate-900 rounded-lg overflow-hidden"
                  onClick={canCrop ? () => onEditFile(i) : undefined}
                  onKeyDown={canCrop ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEditFile(i); } } : undefined}
                  tabIndex={canCrop ? 0 : undefined}
                  role={canCrop ? 'button' : undefined}
                  aria-label={canCrop ? `Crop ${f.name}` : undefined}
                >
                  {isImage
                    ? <img src={previewUrls[i]} alt={f.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-slate-400 text-[9px] font-semibold px-1 text-center break-all">{f.name}</div>}
                  {canCrop && (
                    <div className="absolute bottom-1 right-1 bg-black/60 text-white p-1 rounded-full pointer-events-none">
                      <CropIcon className="w-3 h-3" />
                    </div>
                  )}
                  {!isUploading && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveFile(i); }}
                      aria-label={`Remove ${f.name}`}
                      className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-full"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="px-5 pb-8 space-y-4">
          <h3 className="text-base font-semibold text-slate-900">
            Upload {files.length > 1 ? `${files.length} investigations` : 'investigation'}
          </h3>
          <p className="text-xs text-slate-400">{patient.name} · Bed {patient.bed}</p>

          {/* Phase toggle — hidden for conservative patients (post-op not applicable) */}
          {allowPostOp && (
            <div className="space-y-1">
              <label className="text-[10px] font-medium tracking-widest uppercase text-slate-500">
                Investigation type
              </label>
              <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                <button
                  onClick={() => onPhaseChange('preop')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                    phase === 'preop'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Pre-Op
                </button>
                <button
                  onClick={() => onPhaseChange('postop')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                    phase === 'postop'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Post-Op
                </button>
              </div>
            </div>
          )}

          {/* Modality */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium tracking-widest uppercase text-slate-500">
              Modality
            </label>
            <BottomSheetPicker
              title="Modality"
              value={invType}
              options={[
                { value: 'X-Ray',          label: 'X-Ray' },
                { value: 'CT',             label: 'CT Scan' },
                { value: 'MRI',            label: 'MRI' },
                { value: 'USG',            label: 'Ultrasound (USG)' },
                { value: 'Culture Report', label: 'Culture Report' },
                { value: 'Report',         label: 'Report / Document' },
              ]}
              onChange={onTypeChange}
              disabled={isUploading}
            />
          </div>

          {uploadError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
              {uploadError}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={isUploading}
              className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-semibold
                         text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={isUploading || files.length === 0}
              className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-60
                         text-white font-semibold rounded-xl transition-colors
                         flex items-center justify-center gap-2"
            >
              {isUploading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                : files.length > 1 ? `Save ${files.length}` : 'Save'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadSheet;
```

- [ ] **Step 2: Type-check and lint the new file**

Run: `pnpm tsc --noEmit` then `pnpm lint`
Expected: both clean. (This file isn't imported anywhere yet, so this only confirms the new file itself is well-typed and lint-clean in isolation — not yet that the whole app still compiles with the old inline version still present in `RadiologyComparator.tsx`, which it is until Task 2.)

- [ ] **Step 3: Commit**

```bash
git add components/radiology/UploadSheet.tsx
git commit -m "feat(radiology): extract UploadSheet with per-image crop support"
```

---

### Task 2: Wire the extracted `UploadSheet` and index-aware crop editor into `RadiologyComparator.tsx`

**Files:**
- Modify: `components/RadiologyComparator.tsx`

**Interfaces:**
- Consumes: `UploadSheet` (default export) and its `UploadSheetProps` from `./radiology/UploadSheet` (Task 1) — specifically the `onEditFile?: (index: number) => void` prop.
- Produces: nothing new for later tasks — this is the last task in this plan.

Read the current file before editing (line numbers below are what it was at the start of this plan; if a fix round or intervening change has shifted them, find the equivalent code and adapt — the diffs are unambiguous from context):

- [ ] **Step 1: Remove the inline `UploadSheet` definition and import the new file instead**

Delete `components/RadiologyComparator.tsx:262-428` in full — that is everything from the `// ─── Upload Bottom Sheet ───...` comment line through the closing `};` of the inline `UploadSheet` component (immediately before the `// ─── Main ───...` comment).

Add this import near the other local component imports (right after `import ImageEditor from './radiology/ImageEditor';` at line 9):
```ts
import UploadSheet from './radiology/UploadSheet';
```

- [ ] **Step 2: Replace `showEditor` state with `editingIndex`**

Replace (currently line 451):
```ts
  const [showEditor, setShowEditor]       = useState(false);
```
with:
```ts
  // Index into selectedFiles/previewUrls currently open in the crop editor;
  // null means the editor is closed. Works for both the single-image case
  // (always index 0) and any image in a multi-select batch.
  const [editingIndex, setEditingIndex]   = useState<number | null>(null);
```

- [ ] **Step 3: Reset `editingIndex` (not `showEditor`) when the upload sheet is cancelled**

In `handleCancelUpload` (currently lines 601-609), replace:
```ts
    setShowEditor(false);
```
with:
```ts
    setEditingIndex(null);
```
(Every other line in `handleCancelUpload` stays unchanged.)

- [ ] **Step 4: Update the `UploadSheet` JSX invocation to pass `onEditFile` unconditionally**

Replace (currently line 790, the comment + prop):
```tsx
        // Crop/rotate only makes sense for a single image at a time
        onEdit={selectedFiles.length === 1 && selectedFiles[0].type.startsWith('image/') ? () => setShowEditor(true) : undefined}
```
with:
```tsx
        onEditFile={(index) => setEditingIndex(index)}
```
(Every other prop passed to `<UploadSheet ... />` — `isOpen`, `files`, `previewUrls`, `patient`, `isUploading`, `uploadError`, `phase`, `invType`, `allowPostOp`, `onPhaseChange`, `onTypeChange`, `onSave`, `onCancel`, `onRemoveFile` — stays exactly as it is. The "is this actually croppable" gating now lives entirely inside `UploadSheet` itself, per-file, per Task 1 — the parent no longer needs to pre-compute it.)

- [ ] **Step 5: Make the `ImageEditor` invocation index-aware**

Replace (currently lines 793-805):
```tsx
      {/* Crop / rotate / straighten editor — only reachable when exactly one file is queued */}
      {showEditor && previewUrls[0] && (
        <ImageEditor
          src={previewUrls[0]}
          onClose={() => setShowEditor(false)}
          onApply={(edited) => {
            if (previewUrls[0]?.startsWith('blob:')) URL.revokeObjectURL(previewUrls[0]);
            setSelectedFiles([edited]);
            setPreviewUrls([URL.createObjectURL(edited)]);
            setShowEditor(false);
          }}
        />
      )}
```
with:
```tsx
      {/* Crop / rotate / straighten editor — reachable for any image file,
          single or in a batch; editingIndex says which one. */}
      {editingIndex !== null && previewUrls[editingIndex] && (
        <ImageEditor
          src={previewUrls[editingIndex]}
          onClose={() => setEditingIndex(null)}
          onApply={(edited) => {
            setSelectedFiles(prev => prev.map((f, i) => (i === editingIndex ? edited : f)));
            setPreviewUrls(prev => {
              const oldUrl = prev[editingIndex!];
              if (oldUrl?.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
              return prev.map((u, i) => (i === editingIndex ? URL.createObjectURL(edited) : u));
            });
            setEditingIndex(null);
          }}
        />
      )}
```
The `editingIndex!` non-null assertion inside the `setPreviewUrls` updater is necessary (not a shortcut) — TypeScript's narrowing from the outer `editingIndex !== null` check does not reliably persist across the closure boundary into a `useState` updater function defined further inside the JSX tree, so the assertion is how the code states explicitly what's already been checked one level up. This matches the existing convention elsewhere in this codebase (e.g. `user.hospitalId!` after an equivalent outer null-check) — not a new pattern.

- [ ] **Step 6: Type-check and lint the whole app**

Run: `pnpm tsc --noEmit` then `pnpm lint`
Expected: both clean.

- [ ] **Step 7: Confirm `RadiologyComparator.tsx`'s new line count**

Run: `wc -l components/RadiologyComparator.tsx` (or open it and check) — expect it to have shrunk by roughly 165 lines (the extracted `UploadSheet`) plus a handful more removed than added in this task's own edits. It will still be well over the ~250-line guideline (it was 819 lines before this plan and still has `ImageCard`, `UploadCard`, `SectionHeader`, `PatientPicker`, and the main component itself, none of which this plan touches) — that's expected and out of scope here; only confirm it shrank, not that it now meets the guideline.

- [ ] **Step 8: Manually verify in the browser**

Run `pnpm dev`, log in, navigate to Radiology, select a patient, and confirm: selecting a single image still shows the large preview with a working "Crop / Rotate" button (unchanged behavior); selecting multiple images shows the thumbnail strip, tapping any individual image thumbnail (not a PDF) opens the same crop editor for just that image, applying a crop replaces only that thumbnail's preview (the others stay untouched), and Save uploads all files with the cropped one reflecting the edit. If the authenticated app can't be driven locally in this environment (a previously-documented limitation of this project), say so plainly in the task report rather than assuming success — be explicit that the user needs to verify this themselves before trusting it.

- [ ] **Step 9: Commit**

```bash
git add components/RadiologyComparator.tsx
git commit -m "feat(radiology): wire per-image crop into the multi-select upload flow"
```
