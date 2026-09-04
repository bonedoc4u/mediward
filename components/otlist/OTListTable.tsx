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
 * assigned there — always registers, not just drops onto an existing row.
 *
 * `isHighlighted` (not this droppable's own `isOver`) drives the highlight
 * styling: with per-row `useSortable` droppables also inside this tbody,
 * `isOver` loses the collision to a row most of the time in a populated
 * category and flickers. The parent orchestrator already resolves "which
 * category is the current drag target" for its own reorder logic in
 * handleDragOver, so that resolved value is passed down here instead. */
function CategoryDropZone({ category, isEmpty, isHighlighted, children }: { category: string; isEmpty: boolean; isHighlighted: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: category });
  return (
    <tbody
      ref={setNodeRef}
      className={`divide-y divide-line border-b-4 border-line transition-colors ${
        isHighlighted ? 'bg-accent-soft ring-2 ring-inset ring-accent' : ''
      }`}
    >
      <tr className="bg-surface-sunken">
        <td colSpan={13} className="p-2 px-4 font-bold text-ink text-sm">
          {category}
        </td>
      </tr>
      {isEmpty ? (
        <tr>
          {/* Empty-state hint text: structural chrome per the mapping table's own guidance
              for this panel/state, not a disabled/placeholder input — ink-muted, not ink-faint. */}
          <td colSpan={13} className="p-4 text-center text-ink-muted text-xs italic">
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
  dragOverCategory: string | null;
}

const OTListTable: React.FC<OTListTableProps> = ({ activeTab, groupedItems, onUpdateEntry, onRemove, dragOverCategory }) => {
  const options = getTableOptionsForType(activeTab);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[1200px]">
        <thead>
          <tr className="bg-surface-sunken border-b border-line text-xs uppercase text-ink-muted font-semibold">
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
              <CategoryDropZone category={category} isEmpty={(groupedItems[category]?.length ?? 0) === 0} isHighlighted={category === dragOverCategory}>
                  {groupedItems[category]?.map((patient, index) => (
                      <SortableRow key={patient.id} id={patient.id} className="hover:bg-surface-sunken group bg-surface-card">
                          <td className="p-4 cursor-grab touch-none" data-drag-handle>
                              <GripVertical className="w-4 h-4 text-ink-muted" />
                          </td>
                          <td className="p-4">
                              <BottomSheetPicker
                                  title="Category"
                                  value={patient.category || ''}
                                  options={options.map(opt => ({ value: opt, label: opt }))}
                                  onChange={val => onUpdateEntry(patient.id, 'category', val)}
                                  triggerClassName="w-full text-sm font-bold text-ink flex items-center gap-1 cursor-pointer p-0"
                              />
                          </td>
                          <td className="p-4 text-ink-muted font-mono font-bold">
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
                          <td className="p-4 font-medium text-ink">
                              <input
                                  type="text"
                                  value={patient.name}
                                  onChange={(e) => onUpdateEntry(patient.id, 'name', e.target.value)}
                                  className="w-full bg-transparent border-none focus:ring-0 p-0 font-medium"
                                  placeholder="Name"
                              />
                          </td>
                          <td className="p-4 text-ink">
                              <div className="flex gap-1 items-center">
                                  <input
                                  type="text"
                                  value={patient.age}
                                  onChange={(e) => onUpdateEntry(patient.id, 'age', e.target.value)}
                                  /* Judgment call: focus:border-blue-500 was a decorative inline-edit
                                     focus indicator, not a lab/clinical value — per the mapping table's
                                     own blue carve-out, reclassified to accent (see task-5-report.md). */
                                  className="w-8 bg-transparent border-b border-transparent focus:border-accent focus:ring-0 p-0 text-center"
                                  placeholder="Age"
                                  />
                                  <span className="text-ink-muted">/</span>
                                  <BottomSheetPicker
                                      title="Gender"
                                      value={patient.gender}
                                      options={[{ value: 'M', label: 'M' }, { value: 'F', label: 'F' }]}
                                      onChange={val => onUpdateEntry(patient.id, 'gender', val)}
                                      triggerClassName="w-12 text-sm font-medium text-ink flex items-center gap-0.5 cursor-pointer p-0"
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
                                  triggerClassName="w-full text-sm font-medium text-ink flex items-center gap-1 cursor-pointer p-0"
                              />
                          </td>
                          <td className="p-4">
                              <textarea
                                  value={patient.implants}
                                  onChange={(e) => onUpdateEntry(patient.id, 'implants', e.target.value)}
                                  className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm resize-none text-ink-muted"
                                  rows={2}
                                  placeholder="Implants..."
                              />
                          </td>
                          <td className="p-4 text-right">
                              <button
                                  onClick={() => onRemove(patient.id)}
                                  className="text-ink-muted hover:text-vital-critical opacity-0 group-hover:opacity-100 transition-opacity"
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
