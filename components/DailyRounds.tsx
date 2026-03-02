import React, { useState, useRef, useMemo, useCallback, memo } from 'react';
import { Patient, ToDoItem, PatientStatus, DailyRound } from '../types';
import { useConfig } from '../contexts/AppContext';
import { getStatusColor, sortByBed, groupByWard } from '../utils/calculations';
import { generateId } from '../utils/sanitize';
import { CheckSquare, Plus, Trash2, Calendar, ClipboardCheck, Share2, FileDown, Activity, ChevronLeft, ChevronRight, Lock, Layout } from 'lucide-react';
import { jsPDF } from "jspdf";

interface Props {
  patients: Patient[];
  onUpdatePatient: (patient: Patient) => void;
}

// ─── Mobile Patient Card (extracted for performance) ───
const PatientRoundCard = memo(({ patient, isToday, selectedDate, todoInput, onTodoInputChange, onStatusChange, onToggleTodo, onDeleteTodo, onAddTodo, onGeneratePdf }: {
  patient: Patient;
  isToday: boolean;
  selectedDate: string;
  todoInput: string;
  onTodoInputChange: (value: string) => void;
  onStatusChange: (status: string) => void;
  onToggleTodo: (todoId: string) => void;
  onDeleteTodo: (todoId: string) => void;
  onAddTodo: () => void;
  onGeneratePdf: () => void;
}) => {
  let displayStatus = patient.patientStatus;
  let displayTodos = patient.todos;
  let historicalData = null;

  if (!isToday) {
    historicalData = patient.dailyRounds?.find(r => r.date === selectedDate);
    displayStatus = historicalData?.note || "";
    displayTodos = historicalData?.todos || [];
  }

  const noteRef = useRef<HTMLTextAreaElement>(null);
  const handleNoteKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart ?? displayStatus.length;
    const end = el.selectionEnd ?? displayStatus.length;
    const insert = '\n• ';
    const newValue = displayStatus.substring(0, start) + insert + displayStatus.substring(end);
    onStatusChange(newValue);
    requestAnimationFrame(() => {
      if (noteRef.current) {
        noteRef.current.selectionStart = noteRef.current.selectionEnd = start + insert.length;
      }
    });
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border overflow-hidden ${!isToday && !historicalData ? 'opacity-60 border-slate-100' : 'border-slate-200'}`}>
      <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 text-white w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg">
            {patient.bed}
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-lg leading-tight">{patient.name}</h3>
            <div className="text-xs text-slate-500">
              {patient.age}y / {patient.gender} • IP: {patient.ipNo}
            </div>
          </div>
        </div>
        {patient.pod !== undefined && (
          <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-lg border border-blue-100">
            <Calendar className="w-5 h-5 text-blue-600" />
            <div className="text-center">
              <span className="block text-[10px] uppercase font-bold text-blue-500 tracking-wider">Post-Op Day</span>
              <span className="block text-xl font-black text-blue-700 leading-none">{patient.pod}</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Diagnosis & Status */}
        <div className="space-y-4">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Diagnosis & Procedure</span>
            <p className="font-medium text-slate-800">{patient.diagnosis}</p>
            {patient.procedure && <p className="text-sm text-slate-600 mt-1">Plan/Done: {patient.procedure}</p>}
          </div>
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2 mb-2">
              <ClipboardCheck className="w-4 h-4" />
              {isToday ? "Daily Status Notes" : `Daily Status Notes (${selectedDate})`}
            </span>
            {isToday ? (
              <textarea
                ref={noteRef}
                className="w-full p-3 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-yellow-50/30"
                rows={3}
                placeholder="• Daily progress note…"
                value={displayStatus}
                onChange={(e) => onStatusChange(e.target.value)}
                onKeyDown={handleNoteKeyDown}
              />
            ) : (
              <div className="w-full p-3 text-sm border border-slate-200 rounded-md bg-slate-50 text-slate-700 min-h-[80px]">
                {displayStatus || <span className="text-slate-400 italic">No note recorded for this date.</span>}
              </div>
            )}
          </div>
        </div>

        {/* Right: To Do List */}
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 flex flex-col h-full">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-slate-500" />
              Orders / To Do
            </h4>
            <button
              onClick={onGeneratePdf}
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
          </div>
          <div className="space-y-2 mb-3 flex-1">
            {displayTodos.map(todo => (
              <div key={todo.id} className={`group flex items-center justify-between bg-white p-2 rounded border border-slate-200 ${isToday ? 'hover:border-blue-300' : ''} transition-colors`}>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={todo.isDone}
                    onChange={() => isToday && onToggleTodo(todo.id)}
                    disabled={!isToday}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                  />
                  <span className={`text-sm ${todo.isDone ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                    {todo.task}
                  </span>
                </div>
                {isToday && (
                  <button onClick={() => onDeleteTodo(todo.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            {displayTodos.length === 0 && (
              <p className="text-xs text-slate-400 italic text-center py-2">No tasks recorded</p>
            )}
          </div>
          {isToday && (
            <div className="flex gap-2 mt-auto">
              <input
                type="text"
                placeholder="Add new task..."
                className="flex-1 text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                value={todoInput}
                onChange={(e) => onTodoInputChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onAddTodo()}
              />
              <button onClick={onAddTodo} className="bg-slate-800 text-white p-2 rounded hover:bg-slate-700">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

PatientRoundCard.displayName = 'PatientRoundCard';

// ─── Main Component ───
const DailyRounds: React.FC<Props> = ({ patients, onUpdatePatient }) => {
  const { wards: configWards, icuWardNames } = useConfig();
  const activeConfigWards = useMemo(
    () => configWards.filter(w => w.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [configWards],
  );
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [todoInputs, setTodoInputs] = useState<{ [key: string]: string }>({});
  const [mobileIndex, setMobileIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');

  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === todayStr;

  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    if (isToday) return;
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const activePatients = useMemo(() => {
    return patients
      .filter(p => p.patientStatus !== PatientStatus.Discharged)
      .sort(sortByBed);
  }, [patients]);

  const patientsByWard = useMemo(() => groupByWard(activePatients), [activePatients]);
  const wardsToDisplay = useMemo(() => {
    const keys = Object.keys(patientsByWard);
    return [...keys].sort((a, b) => {
      const oa = activeConfigWards.findIndex(w => w.name === a);
      const ob = activeConfigWards.findIndex(w => w.name === b);
      return (oa === -1 ? 999 : oa) - (ob === -1 ? 999 : ob);
    });
  }, [patientsByWard, activeConfigWards]);

  // Flat list for mobile card navigation
  const flatPatients = useMemo(() => {
    const flat: Patient[] = [];
    wardsToDisplay.forEach(w => flat.push(...(patientsByWard[w] || [])));
    return flat;
  }, [wardsToDisplay, patientsByWard]);

  const updatePatientWithHistory = useCallback((updatedPatient: Patient) => {
    if (isToday) {
      const history = [...(updatedPatient.dailyRounds || [])];
      const existingIndex = history.findIndex(h => h.date === todayStr);
      const entry: DailyRound = {
        date: todayStr,
        note: updatedPatient.patientStatus,
        todos: updatedPatient.todos
      };
      if (existingIndex >= 0) history[existingIndex] = entry;
      else history.push(entry);
      updatedPatient.dailyRounds = history;
    }
    onUpdatePatient(updatedPatient);
  }, [isToday, todayStr, onUpdatePatient]);

  const generatePdf = useCallback((patient: Patient) => {
    let displayStatus = patient.patientStatus;
    let displayTodos = patient.todos;
    if (!isToday) {
      const historicalData = patient.dailyRounds?.find(r => r.date === selectedDate);
      displayStatus = historicalData?.note || "No record for this date.";
      displayTodos = historicalData?.todos || [];
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Clinical Orders / To-Do List (${selectedDate})`, pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, 21, { align: "center" });
    doc.setTextColor(0);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Bed ${patient.bed} — ${patient.name}`, 14, 35);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`${patient.age}y / ${patient.gender} | IP: ${patient.ipNo}`, 14, 42);
    doc.text(`Dx: ${patient.diagnosis}`, 14, 49);
    if (patient.pod !== undefined) doc.text(`POD: ${patient.pod}`, 14, 56);

    let yPos = patient.pod !== undefined ? 66 : 59;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Status Note:", 14, yPos);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    yPos += 7;
    doc.text(displayStatus || '-', 14, yPos);

    yPos += 14;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Orders / Tasks:", 14, yPos);
    yPos += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    displayTodos.forEach(t => {
      doc.text(`${t.isDone ? '[x]' : '[ ]'} ${t.task}`, 18, yPos);
      yPos += 6;
    });
    if (displayTodos.length === 0) doc.text('No tasks', 18, yPos);

    doc.save(`Rounds_Bed${patient.bed}_${selectedDate}.pdf`);
  }, [isToday, selectedDate]);

  const generateFullReport = useCallback(() => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    // ── Cover Header ──
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(0, 0, pageWidth, 38, 'F');
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("Daily Rounds Report", pageWidth / 2, 14, { align: "center" });
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Date: ${selectedDate}`, pageWidth / 2, 22, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(180, 200, 220);
    doc.text(`Generated: ${new Date().toLocaleString()}  |  Total Patients: ${flatPatients.length}`, pageWidth / 2, 30, { align: "center" });
    doc.setTextColor(0, 0, 0);

    let yPos = 48;

    wardsToDisplay.forEach(ward => {
      const wardPatients = patientsByWard[ward] || [];
      if (wardPatients.length === 0) return;

      // ── Ward header ──
      if (yPos > pageHeight - 40) { doc.addPage(); yPos = 20; }
      doc.setFillColor(226, 232, 240); // slate-200
      doc.rect(margin, yPos - 5, pageWidth - margin * 2, 9, 'F');
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 41, 59);
      doc.text(`${ward.toUpperCase()}  (${wardPatients.length} patient${wardPatients.length !== 1 ? 's' : ''})`, margin + 3, yPos + 1);
      doc.setTextColor(0, 0, 0);
      yPos += 12;

      wardPatients.forEach((patient, idx) => {
        let displayStatus = patient.patientStatus;
        let displayTodos = patient.todos;
        if (!isToday) {
          const historicalData = patient.dailyRounds?.find(r => r.date === selectedDate);
          displayStatus = historicalData?.note || "";
          displayTodos = historicalData?.todos || [];
        }

        // Estimate block height to decide page break
        const statusLines = doc.splitTextToSize(displayStatus || '-', pageWidth - margin * 2 - 22).length;
        const estimatedHeight = 14 + 5 + (statusLines * 5) + 6 + (displayTodos.length || 1) * 5.5 + 8;
        if (yPos + estimatedHeight > pageHeight - 15) { doc.addPage(); yPos = 20; }

        // Alternating row tint
        if (idx % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, yPos - 4, pageWidth - margin * 2, estimatedHeight, 'F');
        }

        // Patient header line
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(`Bed ${patient.bed}  —  ${patient.name}`, margin + 2, yPos);

        // POD badge (right side)
        if (patient.pod !== undefined) {
          doc.setFontSize(9);
          doc.setTextColor(37, 99, 235); // blue-600
          doc.text(`POD ${patient.pod}`, pageWidth - margin - 2, yPos, { align: 'right' });
        }
        yPos += 5.5;

        // Sub-info line
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105); // slate-500
        doc.text(`${patient.age}y / ${patient.gender}  |  IP: ${patient.ipNo}`, margin + 2, yPos);
        yPos += 4.5;

        // Diagnosis
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(30, 30, 30);
        doc.text("Dx:", margin + 2, yPos);
        doc.setFont("helvetica", "normal");
        const dxFull = patient.diagnosis + (patient.procedure ? `  |  ${patient.procedure}` : '');
        const dxLines = doc.splitTextToSize(dxFull, pageWidth - margin * 2 - 14);
        doc.text(dxLines, margin + 10, yPos);
        yPos += dxLines.length * 4.5 + 1;

        // Status Note
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(30, 30, 30);
        doc.text("Status:", margin + 2, yPos);
        doc.setFont("helvetica", "normal");
        const statusWrapped = doc.splitTextToSize(displayStatus || (isToday ? '-' : 'No note for this date.'), pageWidth - margin * 2 - 22);
        if (!displayStatus && !isToday) doc.setTextColor(150, 150, 150);
        doc.text(statusWrapped, margin + 20, yPos);
        doc.setTextColor(30, 30, 30);
        yPos += statusWrapped.length * 4.5 + 2;

        // Orders / To-Do
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.text("Orders / To-Do:", margin + 2, yPos);
        yPos += 4.5;
        doc.setFont("helvetica", "normal");
        if (displayTodos.length === 0) {
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text("No tasks recorded", margin + 6, yPos);
          doc.setTextColor(30, 30, 30);
          yPos += 4.5;
        } else {
          displayTodos.forEach(t => {
            doc.setFontSize(8.5);
            doc.setTextColor(t.isDone ? 120 : 30, t.isDone ? 130 : 30, t.isDone ? 120 : 30);
            const taskLines = doc.splitTextToSize(`${t.isDone ? '[x]' : '[ ]'}  ${t.task}`, pageWidth - margin * 2 - 12);
            doc.text(taskLines, margin + 6, yPos);
            yPos += taskLines.length * 4.5;
          });
          doc.setTextColor(30, 30, 30);
        }

        // Separator
        doc.setDrawColor(203, 213, 225); // slate-300
        doc.setLineWidth(0.3);
        doc.line(margin, yPos + 1, pageWidth - margin, yPos + 1);
        yPos += 7;
      });

      yPos += 4;
    });

    if (flatPatients.length === 0) {
      doc.setFontSize(12);
      doc.setTextColor(150, 150, 150);
      doc.text("No active patients found.", pageWidth / 2, 80, { align: "center" });
    }

    doc.save(`DailyRounds_AllPatients_${selectedDate}.pdf`);
  }, [isToday, selectedDate, flatPatients, wardsToDisplay, patientsByWard]);

  // ─── Mobile Card View ───
  const currentMobilePatient = flatPatients[mobileIndex];

  return (
    <div className="space-y-4">
      {/* Date Nav & View Toggle */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 flex flex-col sm:flex-row justify-between items-center gap-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button onClick={handlePrevDay} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <input
            type="date"
            value={selectedDate}
            max={todayStr}
            onChange={(e) => { if (e.target.value <= todayStr) setSelectedDate(e.target.value); }}
            className="bg-slate-50 border border-slate-300 text-sm rounded-lg px-3 py-2 font-bold focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button onClick={handleNextDay} disabled={isToday} className="p-2 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30">
            <ChevronRight className="w-5 h-5" />
          </button>
          {isToday && <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">TODAY</span>}
          {!isToday && <span title="Read-only for past dates"><Lock className="w-4 h-4 text-slate-400 ml-1" /></span>}
        </div>

        {/* Export All PDF */}
        <button
          onClick={generateFullReport}
          disabled={flatPatients.length === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm"
          title="Export all IP patients' daily status & to-do as PDF"
        >
          <FileDown className="w-4 h-4" />
          Export All PDF
        </button>

        {/* Mobile: Card/List toggle */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            onClick={() => setViewMode('card')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${viewMode === 'card' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            Card View
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            List View
          </button>
        </div>
      </div>

      {/* ─── Mobile Card Navigation (one patient at a time) ─── */}
      {viewMode === 'card' && (
        <div className="md:hidden">
          {/* Patient Stepper */}
          <div className="flex items-center justify-between mb-3 bg-white rounded-lg p-3 border border-slate-200">
            <button
              onClick={() => setMobileIndex(Math.max(0, mobileIndex - 1))}
              disabled={mobileIndex === 0}
              className="p-2 bg-slate-100 rounded-lg disabled:opacity-30 hover:bg-slate-200"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="text-center">
              <select
                value={mobileIndex}
                onChange={(e) => setMobileIndex(parseInt(e.target.value))}
                className="text-sm font-bold text-slate-800 bg-transparent border-none text-center focus:ring-0 cursor-pointer"
              >
                {flatPatients.map((p, i) => (
                  <option key={p.ipNo} value={i}>Bed {p.bed}: {p.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400">{mobileIndex + 1} of {flatPatients.length}</p>
            </div>

            <button
              onClick={() => setMobileIndex(Math.min(flatPatients.length - 1, mobileIndex + 1))}
              disabled={mobileIndex >= flatPatients.length - 1}
              className="p-2 bg-slate-100 rounded-lg disabled:opacity-30 hover:bg-slate-200"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {currentMobilePatient && (
            <PatientRoundCard
              patient={currentMobilePatient}
              isToday={isToday}
              selectedDate={selectedDate}
              todoInput={todoInputs[currentMobilePatient.ipNo] || ''}
              onTodoInputChange={(v) => setTodoInputs(prev => ({ ...prev, [currentMobilePatient.ipNo]: v }))}
              onStatusChange={(s) => updatePatientWithHistory({ ...currentMobilePatient, patientStatus: s })}
              onToggleTodo={(id) => {
                const updated = currentMobilePatient.todos.map(t => t.id === id ? { ...t, isDone: !t.isDone } : t);
                updatePatientWithHistory({ ...currentMobilePatient, todos: updated });
              }}
              onDeleteTodo={(id) => {
                const updated = currentMobilePatient.todos.filter(t => t.id !== id);
                updatePatientWithHistory({ ...currentMobilePatient, todos: updated });
              }}
              onAddTodo={() => {
                const text = todoInputs[currentMobilePatient.ipNo];
                if (!text?.trim()) return;
                const newTodo: ToDoItem = { id: generateId(), task: text.trim(), isDone: false };
                updatePatientWithHistory({ ...currentMobilePatient, todos: [...currentMobilePatient.todos, newTodo] });
                setTodoInputs(prev => ({ ...prev, [currentMobilePatient.ipNo]: '' }));
              }}
              onGeneratePdf={() => generatePdf(currentMobilePatient)}
            />
          )}
        </div>
      )}

      {/* ─── Desktop / Mobile List View ─── */}
      <div className={`${viewMode === 'card' ? 'hidden md:block' : ''}`}>
        {wardsToDisplay.map(ward => (
          <div key={ward} className="space-y-4 mb-8">
            <div className={`px-4 py-2 rounded-lg flex items-center gap-2 border ${icuWardNames.has(ward) ? 'bg-red-50 text-red-800 border-red-100' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
              <Layout className="w-4 h-4" />
              <h3 className="font-bold uppercase tracking-wide text-sm">{ward}</h3>
              <span className="text-xs font-normal opacity-70">({patientsByWard[ward].length})</span>
            </div>

            {patientsByWard[ward].map(patient => (
              <PatientRoundCard
                key={patient.ipNo}
                patient={patient}
                isToday={isToday}
                selectedDate={selectedDate}
                todoInput={todoInputs[patient.ipNo] || ''}
                onTodoInputChange={(v) => setTodoInputs(prev => ({ ...prev, [patient.ipNo]: v }))}
                onStatusChange={(s) => updatePatientWithHistory({ ...patient, patientStatus: s })}
                onToggleTodo={(id) => {
                  const updated = patient.todos.map(t => t.id === id ? { ...t, isDone: !t.isDone } : t);
                  updatePatientWithHistory({ ...patient, todos: updated });
                }}
                onDeleteTodo={(id) => {
                  const updated = patient.todos.filter(t => t.id !== id);
                  updatePatientWithHistory({ ...patient, todos: updated });
                }}
                onAddTodo={() => {
                  const text = todoInputs[patient.ipNo];
                  if (!text?.trim()) return;
                  const newTodo: ToDoItem = { id: generateId(), task: text.trim(), isDone: false };
                  updatePatientWithHistory({ ...patient, todos: [...patient.todos, newTodo] });
                  setTodoInputs(prev => ({ ...prev, [patient.ipNo]: '' }));
                }}
                onGeneratePdf={() => generatePdf(patient)}
              />
            ))}
          </div>
        ))}
      </div>

      {flatPatients.length === 0 && (
        <div className="p-12 flex flex-col items-center justify-center text-slate-400">
          <p>No patients found.</p>
        </div>
      )}
    </div>
  );
};

export default DailyRounds;
