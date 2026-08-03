import React, { useState, useMemo, useEffect } from 'react';
import { Patient } from '../types';
import { useConfig } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { getOTCycleDates } from '../utils/otSchedule';
import { OTPatient, OTType, getOTTypeForDate, getTableOptionsForType, getDefaultCategoryForType } from '../utils/otListTypes';
import { hasPendingSurgery } from '../utils/calculations';
import * as XLSX from 'xlsx-js-style';
import { Plus, Trash2, Calendar, Download, UserPlus, X, RefreshCw, FileSpreadsheet, Search, GripVertical, ShieldAlert } from 'lucide-react';
import BottomSheetPicker from './ui/BottomSheetPicker';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface OTListManagementProps {
  patients: Patient[];
  onUpdatePatient: (patient: Patient) => void;
}

// Sortable Row Component
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
    // touch-action must NOT be set here: an ancestor's touch-action:none blocks
    // horizontal scroll (of the overflow-x-auto table wrapper) for every descendant
    // touch, not just the drag handle's. The handle's own `touch-none` class
    // (data-drag-handle cell below) is what dnd-kit's TouchSensor actually needs.
    //
    // But allowing normal panning again means an imprecise tap/drag near a
    // picker can be read by iOS Safari as a text-selection drag across the
    // row's plain-text cells. Suppress that at the row level — safe for the
    // <input>/<textarea> cells nested inside, since user-select has no effect
    // on a form control's own internals (it manages its own text selection).
    WebkitUserSelect: 'none' as const,
    userSelect: 'none' as const,
    WebkitTouchCallout: 'none' as const,
  };

  // Clone children to inject listeners into the drag handle
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

  const handleImportPatient = (patient: Patient) => {
    const wardNumber      = patient.ward.replace(/Ward\s*/i, '').trim();
    const defaultCategory = getDefaultCategoryForType(activeTab);
    const existingInTab   = otList.filter(p => p.otType === activeTab && p.category === defaultCategory);
    const maxSeq          = Math.max(0, ...existingInTab.map(p => p.sequence));
    const newEntry: OTPatient = {
      id: crypto.randomUUID(),
      sequence: maxSeq + 1,
      ipNo: patient.ipNo,
      name: patient.name,
      age: patient.age.toString(),
      gender: patient.gender === 'Male' ? 'M' : patient.gender === 'Female' ? 'F' : '',
      ward: wardNumber,
      unit: patient.unit ?? 'OR1',
      diagnosis: patient.diagnosis,
      procedure: patient.procedure ?? '',
      side: '', anesthesia: '', cArm: 'No', implants: '',
      remarks: patient.comorbidities.join(', '),
      category: defaultCategory,
      otType: activeTab,
    };
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
    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [];

    // --- Global Header Data ---
    // Row 1: Hospital Name
    wsData.push([hospitalName]);
    // Row 2: Department
    wsData.push([department]);
    // Row 3: List Name
    wsData.push([`${activeTab.toUpperCase()} OPERATION LIST`]);
    
    // Row 4: Date / Surgeon / Unit / Time — exact format matching the original
    const dateStr = selectedDate.split('-').reverse().join('/');
    wsData.push([`DATE:${dateStr}    SURGEON : ${surgeon}    UNIT :${surgeonUnit}               TIME:${otTime}`]);

    // --- Data Preparation ---
    let lastCategory = '';
    let displaySequence = 1;

    const exportList = [...otList].filter(p => p.otType === activeTab).sort((a, b) => {
        if (a.category === b.category) return a.sequence - b.sequence;
        return (a.category || '').localeCompare(b.category || '');
    });

    const colHeaders = ["SL NO", "IP NO", "UNIT", "NAME", "AGE", "WARD", "DIAGNOSIS", "OPERATION", "C ARM", "IMPLANTS"];

    let currentRowIndex = 4;
    const headerRows = [0, 1, 2, 3];
    const categoryHeaderRows: number[] = [];
    const dataRows: number[] = [];

    exportList.forEach(patient => {
        if (patient.category && patient.category !== lastCategory) {
            // Category Header Row: [Category Name, SL NO, IP NO, ...]
            wsData.push([
                patient.category,
                ...colHeaders
            ]);
            categoryHeaderRows.push(currentRowIndex);
            currentRowIndex++;
            lastCategory = patient.category;
            displaySequence = 1; // Reset sequence for new table
        }

        const wardNum = patient.ward.replace(/Ward\s*/i, '').trim();
        
        wsData.push([
            '', // Empty cell under Category Name
            displaySequence++, // Use generated sequence
            patient.ipNo,
            patient.unit,
            patient.name,
            `${patient.age}/${patient.gender}`,
            wardNum,
            patient.diagnosis,
            patient.procedure,
            patient.cArm,
            patient.implants
        ]);
        dataRows.push(currentRowIndex);
        currentRowIndex++;
    });

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // --- Styling ---
    // Define styles
    const borderStyle = {
        top: { style: "thin", color: { rgb: "000000" } },
        bottom: { style: "thin", color: { rgb: "000000" } },
        left: { style: "thin", color: { rgb: "000000" } },
        right: { style: "thin", color: { rgb: "000000" } }
    };

    const globalHeaderStyle = {
        font: { bold: true, sz: 12 },
        alignment: { horizontal: "center", vertical: "center" },
        fill: { fgColor: { rgb: "FFFFFF" } } // White background to match PDF
    };

    const categoryHeaderStyle = {
        font: { bold: true },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        fill: { fgColor: { rgb: "FFF2CC" } }, // Light Yellow 2
        border: borderStyle
    };

    const dataCellStyle = {
        font: { sz: 10 },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: borderStyle
    };

    // Apply styles to cells
    const range = XLSX.utils.decode_range(ws['!ref'] || "A1:A1");

    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[cellRef]) continue;

            // Global Headers (Rows 0-3)
            if (headerRows.includes(R)) {
                ws[cellRef].s = globalHeaderStyle;
            }
            // Category Headers
            else if (categoryHeaderRows.includes(R)) {
                ws[cellRef].s = categoryHeaderStyle;
            }
            // Data Rows
            else if (dataRows.includes(R)) {
                ws[cellRef].s = dataCellStyle;
            }
        }
    }

    // --- Merges ---
    if (!ws['!merges']) ws['!merges'] = [];
    // Merge global headers across all columns (A to K -> 0 to 10)
    headerRows.forEach(r => {
        ws['!merges']?.push({ s: { r: r, c: 0 }, e: { r: r, c: 10 } });
    });

    // --- Column Widths ---
    ws['!cols'] = [
        { wch: 15 }, // A: Category
        { wch: 8 },  // B: SL NO
        { wch: 12 }, // C: IP NO
        { wch: 8 },  // D: UNIT
        { wch: 25 }, // E: NAME
        { wch: 10 }, // F: AGE/SEX
        { wch: 8 },  // G: WARD
        { wch: 30 }, // H: DIAGNOSIS
        { wch: 30 }, // I: OPERATION
        { wch: 10 }, // J: C ARM
        { wch: 20 }  // K: IMPLANTS
    ];

    XLSX.utils.book_append_sheet(wb, ws, `${activeTab} OT List`);
    XLSX.writeFile(wb, `${activeTab}_OT_List_${selectedDate}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape
    
    // --- Header Section ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12); // Increased slightly for visibility
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = pageWidth / 2;
    
    doc.text(hospitalName, centerX, 10, { align: 'center' });
    doc.text(department, centerX, 16, { align: 'center' });
    doc.text(`${activeTab.toUpperCase()} OPERATION LIST`, centerX, 22, { align: 'center' });
    
    // Sub-header row — single line matching exact Excel format
    doc.setFontSize(10);
    const dateStr = selectedDate.split('-').reverse().join('/');
    const subHeaderY = 30;
    doc.text(
      `DATE:${dateStr}    SURGEON : ${surgeon}    UNIT :${surgeonUnit}               TIME:${otTime}`,
      14, subHeaderY
    );

    // --- Table Data Construction ---
    const tableRows: any[] = [];
    let lastCategory = '';
    let displaySequence = 1;

    const sortedList = [...otList].filter(p => p.otType === activeTab).sort((a, b) => {
        if (a.category === b.category) return a.sequence - b.sequence;
        return (a.category || '').localeCompare(b.category || '');
    });

    const headers = ["SL NO", "IP NO", "UNIT", "NAME", "AGE", "WARD", "DIAGNOSIS", "OPERATION", "C ARM", "IMPLANTS"];

    sortedList.forEach(patient => {
        // If category changes, insert a header row
        if (patient.category && patient.category !== lastCategory) {
            tableRows.push([
                { content: patient.category, styles: { fontStyle: 'bold', halign: 'center', valign: 'middle' } },
                ...headers.map(h => ({ content: h, styles: { fontStyle: 'bold', halign: 'center', valign: 'middle' } }))
            ]);
            lastCategory = patient.category;
            displaySequence = 1; // Reset sequence
        }

        // Clean ward number for export
        const wardNum = patient.ward.replace(/Ward\s*/i, '').trim();

        tableRows.push([
            '', // Empty cell under Table Name
            displaySequence++, // Use generated sequence
            patient.ipNo,
            patient.unit,
            patient.name,
            `${patient.age}/${patient.gender}`,
            wardNum,
            patient.diagnosis,
            patient.procedure,
            patient.cArm,
            patient.implants
        ]);
    });

    autoTable(doc, {
      body: tableRows,
      startY: 35,
      theme: 'grid',
      styles: { 
          fontSize: 8, 
          cellPadding: 1.5, 
          lineColor: [0, 0, 0], 
          lineWidth: 0.1,
          font: 'helvetica',
          fontStyle: 'bold', // Make all text bold
          textColor: [0, 0, 0],
          valign: 'middle',
          overflow: 'linebreak',
          halign: 'center' // Center align everything
      },
      didParseCell: (data) => {
          // Apply styling to the header rows
          const row = data.row;
          if (row && Array.isArray(row.raw)) {
             const cell2 = row.raw[1] as unknown;
             const isHeader = typeof cell2 === 'object' && cell2 !== null &&
               'content' in cell2 && (cell2 as { content: unknown }).content === 'SL NO';

             if (isHeader) {
                 data.cell.styles.fillColor = [255, 242, 204]; // Light Yellow 2
             }
          }
      },
      columnStyles: {
          0: { cellWidth: 15 }, // Table Name
          1: { cellWidth: 10 }, // SL NO
          2: { cellWidth: 15 }, // IP NO
          3: { cellWidth: 12 }, // UNIT
          4: { cellWidth: 35 }, // NAME
          5: { cellWidth: 15 }, // AGE
          6: { cellWidth: 12 }, // WARD
          7: { cellWidth: 45 }, // DIAGNOSIS
          8: { cellWidth: 45 }, // OPERATION
          9: { cellWidth: 15 }, // C ARM
          10: { cellWidth: 'auto' } // IMPLANTS
      },
      margin: { top: 35, left: 10, right: 10 }
    });

    doc.save(`${activeTab}_OT_List_${selectedDate}.pdf`);
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
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1200px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold">
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
              {getTableOptionsForType(activeTab).map(category => (
                <SortableContext
                    key={category}
                    id={category} 
                    items={groupedItems[category] || []}
                    strategy={verticalListSortingStrategy}
                >
                    <tbody className="divide-y divide-slate-100 border-b-4 border-slate-100">
                        {/* Category Header Row */}
                        <tr className="bg-slate-100">
                            <td colSpan={13} className="p-2 px-4 font-bold text-slate-700 text-sm">
                                {category}
                            </td>
                        </tr>
                        
                        {groupedItems[category]?.length === 0 ? (
                            <tr>
                                <td colSpan={13} className="p-4 text-center text-slate-400 text-xs italic">
                                    Drag items here
                                </td>
                            </tr>
                        ) : (
                            groupedItems[category].map((patient, index) => (
                                <SortableRow key={patient.id} id={patient.id} className="hover:bg-slate-50 group bg-white">
                                    <td className="p-4 cursor-grab touch-none" data-drag-handle>
                                        <GripVertical className="w-4 h-4 text-slate-400" />
                                    </td>
                                    <td className="p-4">
                                        <BottomSheetPicker
                                            title="Category"
                                            value={patient.category || ''}
                                            options={getTableOptionsForType(activeTab).map(opt => ({ value: opt, label: opt }))}
                                            onChange={val => handleUpdateEntry(patient.id, 'category', val)}
                                            triggerClassName="w-full text-sm font-bold text-slate-700 flex items-center gap-1 cursor-pointer p-0"
                                        />
                                    </td>
                                    <td className="p-4 text-slate-500 font-mono font-bold">
                                        {/* Auto-calculated sequence based on index + 1 */}
                                        {index + 1}
                                    </td>
                                    <td className="p-4">
                                        <input 
                                            type="text" 
                                            value={patient.ipNo}
                                            onChange={(e) => handleUpdateEntry(patient.id, 'ipNo', e.target.value)}
                                            className="w-full bg-transparent border-none focus:ring-0 p-0 font-mono text-sm"
                                            placeholder="IP No"
                                        />
                                    </td>
                                    <td className="p-4">
                                        <input 
                                            type="text" 
                                            value={patient.unit}
                                            onChange={(e) => handleUpdateEntry(patient.id, 'unit', e.target.value)}
                                            className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm"
                                            placeholder="Unit"
                                        />
                                    </td>
                                    <td className="p-4 font-medium text-slate-900">
                                        <input 
                                            type="text" 
                                            value={patient.name}
                                            onChange={(e) => handleUpdateEntry(patient.id, 'name', e.target.value)}
                                            className="w-full bg-transparent border-none focus:ring-0 p-0 font-medium"
                                            placeholder="Name"
                                        />
                                    </td>
                                    <td className="p-4 text-slate-600">
                                        <div className="flex gap-1 items-center">
                                            <input 
                                            type="text" 
                                            value={patient.age}
                                            onChange={(e) => handleUpdateEntry(patient.id, 'age', e.target.value)}
                                            className="w-8 bg-transparent border-b border-transparent focus:border-blue-500 focus:ring-0 p-0 text-center"
                                            placeholder="Age"
                                            />
                                            <span className="text-slate-400">/</span>
                                            <BottomSheetPicker
                                                title="Gender"
                                                value={patient.gender}
                                                options={[{ value: 'M', label: 'M' }, { value: 'F', label: 'F' }]}
                                                onChange={val => handleUpdateEntry(patient.id, 'gender', val)}
                                                triggerClassName="w-12 text-sm font-medium text-slate-700 flex items-center gap-0.5 cursor-pointer p-0"
                                            />
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <input 
                                            type="text" 
                                            value={patient.ward}
                                            onChange={(e) => handleUpdateEntry(patient.id, 'ward', e.target.value)}
                                            className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm"
                                            placeholder="Ward"
                                        />
                                    </td>
                                    <td className="p-4">
                                        <textarea 
                                            value={patient.diagnosis}
                                            onChange={(e) => handleUpdateEntry(patient.id, 'diagnosis', e.target.value)}
                                            className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm resize-none"
                                            rows={2}
                                            placeholder="Diagnosis"
                                        />
                                    </td>
                                    <td className="p-4">
                                        <textarea 
                                            value={patient.procedure}
                                            onChange={(e) => handleUpdateEntry(patient.id, 'procedure', e.target.value)}
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
                                            onChange={val => handleUpdateEntry(patient.id, 'cArm', val)}
                                            triggerClassName="w-full text-sm font-medium text-slate-700 flex items-center gap-1 cursor-pointer p-0"
                                        />
                                    </td>
                                    <td className="p-4">
                                        <textarea 
                                            value={patient.implants}
                                            onChange={(e) => handleUpdateEntry(patient.id, 'implants', e.target.value)}
                                            className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm resize-none text-slate-500"
                                            rows={2}
                                            placeholder="Implants..."
                                        />
                                    </td>
                                    <td className="p-4 text-right">
                                        <button 
                                            onClick={() => handleRemove(patient.id)}
                                            className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </SortableRow>
                            ))
                        )}
                    </tbody>
                </SortableContext>
              ))}
            </table>
          </div>
        </div>
        
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
                        onClick={() => handleImportPatient(patient)}
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
