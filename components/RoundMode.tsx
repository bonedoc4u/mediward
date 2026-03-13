import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useApp, useConfig } from '../contexts/AppContext';
import { Patient, PatientStatus, ToDoItem } from '../types';
import { getStatusColor } from '../utils/calculations';
import { generateId } from '../utils/sanitize';
import { getSmartAlerts } from '../utils/smartAlerts';
import { hapticTap } from '../utils/capacitorInit';
import {
  ChevronLeft, ChevronRight, X, CheckSquare, Square,
  AlertTriangle, Calendar, ClipboardCheck, Save, Plus
} from 'lucide-react';

const RoundMode: React.FC = () => {
  const { patients, updatePatient, saveRound, navigateTo } = useApp();
  const { icuWardNames } = useConfig();

  // ─── All active patients (unfiltered) ───
  const allActivePatients = useMemo(
    () => patients.filter(p => p.patientStatus !== PatientStatus.Discharged),
    [patients]
  );

  // ─── Ward counts for picker ───
  const wardCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allActivePatients.forEach(p => {
      const w = p.ward ?? 'Unknown';
      counts.set(w, (counts.get(w) ?? 0) + 1);
    });
    return counts;
  }, [allActivePatients]);

  // ─── Ward selection state — persisted so screen rotation doesn't reset it ───
  const ROUND_WARD_KEY = 'mediward_round_ward';
  const [selectedWard, setSelectedWardRaw] = useState<string | null>(
    () => sessionStorage.getItem(ROUND_WARD_KEY) || null,
  );
  const setSelectedWard = (ward: string | null) => {
    if (ward) sessionStorage.setItem(ROUND_WARD_KEY, ward);
    else sessionStorage.removeItem(ROUND_WARD_KEY);
    setSelectedWardRaw(ward);
  };

  // ─── Patients filtered by selected ward ───
  const activePatients = useMemo(
    () => !selectedWard
      ? []
      : selectedWard === '__all__'
      ? allActivePatients
      : allActivePatients.filter(p => p.ward === selectedWard),
    [allActivePatients, selectedWard]
  );

  const ROUND_IDX_KEY = 'mediward_round_index';
  const [index, setIndexRaw] = useState<number>(() => {
    const saved = sessionStorage.getItem(ROUND_IDX_KEY);
    const n = saved ? parseInt(saved, 10) : 0;
    return isNaN(n) || n < 0 ? 0 : n;
  });
  const setIndex = (n: number) => {
    sessionStorage.setItem(ROUND_IDX_KEY, String(n));
    setIndexRaw(n);
  };
  const [roundNote, setRoundNote] = useState('');
  const [newTodoText, setNewTodoText] = useState('');
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());

  const touchStartX = useRef(0);
  const navCooldownRef = useRef(false);
  const todoInputRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const today = new Date().toISOString().split('T')[0];

  // Clamp index when patient list changes (e.g. after ward selection or rotation)
  React.useEffect(() => {
    if (activePatients.length > 0 && index >= activePatients.length) {
      setIndex(activePatients.length - 1);
    }
  }, [activePatients.length]);

  // patient must be declared before the useEffect hooks that reference it
  const patient: Patient | undefined = activePatients[index];

  // ─── Session-expiry guard: persist unsaved note to localStorage ───
  // If the session expires mid-round, the note survives and is restored on re-login.
  const DRAFT_KEY = `mediward_round_draft_${today}`;
  React.useEffect(() => {
    if (roundNote.trim() && patient) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ ipNo: patient.ipNo, note: roundNote }));
      } catch { /* storage full */ }
    }
  }, [roundNote, patient, DRAFT_KEY]);

  // Restore draft on mount (e.g., after session re-login)
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved && patient) {
        const draft = JSON.parse(saved) as { ipNo: string; note: string };
        if (draft.ipNo === patient.ipNo && draft.note.trim()) {
          setRoundNote(draft.note);
        }
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.ipNo]);

  // Clear draft after successful save
  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } };

  // ─── Navigate between patients ───
  const goTo = useCallback((next: number) => {
    // Auto-save any typed note before switching patients
    if (patient && roundNote.trim()) {
      saveRound(patient.ipNo, { date: today, note: roundNote.trim(), todos: patient.todos });
      setSavedSet(prev => new Set(prev).add(patient.ipNo));
    }
    setIndex(Math.max(0, Math.min(next, activePatients.length - 1)));
    setRoundNote('');
    setNewTodoText('');
  }, [activePatients.length, patient, roundNote, today, saveRound]);

  const goNext = () => {
    if (navCooldownRef.current) return;
    navCooldownRef.current = true;
    hapticTap().catch(() => {});
    goTo(index + 1);
    setTimeout(() => { navCooldownRef.current = false; }, 400);
  };
  const goPrev = () => {
    if (navCooldownRef.current) return;
    navCooldownRef.current = true;
    hapticTap().catch(() => {});
    goTo(index - 1);
    setTimeout(() => { navCooldownRef.current = false; }, 400);
  };

  // ─── Swipe support ───
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const startX = touchStartX.current;
    const endX = e.changedTouches[0].clientX;
    const diff = startX - endX;
    // Ignore swipes that start within 30px of the left edge — reserved for
    // iOS Safari's native back gesture (avoids competing with the system).
    if (startX < 30) return;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
  };

  // ─── Bullet-point Enter for note textarea ───
  const handleNoteKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart ?? roundNote.length;
    const end = el.selectionEnd ?? roundNote.length;
    const insert = '\n• ';
    const newNote = roundNote.substring(0, start) + insert + roundNote.substring(end);
    setRoundNote(newNote);
    requestAnimationFrame(() => {
      if (noteRef.current) {
        noteRef.current.selectionStart = noteRef.current.selectionEnd = start + insert.length;
      }
    });
  }, [roundNote]);

  // ─── Save round ───
  const handleSave = useCallback((andNext = false) => {
    if (!patient) return;
    const note = roundNote.trim();

    saveRound(patient.ipNo, {
      date:  today,
      note:  note || patient.patientStatus,
      todos: patient.todos,
    });
    setSavedSet(prev => new Set(prev).add(patient.ipNo));
    clearDraft();

    if (andNext && index < activePatients.length - 1) {
      goNext();
    } else if (andNext) {
      navigateTo('dashboard');
    }
  }, [patient, roundNote, today, index, activePatients.length, saveRound, navigateTo, goNext]);

  // ─── Toggle todo ───
  const handleToggleTodo = useCallback((todoId: string) => {
    if (!patient) return;
    const updatedPatient: Patient = {
      ...patient,
      todos: patient.todos.map(t => t.id === todoId ? { ...t, isDone: !t.isDone } : t),
    };
    updatePatient(updatedPatient);
  }, [patient, updatePatient]);

  // ─── Add new todo ───
  const handleAddTodo = useCallback(() => {
    if (!patient || !newTodoText.trim()) return;
    const newTodo: ToDoItem = { id: generateId(), task: newTodoText.trim(), isDone: false };
    const updatedPatient: Patient = { ...patient, todos: [...patient.todos, newTodo] };
    updatePatient(updatedPatient);
    setNewTodoText('');
    requestAnimationFrame(() => todoInputRef.current?.focus());
  }, [patient, newTodoText, updatePatient]);

  // ─── Ward selection screen ───
  if (!selectedWard) {
    return (
      <div className="min-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Start Ward Rounds</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
              {' · '}Select a ward to begin
            </p>
          </div>
          <button
            onClick={() => navigateTo('dashboard')}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {allActivePatients.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
            <ClipboardCheck className="w-16 h-16 opacity-30" />
            <p className="text-lg font-medium">No active patients to round on</p>
            <button onClick={() => navigateTo('dashboard')} className="text-blue-600 hover:underline text-sm">
              Back to Dashboard
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[...wardCounts.entries()].map(([ward, count]) => (
              <button
                key={ward}
                onClick={() => setSelectedWard(ward)}
                className={`p-6 rounded-2xl border-2 text-left transition-all hover:shadow-md ${
                  icuWardNames.has(ward)
                    ? 'border-red-200 bg-red-50 hover:border-red-400'
                    : 'border-slate-200 bg-white hover:border-blue-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-lg font-bold ${icuWardNames.has(ward) ? 'text-red-800' : 'text-slate-900'}`}>
                    {ward}
                  </span>
                  <span className={`text-3xl font-black ${icuWardNames.has(ward) ? 'text-red-300' : 'text-blue-300'}`}>
                    {count}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{count} patient{count !== 1 ? 's' : ''}</p>
                {icuWardNames.has(ward) && (
                  <span className="mt-2 inline-block text-xs font-bold text-red-500 uppercase tracking-widest">ICU</span>
                )}
              </button>
            ))}
            {wardCounts.size > 1 && (
              <button
                onClick={() => setSelectedWard('__all__')}
                className="p-6 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/30 text-left transition-all"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-lg font-bold text-slate-600">All Wards</span>
                  <span className="text-3xl font-black text-slate-300">{allActivePatients.length}</span>
                </div>
                <p className="text-xs text-slate-500">Round on all {allActivePatients.length} patients</p>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (activePatients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-4">
        <ClipboardCheck className="w-16 h-16 opacity-30" />
        <p className="text-lg font-medium">No active patients in this ward</p>
        <button onClick={() => setSelectedWard(null)} className="text-blue-600 hover:underline text-sm">
          ← Change ward
        </button>
      </div>
    );
  }

  if (!patient) return null;

  const alerts = getSmartAlerts(patient);
  const isSaved = savedSet.has(patient.ipNo);
  const pendingTodos = patient.todos.filter(t => !t.isDone);
  const doneTodos    = patient.todos.filter(t => t.isDone);

  // Next patient preview
  const nextPatient = activePatients[index + 1];

  // Latest lab value per type (most recent date wins, max 6 shown)
  const latestLabs = (() => {
    if (!patient.labResults?.length) return [];
    const byType = new Map<string, { type: string; value: number; date: string }>();
    [...patient.labResults]
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
      .forEach(r => byType.set(r.type, { type: r.type, value: r.value, date: r.date }));
    return [...byType.values()].slice(0, 6);
  })();

  return (
    <div
      className="min-h-[80vh] flex flex-col select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Ward Rounds</h2>
          <p className="text-xs text-slate-500">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
            {' · '}
            <button
              onClick={() => { setSelectedWard(null); setIndex(0); setSavedSet(new Set()); }}
              className="text-blue-600 hover:underline"
            >
              {selectedWard === '__all__' ? 'All Wards' : selectedWard}
            </button>
            {' · '}Swipe or use arrows
          </p>
        </div>
        <button
          onClick={() => navigateTo('dashboard')}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ─── Progress ─── */}
      {/* py-3 gives 44px+ touch target height without affecting the visual bar */}
      <div className="flex gap-1 mb-3 py-3 -my-3">
        {activePatients.map((p, i) => (
          <button
            key={p.ipNo}
            onClick={() => goTo(i)}
            className={`h-1.5 flex-1 rounded-full transition-all ${
              i === index
                ? 'bg-blue-600'
                : savedSet.has(p.ipNo)
                ? 'bg-green-400'
                : 'bg-slate-200'
            }`}
          />
        ))}
      </div>

      {/* ─── Main Card ─── */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Patient Header */}
        <div className={`p-4 sm:p-5 ${icuWardNames.has(patient.ward ?? '') ? 'bg-red-900' : 'bg-slate-900'} text-white`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-xl flex items-center justify-center font-black text-lg sm:text-2xl border-2 border-white/20 ${icuWardNames.has(patient.ward ?? '') ? 'bg-red-700' : 'bg-white/10'}`}>
                {patient.bed}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg sm:text-xl font-bold truncate">{patient.name}</h3>
                <p className="text-slate-400 text-xs sm:text-sm truncate">{patient.age}y / {patient.gender} · {patient.ward} · IP: {patient.ipNo}</p>
              </div>
            </div>
            {patient.pod !== undefined && (
              <div className="bg-green-500/20 border border-green-400/30 rounded-xl px-3 py-1.5 text-center shrink-0">
                <span className="block text-[9px] uppercase font-bold text-green-300 tracking-wider">POD</span>
                <span className="block text-2xl sm:text-3xl font-black text-green-200 leading-none">{patient.pod}</span>
              </div>
            )}
          </div>
          <div className="mt-2 pt-2 border-t border-white/10">
            <p className="text-sm font-medium text-white line-clamp-2">{patient.diagnosis}</p>
            {patient.procedure && <p className="text-xs text-slate-400 mt-0.5 truncate">{patient.procedure}</p>}
          </div>
        </div>

        {/* Smart Alerts */}
        {alerts.length > 0 && (
          <div className="px-5 py-3 space-y-1.5 border-b border-slate-100">
            {alerts.map((a, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg ${
                a.type === 'critical' ? 'bg-red-50 text-red-700' :
                a.type === 'warning'  ? 'bg-amber-50 text-amber-700' :
                                        'bg-blue-50 text-blue-700'
              }`}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {a.message}
              </div>
            ))}
          </div>
        )}

        <div className="p-5 space-y-5">
          {/* Status badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(patient.pacStatus)}`}>
              {patient.pacStatus}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(patient.patientStatus)}`}>
              {patient.patientStatus}
            </span>
            {patient.pod !== undefined && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">
                POD {patient.pod}
              </span>
            )}
            {patient.dos && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                <Calendar className="w-3 h-3" /> DOS: {patient.dos}
              </span>
            )}
          </div>

          {/* Comorbidities */}
          {(patient.comorbidities?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1">
              {patient.comorbidities.map(c => (
                <span key={c} className="px-2 py-0.5 text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-100 rounded-full">
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* Latest investigations */}
          {latestLabs.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Latest Investigations</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {latestLabs.map(lab => (
                  <div key={lab.type} className="bg-slate-50 rounded-lg px-2 py-1.5 border border-slate-100 min-w-0">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wide truncate">{lab.type}</p>
                    <p className="text-sm font-bold text-slate-800">{lab.value}</p>
                    <p className="text-[9px] text-slate-400">{lab.date}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daily Status Notes */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <ClipboardCheck className="w-4 h-4" /> Daily Status Notes
              {isSaved && <span className="text-green-600 font-semibold normal-case">· Saved ✓</span>}
            </label>
            <textarea
              ref={noteRef}
              className="w-full p-3 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-yellow-50/40 resize-none"
              rows={3}
              placeholder="• Progress note…"
              value={roundNote}
              onChange={e => setRoundNote(e.target.value)}
              onKeyDown={handleNoteKeyDown}
            />
          </div>

          {/* Orders / To-Do */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Orders / To-Do ({pendingTodos.length} pending)
            </p>
            <div className="space-y-1.5 mb-2">
              {pendingTodos.map(todo => (
                <button
                  key={todo.id}
                  onClick={() => handleToggleTodo(todo.id)}
                  className="w-full flex items-center gap-2.5 text-sm text-left p-2.5 rounded-lg hover:bg-slate-50 transition-colors text-slate-700 border border-slate-200"
                >
                  <Square className="w-4 h-4 text-slate-400 shrink-0" />
                  {todo.task}
                </button>
              ))}
              {doneTodos.map(todo => (
                <button
                  key={todo.id}
                  onClick={() => handleToggleTodo(todo.id)}
                  className="w-full flex items-center gap-2.5 text-sm text-left p-2.5 rounded-lg hover:bg-slate-50 transition-colors text-slate-400 line-through border border-slate-100"
                >
                  <CheckSquare className="w-4 h-4 text-green-500 shrink-0" />
                  {todo.task}
                </button>
              ))}
            </div>
            {/* Add new todo — Enter submits and refocuses for next item */}
            <div className="flex gap-2">
              <input
                ref={todoInputRef}
                type="text"
                placeholder="New order / task…"
                className="flex-1 text-sm p-2.5 min-h-[44px] border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                value={newTodoText}
                onChange={e => setNewTodoText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTodo(); } }}
              />
              <button
                onClick={handleAddTodo}
                disabled={!newTodoText.trim()}
                className="w-11 h-11 flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white rounded-lg transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Next patient preview ─── */}
      {nextPatient && (
        <div className="mt-3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 shrink-0">Next</span>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-base shrink-0 border ${icuWardNames.has(nextPatient.ward ?? '') ? 'bg-red-100 border-red-200 text-red-800' : 'bg-slate-200 border-slate-300 text-slate-700'}`}>
            {nextPatient.bed}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-700 truncate">{nextPatient.name}</p>
            <p className="text-[10px] text-slate-400 truncate">{nextPatient.diagnosis}</p>
          </div>
          {nextPatient.pod !== undefined && (
            <span className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full shrink-0">
              POD {nextPatient.pod}
            </span>
          )}
          {(nextPatient.comorbidities?.length ?? 0) > 0 && (
            <span className="text-[9px] text-purple-600 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded-full shrink-0 hidden sm:block truncate max-w-[80px]">
              {nextPatient.comorbidities[0]}{(nextPatient.comorbidities?.length ?? 0) > 1 ? ` +${nextPatient.comorbidities.length - 1}` : ''}
            </span>
          )}
        </div>
      )}

      {/* ─── Navigation & Actions ─── */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={goPrev}
          disabled={index === 0}
          className="w-11 h-11 flex items-center justify-center shrink-0 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 flex gap-2">
          <button
            onClick={() => handleSave(false)}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors text-sm"
          >
            <Save className="w-4 h-4 shrink-0" /> Save
          </button>
          <button
            onClick={() => handleSave(true)}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors text-xs sm:text-sm shadow-sm"
          >
            {index < activePatients.length - 1 ? (
              <><Save className="w-3.5 h-3.5 shrink-0" /> Save & Next</>
            ) : (
              <>Done <X className="w-3.5 h-3.5 shrink-0" /></>
            )}
          </button>
        </div>

        <button
          onClick={goNext}
          disabled={index === activePatients.length - 1}
          className="w-11 h-11 flex items-center justify-center shrink-0 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Counter */}
      <p className="text-center text-xs text-slate-400 mt-3">
        {index + 1} of {activePatients.length} patients
        {savedSet.size > 0 && ` · ${savedSet.size} noted`}
      </p>
    </div>
  );
};

export default RoundMode;
