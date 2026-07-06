import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { SortableRow } from '../../components/OTListManagement';

// SortableRow needs a DndContext + SortableContext ancestor (useSortable reads them via context).
function renderRow() {
  return render(
    <DndContext>
      <SortableContext items={['row-1']}>
        <table>
          <tbody>
            <SortableRow id="row-1">
              <td data-drag-handle>handle</td>
              <td>
                <textarea aria-label="Operation" defaultValue="" />
              </td>
            </SortableRow>
          </tbody>
        </table>
      </SortableContext>
    </DndContext>,
  );
}

describe('SortableRow (OT list, iOS horizontal-scroll regression)', () => {
  it('does not set touch-action: none on the row itself', () => {
    const { getByRole } = renderRow();
    const row = getByRole('row');

    // touch-action: none on an ancestor blocks horizontal scroll of the
    // overflow-x-auto table wrapper for every descendant cell (Table/Category
    // picker, Operation/Implants textareas) — not just the drag handle.
    // Only the handle cell should carry it; the row must not.
    expect(row.style.touchAction).not.toBe('none');
  });
});
