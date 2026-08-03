# OT List Management — Persistent Pending Panel & Drag-to-Assign — Design Spec

**Date:** 2026-08-03
**Status:** Approved by user, ready for implementation planning

## Context

`OTListManagement.tsx` builds the Major/Minor/EOT operating-theatre lists for a unit.
Today it already supports drag-to-reorder within a list (via `@dnd-kit`, category
tables like "Table 1"/"Table 2" for Major, "Spinal"/"Local" for Minor), but adding a
new patient to a list only happens through an "Add from Pending List" button that
opens a modal — there is no persistent view of who's still pending surgery, and you
can only add to whichever tab (Major/Minor/EOT) is currently active.

The user wants a persistent pending-patients panel visible alongside the list, and
the ability to drag a pending patient directly onto whichever list/category they
belong in, rather than opening a modal.

The file has also grown to 1,024 lines doing five things at once (state/handlers,
toolbar, the big table, the import modal, ~250 lines of Excel/PDF export) — well
past this project's own ~250-line-per-component convention. This redesign touches
most of those areas anyway, so it's the natural point to split it.

## Goals

- A persistent pending-surgery panel, always visible alongside the OT list (not a
  modal), showing patients not yet on the currently-open tab's list.
- Drag a pending patient's card directly onto a category zone (e.g. "Table 2") in
  the currently-open list to add them there — the category zone highlights while
  dragging so the drop target is unambiguous.
- A non-drag fallback ("+" button per pending card) for touch precision or anyone
  who doesn't want to drag — must produce the exact same result as dragging, via
  one shared function (not two divergent code paths).
- Pending panel sorted by longest-waiting first (earliest admission date) by
  default, so patients who've been pending longest surface at the top.
- Split `OTListManagement.tsx` into an orchestrator plus focused pieces, each well
  under the project's ~250-line convention.
- Design target is tablet/desktop (matches how this page already behaves — fixed
  min-width table, horizontal scroll, no phone-specific layout). On phone, the
  pending panel degrades to a button/drawer rather than staying always-visible —
  usable, but not the primary design target for this page.

## Non-goals

- No change to the three-tabs model (Major/Minor/EOT switched via tabs, one visible
  at a time) — considered and explicitly rejected in favor of keeping tabs plus a
  side panel, over showing all three lists as simultaneous columns (too cramped
  alongside a fourth panel, and a bigger layout departure from today).
- No change to reordering-within-a-list behavior — untouched, moves as-is into the
  extracted `OTListTable.tsx`.
- No change to Excel/PDF export *output* — only its *location* (extracted to plain
  functions), so existing exports keep producing byte-identical files.
- No full phone-first redesign of this page (see Goals — desktop/tablet primary).

## Architecture

The existing table's `@dnd-kit` setup already treats each category ("Table 1",
"Table 2", "Spinal Table", "Local Table") as its own drop zone via
`SortableContext`. The pending panel becomes a second draggable source *inside that
same shared `DndContext`* (owned by the orchestrator, `OTListManagement.tsx`) rather
than a separate drag system — dropping onto a specific category then works for
free, since categories are already distinct drop zones.

Pending-panel cards are plain `useDraggable` items (not `useSortable` — they don't
reorder among themselves), tagged with an id prefix (e.g. `pending-<ipNo>`) distinct
from in-list item ids (`OTPatient.id`, a `crypto.randomUUID()`), so the shared
`handleDragEnd` can tell which source a drop came from:

- **From pending** → build a new `OTPatient` entry for the target category (same
  logic the current "Add from Pending" button uses, pulled into one shared
  function so the button and the drag path can never drift apart) and append it to
  `otList`. The patient disappears from the pending panel immediately — already how
  the existing `!otList.some(...)` filter works.
- **From within the list** → reorder, exactly as today, unchanged.
- **Dropped outside any valid category zone** → no-op, no error.

While dragging, the category zone currently under the pointer (`isOver` in
`@dnd-kit`) gets a highlight style, so the valid drop target is visually
unambiguous.

## Components

- **`OTListManagement.tsx`** (orchestrator, trimmed down) — owns `otList` state,
  the shared `DndContext`/sensors, the drag handlers described above, and layout:
  the pending panel on the right, the active tab's table on the left.
- **`components/otlist/PendingSurgeryPanel.tsx`** — the new panel. Each row: name,
  IP number, diagnosis, days-pending (computed as today minus `doa`, the same field
  the default sort uses), a drag handle, and a "+" button (calls the same shared
  assign function as a drop would). Includes the search box already built for
  today's modal. Default sort: earliest `doa` first (longest-waiting patients
  surface first).
- **`components/otlist/OTListTable.tsx`** — the existing table extracted as-is:
  category grouping, editable cells, drag-to-reorder rows. No behavior change.
- **`utils/otListExport.ts`** — `exportOTListToExcel(otList, activeTab, meta)` and
  `exportOTListToPDF(otList, activeTab, meta)`, extracted as plain functions (list +
  metadata in, file out) — independently testable for the first time, and
  byte-identical output to today's inline versions.
- **Shared assign function** (lives with the orchestrator or a small
  `utils/otListAssign.ts` — implementer's call during planning): takes a `Patient`
  and a target category/`OTType`, returns the `OTPatient` entry to append
  (sequence number computed the same way `handleImportPatient` computes it today).
  Used by both the "+" button and the drag-drop path.

## Data Flow

1. Drag starts on a pending-panel card (`pending-<ipNo>`).
2. Hovering over a category zone highlights it.
3. On drop: source id prefix determines branch (assign vs. reorder), per
   Architecture above.
4. Assigned patient disappears from the panel the moment they're added (existing
   filter, unchanged).
5. Invalid drop (outside any zone) → no-op.

## Error Handling

This feature adds no new async operations or mutation failure modes beyond what
`handleImportPatient` already has today (a pure client-side state update — the OT
list itself isn't persisted to the database in the current implementation). The
only new states to handle:

- Pending panel empty (no patients currently pending surgery) → existing empty-state
  pattern (matches `ui/EmptyState.tsx` used elsewhere in the app).
- A patient somehow already present in the exact target category (shouldn't happen
  normally, since they'd already be filtered out of the pending list once added) →
  defensively ignored, not an error.

## Testing

Simulating drag gestures in tests exercises `@dnd-kit` more than this project's own
code, so it's not where testing effort goes. Instead:

- Unit test the shared "turn a pending `Patient` into an `OTPatient` entry for
  category X" function directly (used by both the "+" button and the drag path) —
  correct field mapping, correct sequence-number computation within the target
  category.
- Unit test `utils/otListExport.ts`'s two functions directly now that they're plain
  functions instead of buried in the component — a real coverage improvement over
  today, where this logic is only exercisable via full component render.
- No new tests needed for the extracted `OTListTable.tsx`'s reorder behavior — it's
  unchanged, moved as-is.
