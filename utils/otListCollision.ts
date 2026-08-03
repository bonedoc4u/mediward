import type { Collision } from '@dnd-kit/core';

/**
 * Prefers a specific OT-list row over a category container when both show
 * up in a collision-detection result.
 *
 * Root cause this exists for: every category `<tbody>` is also a
 * `useDroppable({ id: category })` zone (so an empty category can accept a
 * drop), which means the container competes on equal footing with the
 * per-row `useSortable` droppables inside it. Near the vertical middle of a
 * populated category, plain `closestCenter` can resolve to the *container*
 * instead of a specific row. Callers that then do
 * `items.findIndex(i => i.id === over.id)` get -1 for that case, which
 * silently lands a reorder at the end of the category instead of where the
 * user aimed, and it makes the category highlight flicker.
 *
 * Preferring a row collision when one exists — falling back to the
 * container only when there isn't one (the empty-category case this
 * mechanism was built for) — fixes the ambiguity at the source.
 */
export function preferRowCollision<T extends Collision>(collisions: T[], rowIds: Iterable<string>): T[] {
  const ids = rowIds instanceof Set ? rowIds : new Set(rowIds);
  const rowCollision = collisions.find(c => ids.has(String(c.id)));
  if (!rowCollision) return collisions;
  // Promote without duplicating — the row collision may already be present
  // (and even already first) in `collisions`.
  return [rowCollision, ...collisions.filter(c => c !== rowCollision)];
}
