import React, { useState, useMemo, useEffect } from 'react';
import { Patient } from '../types';
import { useConfig } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { getOTCycleDates } from '../utils/otSchedule';
import { OTPatient, OTType, getOTTypeForDate, getTableOptionsForType, getDefaultCategoryForType } from '../utils/otListTypes';
import { buildOTPatientEntry } from '../utils/otListAssign';
import { hasPendingSurgery } from '../utils/calculations';
import { exportOTListToExcel, exportOTListToPDF } from '../utils/otListExport';
import { Plus, Calendar, Download, UserPlus, X, RefreshCw, FileSpreadsheet, Search, GripVertical, ShieldAlert } from 'lucide-react';
import OTListTable from './otlist/OTListTable';
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
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
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

  const filteredPending = pendingPatients.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.ipNo.includes(searchTerm)
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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find the containers (categories)
    const activeItem = otList.find(i => i.id === activeId);
    const overItem = otList.find(i => i.id === overId);
    
    if (!activeItem) return;

    // If over a container (category header/empty space) or an item in a different category
    const activeCategory = activeItem.category;
    const overCategory = overItem ? overItem.category : (getTableOptionsForType(activeTab).includes(overId) ? overId : null);


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

    if (active.id !== over?.id) {
      setOtList((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over?.id);
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
          onClick={() => setIsImportModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Add from Pending
        </button>

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

      {/* OT List Table with Drag and Drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <OTListTable
          activeTab={activeTab}
          groupedItems={groupedItems}
          onUpdateEntry={handleUpdateEntry}
          onRemove={handleRemove}
        />

        {/* Drag Overlay for visual feedback */}
        <DragOverlay>
            {activeId ? (
                <div className="p-2 bg-white rounded shadow-lg border border-slate-200 cursor-grabbing">
                    <GripVertical className="w-4 h-4 text-slate-600" />
                </div>
            ) : null}
        </DragOverlay>
      </DndContext>

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-900">Add from Pending List</h2>
              <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 border-b border-slate-100">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search by Name or IP Number..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                </div>
            </div>

            <div className="p-6 overflow-y-auto">
              {filteredPending.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No matching pending patients found.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredPending.map(patient => (
                    <div key={patient.ipNo} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                      <div>
                        <div className="font-medium text-slate-900">{patient.name} <span className="text-slate-500 text-sm">({patient.ipNo})</span></div>
                        <div className="text-sm text-slate-600">{patient.diagnosis}</div>
                        <div className="text-xs text-slate-500 mt-1">Planned: {patient.procedure}</div>
                      </div>
                      <button
                        onClick={() => handleAssignPatient(patient)}
                        className="p-2 bg-blue-100 text-teal-600 rounded-lg hover:bg-blue-200"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end">
                <button 
                    onClick={() => setIsImportModalOpen(false)}
                    className="px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors"
                >
                    Done
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OTListManagement;
