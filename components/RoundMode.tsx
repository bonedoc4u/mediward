import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useApp, useConfig } from '../contexts/AppContext';
import { Patient, PatientStatus, ToDoItem, ManagementPlan, PacFlowData, PacStatus } from '../types';
import { getStatusColor } from '../utils/calculations';
import { generateId } from '../utils/sanitize';
import { getSmartAlerts } from '../utils/smartAlerts';
import { hapticTap } from '../utils/capacitorInit';
import {
  ChevronLeft, ChevronRight, X, CheckSquare, Square,
  AlertTriangle, Calendar, ClipboardCheck, Save, Plus, Scissors, Leaf, HeartPulse
} from 'lucide-react';
import PacFlowChart from './PacFlowChart';

const RoundMode: React.FC = () => {
  const { patients, updatePatient, saveRound, navigateTo, sessionExpired, logout } = useApp();
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
  const [newTodoText, setNewTodoText] = useState('');
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());

  const touchStartX  = useRef(0);
  const swipeBlocked = useRef(false);   // true when touch started inside a no-swipe zone
  const navCooldownRef = useRef(false);
  const todoInputRef = useRef<HTMLInputElement>(null);

  // Reactive today — updates at midnight so cross-midnight sessions get the correct date
  const [today, setToday] = useState(() => new Date().toISOString().split('T')[0]);
  useEffect(() => {
    const tick = () => {
      const next = new Date().toISOString().split('T')[0];
      setToday(prev => prev !== next ? next : prev);
    };
    const id = setInterval(tick, 60_000); // check every minute
    return () => clearInterval(id);
  }, []);

  // On mount: clean up draft keys older than 2 days to avoid localStorage bloat
  useEffect(() => {
    try {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const cutoff = twoDaysAgo.toISOString().split('T')[0];
      Object.keys(localStorage)
        .filter(k => k.startsWith('mediward_round_draft_') && k.slice('mediward_round_draft_'.length) < cutoff)
        .forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
  }, []);

  // Clamp index when patient list changes (e.g. after ward selection or rotation)
  React.useEffect(() => {
    if (activePatients.length > 0 && index >= activePatients.length) {
      setIndex(activePatients.length - 1);
    }
  }, [activePatients.length]);

  // patient must be declared before the useEffect hooks that reference it
  const patient: Patient | undefined = activePatients[index];


  // ─── Navigate between patients ───
  const goTo = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(next, activePatients.length - 1)));
    setNewTodoText('');
  }, [activePatients.length]);

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

  // ─── Desktop keyboard navigation (← → arrow keys) ───
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept while the user is typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  // ─── Swipe support ───
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    // Block swipe navigation if the touch started inside a horizontally scrollable
    // child (PAC flowchart, navigation strip) — prevents gesture competition
    swipeBlocked.current = !!(e.target as HTMLElement).closest('[data-no-swipe]');
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (swipeBlocked.current) return;
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

  // ─── Save round (persists todos; diagnosis used as the round note) ───
  const handleSave = useCallback((andNext = false) => {
    if (!patient) return;
    saveRound(patient.ipNo, {
      date:  today,
      note:  patient.diagnosis,
      todos: patient.todos,
    });
    setSavedSet(prev => new Set(prev).add(patient.ipNo));

    if (andNext && index < activePatients.length - 1) {
      goNext();
    } else if (andNext) {
      navigateTo('dashboard');
    }
  }, [patient, today, index, activePatients.length, saveRound, navigateTo, goNext]);

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

  // ─── Quick-add shortcut (adds a task without typing) ───
  const handleQuickAdd = useCallback((task: string) => {
    if (!patient) return;
    if (patient.todos.some(t => t.task === task)) return; // already exists
    const newTodo: ToDoItem = { id: generateId(), task, isDone: false };
    updatePatient({ ...patient, todos: [...patient.todos, newTodo] });
  }, [patient, updatePatient]);

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
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-4">
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
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-4">
        <ClipboardCheck className="w-16 h-16 opacity-30" />
        <p className="text-lg font-medium">No active patients in this ward</p>
        <button onClick={() => setSelectedWard(null)} className="text-blue-600 hover:underline text-sm">
          ← Change ward
        </button>
      </div>
    );
  }

  if (!patient) return null;

  const alerts      = getSmartAlerts(patient);
  const isSaved     = savedSet.has(patient.ipNo);
  const pendingTodos = patient.todos.filter(t => !t.isDone && t.task?.trim());
  const doneTodos    = patient.todos.filter(t =>  t.isDone && t.task?.trim());
  const isPending    = !patient.dos && patient.patientStatus !== 'Discharged';

  // Context-aware quick-add shortcuts
  const isDiabetic = patient.comorbidities.some(c => /diabet|dm\b|\bdm$/i.test(c));
  const isOpenOrInfected = /open|infect|wound|chronic|purulent|discharge/i.test(
    [patient.diagnosis, patient.procedure ?? ''].join(' ')
  );
  const shortcuts: { label: string; task: string }[] = [
    ...(isDiabetic          ? [{ label: 'FBS/PPBS', task: 'FBS/PPBS' }] : []),
    ...(isOpenOrInfected    ? [{ label: 'C & D',    task: 'C & D'    }] : []),
    ...(isOpenOrInfected    ? [{ label: 'ESR/CRP',  task: 'ESR/CRP'  }] : []),
    { label: '76', task: 'Form 76' },
    { label: '77', task: 'Form 77' },
  ];

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
      className="min-h-[80vh] flex flex-col select-none relative overscroll-y-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ─── Session Expiry Overlay ─── */}
      {sessionExpired && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center">
            <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">Session Expired</h3>
            <p className="text-sm text-slate-600 mb-6 font-medium">
              Your login session has ended. Your draft note is secure on this device, but cannot be synced yet.
              <br /><br />
              Please log in again to continue.
            </p>
            <button
              onClick={() => { logout(); }}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl transition-colors shadow-sm"
            >
              Log In Again
            </button>
          </div>
        </div>
      )}

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

      {/* ─── Patient Navigation Strip ─── */}
      {/* Scrollable chip list — tap any patient to jump directly to them */}
      <div data-no-swipe className="flex gap-2 overflow-x-auto pb-1 mb-3 scroll-smooth snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}>
        {activePatients.map((p, i) => {
          const isActive  = i === index;
          const isSavedP  = savedSet.has(p.ipNo);
          const isIcu     = icuWardNames.has(p.ward ?? '');
          const isConserv = (p.management ?? 'surgical_fixation') === 'conservative';
          return (
            <button
              key={p.ipNo}
              onClick={() => goTo(i)}
              aria-label={`Jump to ${p.name}, Bed ${p.bed}`}
              className={`snap-start shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all min-h-[40px] ${
                isActive
                  ? isIcu
                    ? 'bg-red-800 text-white border-red-900 shadow-sm'
                    : 'bg-slate-800 text-white border-slate-900 shadow-sm'
                  : isSavedP
                  ? 'bg-green-50 text-green-800 border-green-200'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
              }`}
            >
              <span className={`font-black text-sm ${isActive ? 'text-white' : 'text-slate-900'}`}>
                {p.bed}
              </span>
              <span className="max-w-[80px] truncate">{p.name.split(' ')[0]}</span>
              {isSavedP && !isActive && <span className="text-green-500 text-xs">✓</span>}
              {isConserv && (
                <Leaf className={`w-3 h-3 shrink-0 ${isActive ? 'text-green-300' : 'text-emerald-500'}`} />
              )}
            </button>
          );
        })}
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

          {/* Management Plan — resident selects during rounds */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Plan</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => updatePatient({ ...patient, management: 'surgical_fixation' as ManagementPlan })}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  (patient.management ?? 'surgical_fixation') === 'surgical_fixation'
                    ? 'bg-blue-600 text-white border-blue-700'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'
                }`}
              >
                <Scissors className="w-3 h-3" /> Surgical Fixation
              </button>
              <button
                onClick={() => updatePatient({ ...patient, management: 'conservative' as ManagementPlan })}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  patient.management === 'conservative'
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400'
                }`}
              >
                <Leaf className="w-3 h-3" /> Conservative
              </button>
            </div>
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

          {/* PAC Clearance — shown for all pending (pre-op) patients */}
          {isPending && (
            <div data-no-swipe>
              <div className="flex items-center gap-1.5 mb-2">
                <HeartPulse className="w-4 h-4 text-blue-500" />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  PAC Clearance
                </p>
                {isSaved && <span className="text-green-600 text-xs font-semibold">· Saved ✓</span>}
              </div>
              <PacFlowChart
                pacFlow={patient.pacFlow}
                patientIpNo={patient.ipNo}
                onChange={(updated) => {
                  let newPacStatus = patient.pacStatus;
                  if (updated.seenByAnaesthesia) {
                    const allDone = updated.branches.length > 0 && updated.branches.every(b => b.isDone);
                    // Only auto-promote to Fit; leave Review/Unfit if manually set
                    if (allDone) newPacStatus = PacStatus.Fit;
                    else if (newPacStatus === PacStatus.Fit) newPacStatus = PacStatus.Pending;
                  }
                  updatePatient({ ...patient, pacFlow: updated, pacStatus: newPacStatus });
                }}
              />
            </div>
          )}

          {/* Orders / To-Do */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Orders / To-Do ({pendingTodos.length} pending)
            </p>

            {/* Context-aware quick-add shortcuts */}
            {shortcuts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {shortcuts.map(s => {
                  const done = patient.todos.some(t => t.task === s.task);
                  return (
                    <button
                      key={s.label}
                      onClick={() => !done && handleQuickAdd(s.task)}
                      disabled={done}
                      className={`px-2.5 py-1 text-xs rounded-lg border font-semibold transition-colors ${
                        done
                          ? 'bg-green-50 text-green-600 border-green-200 cursor-default'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 active:scale-95'
                      }`}
                    >
                      {done ? '✓' : '+'} {s.label}
                    </button>
                  );
                })}
              </div>
            )}

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

      {/* Counter + safe-area bottom padding for iOS home indicator */}
      <p className="text-center text-xs text-slate-500 mt-3 pb-[env(safe-area-inset-bottom)]">
        {index + 1} of {activePatients.length} patients
        {savedSet.size > 0 && ` · ${savedSet.size} noted`}
      </p>
    </div>
  );
};

export default RoundMode;
