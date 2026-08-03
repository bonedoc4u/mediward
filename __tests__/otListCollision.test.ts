import { describe, it, expect } from 'vitest';
import { preferRowCollision } from '../utils/otListCollision';

describe('preferRowCollision (OT list drag-and-drop, category-vs-row collision ambiguity)', () => {
  // A realistic Major-tab scenario: TABLE 1 has two rows, TABLE 2 is empty.
  // closestCenter's real output always includes every enabled droppable —
  // rows from every category plus every category container — so a
  // TABLE-1-only synthetic list (no other-category rows) would not be a
  // faithful test of the real regression.
  const otList = [
    { id: 'row-1', category: 'TABLE 1' },
    { id: 'row-2', category: 'TABLE 1' },
  ];

  it('leaves the collision list alone when the nearest collision is already a row', () => {
    const collisions = [{ id: 'row-2' }, { id: 'TABLE 1' }, { id: 'row-1' }];
    const result = preferRowCollision(collisions, otList);
    expect(result).toEqual(collisions);
  });

  it('promotes a same-category row when the container is nearest but a row from its own category is present', () => {
    // Dropping near the middle of the populated TABLE 1 — closestCenter can
    // still rank the container #1 even though row-2 is what's under the
    // pointer.
    const collisions = [{ id: 'TABLE 1' }, { id: 'row-2' }, { id: 'row-1' }];
    const result = preferRowCollision(collisions, otList);
    expect(result[0].id).toBe('row-2');
  });

  it('does NOT promote a row from a different category — the empty-category regression', () => {
    // Dropping into TABLE 2 (empty). The real collision list still includes
    // TABLE 1's rows (sorted by distance), even though the drop target is
    // TABLE 2. Promoting a TABLE 1 row here would silently assign the
    // patient to TABLE 1 instead of TABLE 2 — exactly the bug the
    // containment check exists to prevent.
    const collisions = [{ id: 'TABLE 2' }, { id: 'row-1' }, { id: 'row-2' }];
    const result = preferRowCollision(collisions, otList);
    expect(result).toEqual(collisions);
    expect(result[0].id).toBe('TABLE 2');
  });

  it('promotes the same-category row specifically, not just whichever row appears first in the list', () => {
    // TABLE 1 is nearest; the very next entry in the raw collision list is
    // a row belonging to a *different* category (TABLE 2), with the
    // matching TABLE 1 row further down. A naive "first row found anywhere"
    // implementation would wrongly grab the TABLE 2 row.
    const mixedOtList = [
      { id: 'row-1', category: 'TABLE 1' },
      { id: 'row-3', category: 'TABLE 2' },
    ];
    const collisions = [{ id: 'TABLE 1' }, { id: 'row-3' }, { id: 'row-1' }];
    const result = preferRowCollision(collisions, mixedOtList);
    expect(result[0].id).toBe('row-1');
  });

  it('returns an empty array unchanged when there are no collisions at all', () => {
    expect(preferRowCollision([], otList)).toEqual([]);
  });

  it('leaves the list unchanged when the nearest collision is an unrecognised id with no same-category row to promote', () => {
    const collisions = [{ id: 'some-other-id' }, { id: 'row-1' }];
    const result = preferRowCollision(collisions, otList);
    expect(result).toEqual(collisions);
  });
});
