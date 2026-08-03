import React, { useState, useMemo, useEffect } from 'react';
import { Patient } from '../types';
import { useConfig } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { getOTCycleDates } from '../utils/otSchedule';
import { OTPatient, OTType, getOTTypeForDate, getTableOptionsForType, getDefaultCategoryForType } from '../utils/otListTypes';
import { buildOTPatientEntry } from '../utils/otListAssign';
import { preferRowCollision } from '../utils/otListCollision';
import { hasPendingSurgery } from '../utils/calculations';
import { exportOTListToExcel, exportOTListToPDF } from '../utils/otListExport';
import { Plus, Calendar, Download, UserPlus, X, RefreshCw, FileSpreadsheet, GripVertical, ShieldAlert } from 'lucide-react';
import OTListTable from './otlist/OTListTable';
import PendingSurgeryPanel from './otlist/PendingSurgeryPanel';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  CollisionDetection,
} from '@dnd-kit/core';
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';

interface OTListManagementProps {
  patients: Patient[];
  onUpdatePatient: (patient: Patient) => void;
}

const OTListManagement: React.FC<OTListManagementProps> = ({ patients }) => {
  const { unitChiefs, hospitalName, department, weekendDuty } = useConfig();
  const { user, selectedUnit } = useAuth();
  const [activeTab, setActiveTab] = useState<OTType>('Major');

  // Resolve the effective unit: admin's picker selection takes priority over profile unit
  const effectiveUnit = (
    user?.role === 'admin' && selectedUnit && selectedUnit !== 'all'
      ? selectedUnit
      : user?.unit ?? 'OR1'
  ).toUpperCase();

  // OT cycle = the 7 days after this unit's admission day (see getOTCycleDates).
  // Each tab defaults to that cycle's Major / Minor / EOT date.
  const cycle = useMemo(() => getOTCycleDates(effectiveUnit, new Date(), weekendDuty), [effectiveUnit, weekendDuty]);
  const [majorDate, setMajorDate] = useState<string>(cycle.majorDate);
  const [minorDate, setMinorDate] = useState<string>(cycle.minorDate);
  const [eotDate,   setEotDate]   = useState<string>(cycle.eotDate);
  // Re-anchor when the unit changes (any manual date edits reset to the cycle).
  useEffect(() => {
    setMajorDate(cycle.majorDate);
    setMinorDate(cycle.minorDate);
    setEotDate(cycle.eotDate);
  }, [cycle]);

  const selectedDate    = activeTab === 'Major' ? majorDate : activeTab === 'Minor' ? minorDate : eotDate;
  const setSelectedDate = activeTab === 'Major' ? setMajorDate : activeTab === 'Minor' ? setMinorDate : setEotDate;
  const [otList, setOtList] = useState<OTPatient[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Which category is the current resolved drag target (for the
  // CategoryDropZone highlight — see handleDragOver for how it's resolved).
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [surgeonUnit, setSurgeonUnit] = useState(effectiveUnit);
  const [surgeon, setSurgeon] = useState('');
  const [otTime, setOtTime] = useState('8.00AM');

  // Auto-fill surgeon from unit chiefs whenever the unit or chiefs config changes
  useEffect(() => {
    const key = surgeonUnit.replace(/\s+/g, '').toUpperCase();
    const chief = unitChiefs[key];
    if (chief) setSurgeon(chief);
  }, [surgeonUnit, unitChiefs]);

  // Auto-populate patients whose plannedDos matches any of the three tab dates
  useEffect(() => {
    const tabDates: Array<{ date: string; fallbackType: OTType }> = [
      { date: majorDate, fallbackType: 'Major' },
      { date: minorDate, fallbackType: 'Minor' },
      { date: eotDate,   fallbackType: 'EOT'   },
      // Weekend EOT days when this unit is on weekend duty this cycle.
      ...cycle.eotWeekendDates.map(date => ({ date, fallbackType: 'EOT' as OTType })),
    ];
    setOtList(prev => {
      const existing = new Set(prev.map(p => p.ipNo));
      const toAdd: OTPatient[] = [];
      for (const { date, fallbackType } of tabDates) {
        const dated = patients.filter(p => p.plannedDos === date && hasPendingSurgery(p));
        dated.forEach(p => {
          if (existing.has(p.ipNo) || toAdd.some(x => x.ipNo === p.ipNo)) return;
          const unit     = (p.unit ?? '').toUpperCase();
          const otType   = getOTTypeForDate(unit, date) ?? fallbackType;
          const category = getDefaultCategoryForType(otType);
          const seqBase  = prev.filter(x => x.otType === otType).length + toAdd.filter(x => x.otType === otType).length;
          toAdd.push({
            id: crypto.randomUUID(),
            sequence: seqBase + 1,
            ipNo: p.ipNo,
            name: p.name,
            age: p.age.toString(),
            gender: p.gender === 'Male' ? 'M' : p.gender === 'Female' ? 'F' : '',
            ward: p.ward.replace(/Ward\s*/i, '').trim(),
            unit: p.unit ?? '',
            diagnosis: p.diagnosis,
            procedure: p.procedure ?? '',
            side: '', anesthesia: '', cArm: 'No', implants: '',
            remarks: p.comorbidities.join(', '),
            category,
            otType,
          });
        });
      }
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
    });
   
  }, [majorDate, minorDate, eotDate, patients, cycle]);

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
        activationConstraint: {
            distance: 8, // Require movement of 8px before drag starts (prevents accidental clicks)
        },
    }),
    useSensor(TouchSensor, {
        activationConstraint: {
            delay: 250, // Press and hold for 250ms to start drag
            tolerance: 5, // Allow 5px movement during hold
        },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Filter pending patients for import (not yet in the current tab's list)
  const pendingPatients = patients.filter(p =>
    hasPendingSurgery(p) &&
    !otList.some(ot => ot.ipNo === p.ipNo && ot.otType === activeTab)
  );

  // Group items by category for the active tab only
  const groupedItems = useMemo(() => {
    const opts = getTableOptionsForType(activeTab);
    const groups: Record<string, OTPatient[]> = {};
    opts.forEach(opt => { groups[opt] = []; });

    const tabItems = otList.filter(i => i.otType === activeTab);
    const sorted   = [...tabItems].sort((a, b) => a.sequence - b.sequence);

    sorted.forEach(item => {
      const cat = item.category && groups[item.category] !== undefined ? item.category : opts[0];
      groups[cat].push(item);
    });
    return groups;
  }, [otList, activeTab]);

  // closestCenter alone can resolve a drop to a category's <tbody> droppable
  // instead of the specific row under the pointer (see utils/otListCollision
  // for the root cause). Preferring a row collision when one exists keeps
  // reorders landing where the user aimed; falling back to the container is
  // still correct for the empty-category case this mechanism exists for.
  const collisionDetection: CollisionDetection = (args) => {
    const collisions = closestCenter(args);
    return preferRowCollision(collisions, otList.map(item => item.id));
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) {
      setDragOverCategory(null);
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find the containers (categories)
    const activeItem = otList.find(i => i.id === activeId);
    const overItem = otList.find(i => i.id === overId);

    // Resolved drop-target category — drives the CategoryDropZone highlight
    // for both an existing row being reordered and a pending card being
    // assigned (neither of which is in `otList` as `activeItem` for the
    // latter, so this is computed independently of activeItem).
    const overCategory = overItem ? overItem.category : (getTableOptionsForType(activeTab).includes(overId) ? overId : null);
    setDragOverCategory(overCategory ?? null);

    if (!activeItem) return;

    // If over a container (category header/empty space) or an item in a different category
    const activeCategory = activeItem.category;

    if (activeCategory !== overCategory && overCategory) {
        setOtList((items) => {
            return items.map(item => {
                if (item.id === activeId) {
                    return { ...item, category: overCategory };
                }
                return item;
            });
        });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setDragOverCategory(null);
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
        // -1 here means `over` resolved to a category container (the
        // tbody's own droppable id, e.g. an empty category) rather than a
        // specific row — collisionDetection above already prefers a row
        // collision when one exists, so this only happens for that
        // empty-category case. arrayMove computes its insertion index from
        // `items.length` *before* the source item is removed, so a negative
        // newIndex here appends the dragged item to the end of `items`
        // (and, after the resequencing below, to the end of its category) —
        // that's the intended behaviour, not a bug.
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

        // Merge back with items from other tabs unchanged
        const otherTabItems = newItems.filter(i => i.otType !== activeTab);
        return [...otherTabItems, ...resequenced];
      });
    }
  };

  const handleAssignPatient = (patient: Patient, category: string = getDefaultCategoryForType(activeTab)) => {
    const existingInCategory = otList.filter(p => p.otType === activeTab && p.category === category);
    const newEntry = buildOTPatientEntry(patient, activeTab, category, existingInCategory);
    setOtList(prev => [...prev, newEntry]);
  };

  const handleRemove = (id: string) => {
    setOtList(prev => prev.filter(p => p.id !== id));
  };

  const handleClearList = () => {
      if (window.confirm('Are you sure you want to clear the entire list?')) {
          setOtList([]);
      }
  };

  const handleAddManualEntry = () => {
    const defaultCategory = getDefaultCategoryForType(activeTab);
    const existingInTab   = otList.filter(p => p.otType === activeTab && p.category === defaultCategory);
    const maxSeq          = Math.max(0, ...existingInTab.map(p => p.sequence));
    const newEntry: OTPatient = {
      id: crypto.randomUUID(),
      sequence: maxSeq + 1,
      ipNo: '', name: '', age: '', gender: 'M',
      ward: '', unit: surgeonUnit,
      diagnosis: '', procedure: '',
      side: '', anesthesia: '', cArm: 'No', implants: '', remarks: '',
      category: defaultCategory,
      otType: activeTab,
    };
    setOtList(prev => [...prev, newEntry]);
  };

  const handleExportExcel = () => {
    exportOTListToExcel(otList, activeTab, { hospitalName, department, selectedDate, surgeon, surgeonUnit, otTime });
  };

  const handleExportPDF = () => {
    exportOTListToPDF(otList, activeTab, { hospitalName, department, selectedDate, surgeon, surgeonUnit, otTime });
  };

  const handleUpdateEntry = (id: string, field: keyof OTPatient, value: string) => {
    setOtList(prev => {
        // If category changes, we need to update the sequence for this item in the new category
        if (field === 'category') {
             const existingInNewCat = prev.filter(p => p.category === value && p.id !== id);
             const maxSeq = Math.max(0, ...existingInNewCat.map(p => p.sequence));
             return prev.map(p => p.id === id ? { ...p, [field]: value, sequence: maxSeq + 1 } : p);
        }
        return prev.map(p => p.id === id ? { ...p, [field]: value } : p);
    });
  };

  return (
    <div className="p-6 max-w-full mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">OT List Management</h1>
          <p className="text-slate-500">Plan and manage surgical lists for Major, Minor and Emergency OT</p>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-lg shadow-sm border border-slate-200">
          <Calendar className="w-5 h-5 text-slate-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="outline-none text-slate-700 font-medium bg-transparent"
          />
        </div>
      </div>

      {/* Weekend EOT duty hint — shown on the EOT tab when this unit is on weekend duty this cycle */}
      {activeTab === 'EOT' && cycle.eotWeekendDates.length > 0 && (
        <div className="flex items-center gap-2 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          {effectiveUnit} is on weekend duty this cycle — weekend EOT:{' '}
          {cycle.eotWeekendDates
            .map(d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }))
            .join(', ')}
          . Cases dated on these days appear in this list.
        </div>
      )}

      {/* List Meta — Surgeon / Unit / Time (editable, used in exports) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Surgeon</label>
          <input
            type="text"
            value={surgeon}
            onChange={e => setSurgeon(e.target.value)}
            placeholder="Surgeon name…"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Unit</label>
          <input
            type="text"
            value={surgeonUnit}
            onChange={e => setSurgeonUnit(e.target.value)}
            placeholder="e.g. OR 1"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Time</label>
          <input
            type="text"
            value={otTime}
            onChange={e => setOtTime(e.target.value)}
            placeholder="e.g. 8.00AM"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl w-fit">
        {(['Major', 'Minor', 'EOT'] as OTType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === tab
                ? tab === 'EOT'
                  ? 'bg-white text-red-600 shadow-sm'
                  : 'bg-white text-teal-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            {tab === 'EOT' ? 'EOT List' : `${tab} OT List`}
          </button>
        ))}
      </div>

      {/* Actions Toolbar */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleAddManualEntry}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors border border-slate-300"
        >
          <Plus className="w-4 h-4" />
          Add Row
        </button>

        <button
          onClick={handleClearList}
          className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Clear List
        </button>

        <div className="ml-auto flex gap-2">
            <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel
            </button>

            <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors"
            >
            <Download className="w-4 h-4" />
            Export PDF
            </button>
        </div>
      </div>

      {/* OT List Table + Pending Panel with Drag and Drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
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
              dragOverCategory={dragOverCategory}
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
          surface on phone — matches the drag cards' existing tap-to-add fallback).
          bottom uses --fab-bottom (index.css) instead of a fixed Tailwind
          offset so it clears App.tsx's fixed mobile bottom-nav bar, which
          renders after this and would otherwise paint over most of it. */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed right-6 z-40 flex items-center gap-2 px-4 py-3 bg-teal-600 text-white rounded-full shadow-lg"
        style={{ bottom: 'var(--fab-bottom)' }}
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
    </div>
  );
};

export default OTListManagement;
