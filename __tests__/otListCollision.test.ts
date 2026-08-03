import { describe, it, expect } from 'vitest';
import { preferRowCollision } from '../utils/otListCollision';

describe('preferRowCollision (OT list drag-and-drop, category-vs-row collision ambiguity)', () => {
  const rowIds = ['row-1', 'row-2', 'row-3'];

  it('promotes a row collision to the front when the base algorithm ranked a category container first', () => {
    // This is the populated-category regression: closestCenter can rank the
    // tbody's own droppable (id = category name) ahead of the specific row
    // under the pointer.
    const collisions = [{ id: 'TABLE 1' }, { id: 'row-2' }, { id: 'row-3' }];
    const result = preferRowCollision(collisions, rowIds);
    expect(result[0].id).toBe('row-2');
  });

  it('falls back to the base collisions unchanged when no row collision exists (empty-category case)', () => {
    const collisions = [{ id: 'TABLE 1' }];
    const result = preferRowCollision(collisions, rowIds);
    expect(result).toEqual(collisions);
  });

  it('leaves the order alone when a row collision is already first', () => {
    const collisions = [{ id: 'row-1' }, { id: 'TABLE 1' }];
    const result = preferRowCollision(collisions, rowIds);
    expect(result[0].id).toBe('row-1');
    expect(result).toHaveLength(2);
  });

  it('returns an empty array unchanged when there are no collisions at all', () => {
    expect(preferRowCollision([], rowIds)).toEqual([]);
  });

  it('ignores collisions that belong to a different tab/category set entirely', () => {
    // e.g. a stale id that no longer matches any current row.
    const collisions = [{ id: 'some-other-id' }];
    const result = preferRowCollision(collisions, rowIds);
    expect(result).toEqual(collisions);
  });
});
