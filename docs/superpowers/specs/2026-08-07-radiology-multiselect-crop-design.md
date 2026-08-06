# Radiology Multi-Select Crop — Design Spec

**Date:** 2026-08-07
**Status:** Approved by user, ready for implementation planning

## Context

`RadiologyComparator.tsx` (819 lines — already well over this project's
~250-line-per-component guideline) handles uploading investigation images.
When exactly one image is queued, the upload sheet shows a large preview
with a "Crop / Rotate" button that opens `components/radiology/ImageEditor.tsx`
(a full-screen `react-cropper` modal). When more than one file is queued
(multi-select via the file picker's `multiple` attribute, or several camera
captures), the upload sheet instead shows a thumbnail strip with only a
remove ("✕") button per tile — no crop capability at all
(`RadiologyComparator.tsx:773-805`, `onEdit` is only passed when
`selectedFiles.length === 1`). The user hit this directly: multi-selecting
several X-ray photos and being unable to crop any of them, unlike the
single-image path.

## Goals

- Cropping/rotating is available for any image in a multi-select batch, not
  just when exactly one file is queued.
- Opt-in per image, matching the existing single-image UX: nothing is
  forced, images the user doesn't tap upload as-is.
- Reuses the existing `ImageEditor` modal and its crop/rotate/straighten
  behavior unchanged — no new crop implementation.
- Mobile-first: the interaction to open crop on a batch thumbnail must be a
  comfortably large touch target, not a second small icon button crowded
  onto an already-small (80×80px) tile next to the existing remove button.
- `UploadSheet` (the sub-component being modified, ~165 lines) is extracted
  out of `RadiologyComparator.tsx` into its own file, since the file is
  already 3-4x over this project's component-size convention and this
  change touches that sub-component directly.

## Non-goals

- No crop capability for PDFs or other non-image files in a batch — matches
  the existing single-image behavior, which already gates crop on
  `type.startsWith('image/')`.
- No changes to storage, the `imaging` DB table, or the `Investigation`
  type — uploads already persist one file at a time in a loop
  (`RadiologyComparator.handleSave`), so per-image cropping needs no
  backend changes.
- No editing of images *after* they've already been uploaded (e.g. from the
  patient's radiology gallery days later) — this is specifically about the
  multi-select upload flow, matching the original bug report.
- No changes to `ImageEditor.tsx` itself — its `{ src, onApply, onClose }`
  interface is already index-agnostic; only the caller's bookkeeping
  changes.
- No forced sequential "crop each one before you can save" wizard — user
  explicitly chose the opt-in-per-thumbnail approach over this.

## Architecture

Pure UI-layer change, no backend/type/service changes.

**State**: the parent (currently `RadiologyComparator`'s main component)
replaces its `showEditor: boolean` state with `editingIndex: number | null`
(`null` = editor closed; otherwise the index into `selectedFiles`/
`previewUrls` currently being edited).

**`ImageEditor` invocation** changes from always operating on index 0 to
operating on `editingIndex`:
```tsx
{editingIndex !== null && previewUrls[editingIndex] && (
  <ImageEditor
    src={previewUrls[editingIndex]}
    onClose={() => setEditingIndex(null)}
    onApply={(edited) => {
      const idx = editingIndex;
      if (previewUrls[idx]?.startsWith('blob:')) URL.revokeObjectURL(previewUrls[idx]);
      setSelectedFiles(prev => prev.map((f, i) => (i === idx ? edited : f)));
      setPreviewUrls(prev => prev.map((u, i) => (i === idx ? URL.createObjectURL(edited) : u)));
      setEditingIndex(null);
    }}
  />
)}
```

**`UploadSheet` extraction**: moves from being an inline component inside
`RadiologyComparator.tsx` (lines 263-428) to its own file,
`components/radiology/UploadSheet.tsx`, imported back into
`RadiologyComparator.tsx`. Its prop for opening the editor changes from
`onEdit?: () => void` (single-image only) to `onEditFile?: (index: number) => void`
(works for both the single-image preview's existing "Crop / Rotate" button,
which now calls `onEditFile(0)`, and the new batch thumbnail tap).

**Batch thumbnail interaction**: the existing 80×80px tile
(`RadiologyComparator.tsx:320-333`) gains an `onClick` on the tile itself
(not a new button) that calls `onEditFile(i)`, gated on
`f.type.startsWith('image/')` — a PDF tile stays non-interactive for crop.
A small, non-interactive crop-icon badge is added in a corner (e.g.
bottom-right, mirroring where the single-image view's "Crop / Rotate"
button already sits) as a visual affordance that the tile is tappable — it
carries no `onClick` of its own; the tile's own click handler covers the
whole area including the badge. The existing remove ("✕") button keeps its
own smaller `onClick`, with `event.stopPropagation()` added so tapping it
doesn't also trigger the tile's crop handler.

**Reset on cancel**: `handleCancelUpload` (wherever the upload sheet's
state is reset) also resets `editingIndex` to `null`, alongside its
existing resets of `selectedFiles`/`previewUrls`/`showUploadForm`.

## Components

- **`components/radiology/UploadSheet.tsx`** (new) — extracted from
  `RadiologyComparator.tsx`. Same props as today plus the `onEdit` →
  `onEditFile(index: number)` signature change; the batch-thumbnail branch
  gains the tap-to-crop interaction described above.
- **`components/RadiologyComparator.tsx`** — imports `UploadSheet` instead
  of defining it inline; `showEditor` state replaced with `editingIndex`;
  the `ImageEditor` invocation and its `onApply`/`onClose` handlers updated
  to be index-aware as shown above. No other sub-components in this file
  are touched.
- **`components/radiology/ImageEditor.tsx`** — unchanged.

## Data Flow

1. User multi-selects images (file picker or repeated camera captures) →
   `handleFileChange`/`handleCameraClick` append to `selectedFiles`/
   `previewUrls` as today, unchanged.
2. `UploadSheet` renders the batch thumbnail strip. Tapping an image tile
   calls `onEditFile(i)` → parent sets `editingIndex = i`.
3. `ImageEditor` opens full-screen with `src = previewUrls[i]`. On Apply,
   the file/preview at index `i` is replaced in place (array order and
   every other index untouched) and `editingIndex` resets to `null`. On
   Close/Cancel, `editingIndex` resets to `null` with no change to that
   file.
4. User can repeat step 2-3 for any other image in the batch, or tap Save
   directly — `handleSave`'s existing per-file loop
   (compress → upload → insert) is completely unchanged; it just sees
   whichever files were or weren't edited.

## Error Handling

No new error paths — cropping happens entirely client-side before upload
(same as the single-image case today), so a crop/rotate action itself
can't fail in a way that needs new error UI. The existing upload-failure
handling (partial-failure retry, kept-in-sheet failed files) is untouched
since it operates after cropping is already done.

## Testing

- `UploadSheet` is currently untested (no existing test file for
  `RadiologyComparator.tsx` or its sub-components — consistent with this
  project's existing convention for dense drag/upload UI components, e.g.
  `OTListManagement.tsx` also has no component-level test file). No new
  test file is being added for this UI-only change, matching that
  precedent.
- `ImageEditor.tsx` is unchanged, so its behavior (already unverified by
  any test, per the same convention) carries no new risk.
- Manual verification after implementation: multi-select 2-3 images, crop
  one of them, confirm only that one changes in the preview strip and the
  others are untouched, then Save and confirm the uploaded investigation
  shows the cropped version for that one image and the originals for the
  others.
