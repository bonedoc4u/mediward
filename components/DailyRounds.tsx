import React, { useState, useMemo, useCallback, memo } from 'react';
import { Patient, ToDoItem, PatientStatus, DailyRound, PacStatus } from '../types';
import { useConfig } from '../contexts/AppContext';
import { getStatusColor, sortByBed, groupByWard } from '../utils/calculations';

/** Show only the bed suffix, e.g. "24-01" → "01", "1A" → "1A" */
const shortBed = (bed: string) => bed.includes('-') ? bed.split('-').pop()! : bed;
import { generateId } from '../utils/sanitize';
import { CheckSquare, Plus, Trash2, Calendar, Share2, FileDown, ChevronLeft, ChevronRight, Lock, Layout, HeartPulse } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { localYmd, todayYmd } from '../utils/dates';
import { carryOverLabel } from '../utils/todoCarryOver';

interface Props {
  patients: Patient[];
  onUpdatePatient: (patient: Patient) => void;
  onSaveRound?: (patientIpNo: string, round: DailyRound) => void;
}

// ─── Patient overview card ────────────────────────────────────────────────────
const PatientRoundCard = memo(({
  patient, isToday, selectedDate, todoInput,
  onTodoInputChange, onToggleTodo, onDeleteTodo, onAddTodo, onGeneratePdf,
}: {
  patient: Patient;
  isToday: boolean;
  selectedDate: string;
  todoInput: string;
  onTodoInputChange: (v: string) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onAddTodo: () => void;
  onGeneratePdf: () => void;
}) => {
  const historicalTodos = !isToday
    ? (patient.dailyRounds?.find(r => r.date === selectedDate)?.todos ?? [])
    : null;
  const displayTodos = historicalTodos ?? patient.todos.filter(t => t.task?.trim());

  // Pre-op patient: no surgery date yet, not discharged
  const isPreOp = !patient.dos && patient.patientStatus !== PatientStatus.Discharged;
  // PAC still needs work (only relevant for pre-op patients)
  const isPacPending = isPreOp && patient.pacStatus === PacStatus.Pending;
  // PAC has been cleared but surgery not done yet
  const isPacCleared = isPreOp && patient.pacStatus !== PacStatus.Pending;

  return (
    <div className="bg-surface-card rounded-lg shadow-sm border border-line overflow-hidden">
      {/* Header */}
      <div className="bg-surface-sunken px-4 py-3 border-b border-line flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Bed square — show only the short bed suffix so it fits in the 40px box.
              bg-accent (not bg-ink) deliberately: --color-ink flips to a near-white
              value in dark mode, which would make this badge's white text illegible. */}
          <div className="bg-accent text-white w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0">
            {shortBed(patient.bed)}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-ink leading-tight">{patient.name}</h3>
            <p className="text-xs text-ink-muted">{patient.age}y / {patient.gender} · IP: {patient.ipNo}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {patient.pod !== undefined && (
            // Blue here is decorative/informational (a POD day-count), not a lab value —
            // this file has no abnormal-low clinical reading, so it maps to accent rather
            // than vital-low, keeping vital-low reserved for genuine clinical meaning.
            <div className="flex items-center gap-1.5 bg-accent-soft px-3 py-1 rounded-lg border border-accent">
              <Calendar className="w-4 h-4 text-accent-fg" />
              <span className="text-xs font-black text-accent-fg">POD {patient.pod}</span>
            </div>
          )}
          {/* PAC badge: only show for pre-op patients — post-op (dos set) means surgery is done */}
          {!patient.dos && (
            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(patient.pacStatus)}`}>
              {patient.pacStatus}
            </span>
          )}
          <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
            (patient.management ?? 'surgical_fixation') === 'conservative'
              // emerald is the same green-family meaning as the mapping table's "green"
              // row (Tailwind alias) — normal/preferred-approach signal
              ? 'bg-vital-normal-surface text-vital-normal-fg border-vital-normal-border'
              // blue here is a categorical "other option" tag, not an abnormal-low lab
              // value, so it maps to accent per the mapping table's blue escape hatch
              : 'bg-accent-soft text-accent-fg border-accent'
          }`}>
            {(patient.management ?? 'surgical_fixation') === 'conservative' ? 'Conservative' : 'Surgical Fixation'}
          </span>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Clinical summary */}
        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-bold text-ink-muted uppercase tracking-wider mb-0.5">Diagnosis</p>
            <p className="font-medium text-ink text-sm">{patient.diagnosis}</p>
            {patient.procedure && (
              <p className="text-xs text-ink-muted mt-0.5">Procedure: {patient.procedure}</p>
            )}
          </div>

          {(patient.comorbidities?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-bold text-ink-muted uppercase tracking-wider mb-1">Comorbidities</p>
              <div className="flex flex-wrap gap-1">
                {patient.comorbidities.map(c => (
                  // Purple carries no clinical meaning here (comorbidities aren't a severity
                  // scale) — a pre-restyle stray color; mapped to the same neutral tone
                  // ComorbiditiesSection.tsx's own comorbidity chip already uses.
                  <span key={c} className="px-2 py-0.5 bg-surface-sunken text-ink border border-line rounded-full text-[11px] font-medium">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* PAC status hint — only for pre-op patients */}
          {isPacPending && (
            <div className="flex items-center gap-1.5 text-xs text-vital-warning-fg bg-vital-warning-surface border border-vital-warning-border rounded-lg px-2.5 py-1.5">
              <HeartPulse className="w-3.5 h-3.5 shrink-0" />
              PAC pending — update clearance in Ward Rounds
            </div>
          )}
          {isPacCleared && (
            // emerald → vital-normal (same green-family alias as the management badge above)
            <div className="flex items-center gap-1.5 text-xs text-vital-normal-fg bg-vital-normal-surface border border-vital-normal-border rounded-lg px-2.5 py-1.5">
              <HeartPulse className="w-3.5 h-3.5 shrink-0" />
              PAC cleared · {patient.pacStatus}
            </div>
          )}
        </div>

        {/* Right: To-Do list */}
        <div className="bg-surface-sunken rounded-lg p-3 border border-line flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
              <CheckSquare className="w-3.5 h-3.5" /> Orders / To-Do
              {displayTodos.filter(t => !t.isDone).length > 0 && (
                // Judgment call: an open-orders *count* isn't itself a critical/destructive
                // value (that would over-alarm on routine pending work) — it reads closer
                // to "not yet actioned", so it maps to vital-warning, not vital-critical.
                <span className="ml-1 bg-vital-warning-surface text-vital-warning-fg text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {displayTodos.filter(t => !t.isDone).length}
                </span>
              )}
            </h4>
            <button
              onClick={onGeneratePdf}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-accent-fg bg-accent-soft hover:bg-accent-soft rounded border border-accent transition-colors"
            >
              <Share2 className="w-3 h-3" /> Share
            </button>
          </div>

          <div className="space-y-1.5 mb-2 flex-1">
            {displayTodos.map(todo => (
              <div key={todo.id} className={`group flex items-center justify-between bg-surface-card p-2 rounded border transition-colors ${
                isToday ? 'border-line hover:border-accent' : 'border-line'
              }`}>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={todo.isDone}
                    onChange={() => isToday && onToggleTodo(todo.id)}
                    disabled={!isToday}
                    className="w-3.5 h-3.5 text-accent rounded cursor-pointer disabled:opacity-50"
                  />
                  <span className={`text-sm ${todo.isDone ? 'text-ink-muted line-through' : 'text-ink'}`}>
                    {todo.task}
                  </span>
                  {carryOverLabel(todo, selectedDate) && (
                    // Brief-mandated: genuine clinical-workflow warning signal (a stale,
                    // not-yet-actioned order) → full vital-warning triplet. Border added
                    // even though the original chip had none, per the brief's explicit
                    // "full triplet, not a decorative neutral" instruction.
                    <span className="text-[10px] text-vital-warning-fg bg-vital-warning-surface border border-vital-warning-border px-1 py-0.5 rounded font-medium shrink-0">
                      {carryOverLabel(todo, selectedDate)}
                    </span>
                  )}
                </div>
                {isToday && (
                  <button
                    onClick={() => onDeleteTodo(todo.id)}
                    className="text-ink-muted hover:text-vital-critical opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {displayTodos.length === 0 && (
              <p className="text-xs text-ink-muted italic text-center py-3">No tasks</p>
            )}
          </div>

          {isToday && (
            <div className="flex gap-2 mt-auto">
              <input
                type="text"
                placeholder="Add task…"
                className="flex-1 text-xs p-2 border border-line rounded focus:ring-1 focus:ring-accent outline-none bg-surface-card"
                value={todoInput}
                onChange={e => onTodoInputChange(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onAddTodo()}
              />
              {/* bg-accent (not bg-ink) — matches the add-item button idiom already
                  established in ComorbiditiesSection.tsx, and sidesteps the same
                  dark-mode contrast risk noted on the bed badge above. */}
              <button onClick={onAddTodo} className="bg-accent text-white p-2 rounded hover:bg-accent-pressed">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

PatientRoundCard.displayName = 'PatientRoundCard';

// ─── Main component ───────────────────────────────────────────────────────────
const DailyRounds: React.FC<Props> = ({ patients, onUpdatePatient, onSaveRound }) => {
  const { wards: configWards, icuWardNames } = useConfig();
  const activeConfigWards = useMemo(
    () => configWards.filter(w => w.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [configWards],
  );

  const todayStr = todayYmd();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [todoInputs, setTodoInputs]     = useState<Record<string, string>>({});

  const isToday = selectedDate === todayStr;

  const activePatients = useMemo(
    () => patients.filter(p => p.patientStatus !== PatientStatus.Discharged).sort(sortByBed),
    [patients],
  );
  const patientsByWard  = useMemo(() => groupByWard(activePatients), [activePatients]);
  const wardsToDisplay  = useMemo(() => {
    return Object.keys(patientsByWard).sort((a, b) => {
      const oa = activeConfigWards.findIndex(w => w.name === a);
      const ob = activeConfigWards.findIndex(w => w.name === b);
      return (oa === -1 ? 999 : oa) - (ob === -1 ? 999 : ob);
    });
  }, [patientsByWard, activeConfigWards]);

  const flatPatients = useMemo(() => {
    const flat: Patient[] = [];
    wardsToDisplay.forEach(w => flat.push(...(patientsByWard[w] ?? [])));
    return flat;
  }, [wardsToDisplay, patientsByWard]);

  const persistTodos = useCallback((updated: Patient) => {
    if (isToday) {
      const entry: DailyRound = { date: todayStr, note: updated.diagnosis, todos: updated.todos };
      const history = [...(updated.dailyRounds ?? [])];
      const idx = history.findIndex(h => h.date === todayStr);
      if (idx >= 0) history[idx] = entry; else history.push(entry);
      updated = { ...updated, dailyRounds: history };
      onSaveRound?.(updated.ipNo, entry);
    }
    onUpdatePatient(updated);
  }, [isToday, todayStr, onUpdatePatient, onSaveRound]);

  // ─── PDF — single patient ───
  const generatePdf = useCallback((patient: Patient) => {
    const displayTodos = isToday
      ? patient.todos.filter(t => t.task?.trim())
      : (patient.dailyRounds?.find(r => r.date === selectedDate)?.todos ?? []);

    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(`Orders / To-Do  (${selectedDate})`, pw / 2, 14, { align: 'center' });
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Bed ${patient.bed} — ${patient.name}  |  ${patient.age}y / ${patient.gender}  |  IP: ${patient.ipNo}`, 14, 26);
    doc.text(`Dx: ${patient.diagnosis}${patient.procedure ? `  |  ${patient.procedure}` : ''}`, 14, 33);
    if (patient.pod !== undefined) doc.text(`POD: ${patient.pod}`, 14, 40);
    let y = patient.pod !== undefined ? 50 : 43;
    doc.setFont('helvetica', 'bold'); doc.text('Orders / To-Do:', 14, y); y += 7;
    doc.setFont('helvetica', 'normal');
    if (displayTodos.length === 0) {
      doc.setTextColor(150, 150, 150); doc.text('No tasks recorded', 18, y);
    } else {
      displayTodos.forEach(t => {
        doc.setTextColor(t.isDone ? 120 : 30, t.isDone ? 130 : 30, t.isDone ? 120 : 30);
        doc.text(`${t.isDone ? '[x]' : '[ ]'}  ${t.task}`, 18, y); y += 6;
      });
    }
    doc.save(`ToDo_Bed${patient.bed}_${selectedDate}.pdf`);
  }, [isToday, selectedDate]);

  // ─── PDF — all patients ───
  const generateFullReport = useCallback(() => {
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const m = 14;

    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pw, 36, 'F');
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('Daily Rounds Overview', pw / 2, 13, { align: 'center' });
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${selectedDate}  |  ${flatPatients.length} patients`, pw / 2, 22, { align: 'center' });
    doc.setFontSize(8); doc.setTextColor(180, 200, 220);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pw / 2, 30, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    let y = 46;

    wardsToDisplay.forEach(ward => {
      const wps = patientsByWard[ward] ?? [];
      if (!wps.length) return;
      if (y > ph - 40) { doc.addPage(); y = 20; }
      doc.setFillColor(226, 232, 240);
      doc.rect(m, y - 5, pw - m * 2, 9, 'F');
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
      doc.text(`${ward.toUpperCase()}  (${wps.length} patient${wps.length !== 1 ? 's' : ''})`, m + 3, y + 1);
      doc.setTextColor(0, 0, 0); y += 12;

      wps.forEach((patient, idx) => {
        const displayTodos = isToday
          ? patient.todos.filter(t => t.task?.trim())
          : (patient.dailyRounds?.find(r => r.date === selectedDate)?.todos ?? []);

        const est = 16 + (displayTodos.length || 1) * 5.5;
        if (y + est > ph - 15) { doc.addPage(); y = 20; }
        if (idx % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(m, y - 4, pw - m * 2, est, 'F');
        }

        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
        doc.text(`Bed ${patient.bed}  —  ${patient.name}`, m + 2, y);
        y += 5.5;

        doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
        doc.text(`${patient.age}y / ${patient.gender}  |  IP: ${patient.ipNo}`, m + 2, y); y += 4.5;

        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(30, 30, 30);
        doc.text('Orders / To-Do:', m + 2, y); y += 4.5;
        doc.setFont('helvetica', 'normal');
        if (!displayTodos.length) {
          doc.setFontSize(8); doc.setTextColor(150, 150, 150);
          doc.text('No tasks', m + 6, y); doc.setTextColor(30, 30, 30); y += 4.5;
        } else {
          displayTodos.forEach(t => {
            doc.setFontSize(8.5);
            doc.setTextColor(t.isDone ? 120 : 30, t.isDone ? 130 : 30, t.isDone ? 120 : 30);
            const tl = doc.splitTextToSize(`${t.isDone ? '[x]' : '[ ]'}  ${t.task}`, pw - m * 2 - 12);
            doc.text(tl, m + 6, y); y += tl.length * 4.5;
          });
          doc.setTextColor(30, 30, 30);
        }

        doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3);
        doc.line(m, y + 1, pw - m, y + 1); y += 7;
      });
      y += 4;
    });

    if (!flatPatients.length) {
      doc.setFontSize(12); doc.setTextColor(150, 150, 150);
      doc.text('No active patients.', pw / 2, 80, { align: 'center' });
    }
    doc.save(`DailyRounds_${selectedDate}.pdf`);
  }, [isToday, selectedDate, flatPatients, wardsToDisplay, patientsByWard]);

  return (
    <div className="space-y-4">
      {/* Date Nav + Export */}
      <div className="bg-surface-card rounded-lg shadow-sm border border-line p-4 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button onClick={() => {
            const d = new Date(selectedDate); d.setDate(d.getDate() - 1);
            setSelectedDate(localYmd(d));
          }} className="p-2 hover:bg-accent-soft rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <input
            type="date"
            value={selectedDate}
            max={todayStr}
            onChange={e => { if (e.target.value <= todayStr) setSelectedDate(e.target.value); }}
            className="bg-surface-sunken border border-line text-sm rounded-lg px-3 py-2 font-bold focus:ring-2 focus:ring-accent outline-none"
          />
          <button onClick={() => {
            if (isToday) return;
            const d = new Date(selectedDate); d.setDate(d.getDate() + 1);
            setSelectedDate(localYmd(d));
          }} disabled={isToday} className="p-2 hover:bg-accent-soft rounded-lg transition-colors disabled:opacity-30">
            <ChevronRight className="w-5 h-5" />
          </button>
          {isToday
            ? <span className="text-xs font-bold text-accent-fg bg-accent-soft px-2 py-1 rounded">TODAY</span>
            : <span title="Read-only for past dates"><Lock className="w-4 h-4 text-ink-faint" /></span>}
        </div>

        <button
          onClick={generateFullReport}
          disabled={flatPatients.length === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-accent hover:bg-accent-pressed disabled:opacity-40 rounded-lg transition-colors shadow-sm"
        >
          <FileDown className="w-4 h-4" /> Export All PDF
        </button>
      </div>

      {/* Ward sections */}
      {wardsToDisplay.map(ward => (
        <div key={ward} className="space-y-3">
          <div className={`px-4 py-2 rounded-lg flex items-center gap-2 border ${
            // Judgment call: this is a ward *category* label, not a live critical value.
            // WardDashboard.tsx's own ICU ward-header pill already established
            // bg-accent-soft/text-ink (not vital-critical red) for this exact same
            // "ICU section header" concept, deliberately keeping red reserved for real
            // critical values rather than a structural grouping label — matched here for
            // consistency rather than the mapping table's default red→critical reading.
            icuWardNames.has(ward)
              ? 'bg-accent-soft text-ink border-line'
              : 'bg-surface-sunken text-ink border-line'
          }`}>
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
              todoInput={todoInputs[patient.ipNo] ?? ''}
              onTodoInputChange={v => setTodoInputs(p => ({ ...p, [patient.ipNo]: v }))}
              onToggleTodo={id => persistTodos({
                ...patient,
                todos: patient.todos.map(t => t.id === id ? { ...t, isDone: !t.isDone } : t),
              })}
              onDeleteTodo={id => persistTodos({
                ...patient,
                todos: patient.todos.filter(t => t.id !== id),
              })}
              onAddTodo={() => {
                const text = todoInputs[patient.ipNo];
                if (!text?.trim()) return;
                const newTodo: ToDoItem = { id: generateId(), task: text.trim(), isDone: false, addedDate: todayYmd() };
                persistTodos({ ...patient, todos: [...patient.todos, newTodo] });
                setTodoInputs(p => ({ ...p, [patient.ipNo]: '' }));
              }}
              onGeneratePdf={() => generatePdf(patient)}
            />
          ))}
        </div>
      ))}

      {flatPatients.length === 0 && (
        <div className="p-12 text-center text-ink-muted">No active patients.</div>
      )}
    </div>
  );
};

export default DailyRounds;
