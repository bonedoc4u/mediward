import type { Collision } from '@dnd-kit/core';
import type { OTPatient } from './otListTypes';

/** The subset of an OT-list row this module needs — id + which category it's in. */
type RowLike = Pick<OTPatient, 'id' | 'category'>;

/**
 * Resolves which collision in closestCenter's result should be treated as
 * the drop target, in a way that's aware of *which category* a row belongs
 * to — not just "is this id a row at all".
 *
 * Root cause this exists for: every category `<tbody>` is also a
 * `useDroppable({ id: category })` zone (so an empty category can accept a
 * drop), which means the container competes on equal footing with the
 * per-row `useSortable` droppables inside it. `closestCenter` returns every
 * enabled droppable sorted by distance — rows from every category, plus
 * every category container — not a pre-filtered/intersecting set for "this
 * category". So a naive "promote the first row collision found anywhere"
 * is wrong: on the Major tab with TABLE 1 populated and TABLE 2 empty,
 * dropping into TABLE 2 can produce a collision list like
 * `[TABLE 2 (nearest), <a TABLE 1 row>, ...]` — promoting that TABLE 1 row
 * would silently assign the patient to TABLE 1 instead of TABLE 2. That
 * defeats the entire point of making empty categories droppable, and it's
 * silent — the row just appears under the wrong header with no error.
 *
 * Fix: only ever promote a row that belongs to the *same category* as
 * whichever collision closestCenter ranked nearest. If the nearest
 * collision is already a row, there's nothing to fix. If it's a category
 * container, only a same-category row can be promoted ahead of it — a row
 * from a different category is left where it is. If no same-category row
 * exists (the true empty-category case), the container stays the resolved
 * target, which is exactly what that case needs.
 */
export function preferRowCollision<T extends Collision>(collisions: T[], otList: RowLike[]): T[] {
  if (collisions.length === 0) return collisions;

  const top = collisions[0];
  const topIsRow = otList.some(item => item.id === top.id);
  if (topIsRow) return collisions;

  // `top.id` is a category container id (the category name) — only promote
  // a row that actually belongs to *this* category, never a row from a
  // different one.
  const sameCategoryRow = collisions.find(c => {
    const item = otList.find(i => i.id === c.id);
    return item !== undefined && item.category === top.id;
  });

  if (!sameCategoryRow) return collisions;
  return [sameCategoryRow, ...collisions.filter(c => c !== sameCategoryRow)];
}
