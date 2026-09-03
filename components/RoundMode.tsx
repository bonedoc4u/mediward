import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useApp, useConfig, usePatients } from '../contexts/AppContext';
import { Patient, PatientStatus, ToDoItem, ManagementPlan, PacStatus } from '../types';
import { getStatusColor, sortByBed } from '../utils/calculations';
import { generateId } from '../utils/sanitize';
import { getSmartAlerts } from '../utils/smartAlerts';
import { hapticTap } from '../utils/capacitorInit';
import {
  ChevronLeft, ChevronRight, X, CheckSquare, Square,
  AlertTriangle, Calendar, ClipboardCheck, Save, Plus, Scissors, Leaf, HeartPulse,
  LogOut, Check, Trash2
} from 'lucide-react';
import PacFlowChart from './PacFlowChart';
import { RoundModeOfflineBanner } from './RoundModeOfflineBanner';
import { useSaveRoundNote } from '../hooks/useSaveRoundNote';
import { RoundConflictModal } from './RoundConflictModal';
import { useNetworkQuality } from '../hooks/useNetworkQuality';
import { localYmd, todayYmd } from '../utils/dates';

const RoundMode: React.FC = () => {
  const { patients, updatePatient, saveRound, navigateTo, sessionExpired, logout } = useApp();
  const { forceReconnect } = usePatients();
  const { icuWardNames, customTodoShortcuts } = useConfig();
  const { conflict: roundConflict, resolveConflict, dismissConflict } = useSaveRoundNote();
  const { quality: networkQuality } = useNetworkQuality();

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

  // ─── Patients filtered by selected ward, ordered ward → bed ───
  // Sorting mirrors the physical ward layout so rounds move bed-by-bed in
  // ascending order (matches the dashboard's sortByBed ordering).
  const activePatients = useMemo(
    () => {
      const list = !selectedWard
        ? []
        : selectedWard === '__all__'
        ? [...allActivePatients]
        : allActivePatients.filter(p => p.ward === selectedWard);
      return list.sort((a, b) => {
        const wardCmp = (a.ward ?? '').localeCompare(b.ward ?? '', undefined, { numeric: true });
        if (wardCmp !== 0) return wardCmp;
        return sortByBed(a, b);
      });
    },
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
  const [showDischargeSummary, setShowDischargeSummary] = useState(false);

  const touchStartX  = useRef(0);
  const swipeBlocked = useRef(false);   // true when touch started inside a no-swipe zone
  const navCooldownRef = useRef(false);
  const todoInputRef = useRef<HTMLInputElement>(null);

  // Reactive today — updates at midnight so cross-midnight sessions get the correct date
  const [today, setToday] = useState(() => todayYmd());
  useEffect(() => {
    const tick = () => {
      const next = todayYmd();
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
      const cutoff = localYmd(twoDaysAgo);
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
      // Last patient — show discharge summary before going to dashboard
      setShowDischargeSummary(true);
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

  // ─── Delete todo ───
  const handleDeleteTodo = useCallback((todoId: string) => {
    if (!patient) return;
    updatePatient({ ...patient, todos: patient.todos.filter(t => t.id !== todoId) });
  }, [patient, updatePatient]);

  // ─── Add new todo ───
  const handleAddTodo = useCallback(() => {
    if (!patient || !newTodoText.trim()) return;
    const newTodo: ToDoItem = { id: generateId(), task: newTodoText.trim(), isDone: false, addedDate: todayYmd() };
    const updatedPatient: Patient = { ...patient, todos: [...patient.todos, newTodo] };
    updatePatient(updatedPatient);
    setNewTodoText('');
    requestAnimationFrame(() => todoInputRef.current?.focus());
  }, [patient, newTodoText, updatePatient]);

  // ─── Quick-add shortcut (adds a task without typing) ───
  const handleQuickAdd = useCallback((task: string) => {
    if (!patient) return;
    if (patient.todos.some(t => t.task === task)) return; // already exists
    const newTodo: ToDoItem = { id: generateId(), task, isDone: false, addedDate: todayYmd() };
    updatePatient({ ...patient, todos: [...patient.todos, newTodo] });
  }, [patient, updatePatient]);

  // ─── Discharge Summary — shown after completing the last patient ───
  if (showDischargeSummary) {
    const dischargeReady = allActivePatients.filter(
      p => p.patientStatus === PatientStatus.DischargeReady,
    );
    return (
      <div className="min-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-ink flex items-center gap-2">
              {/* Check icon: completion confirmation, not a lab value — still vital-normal
                  per project convention (green reserved for normal/success meaning). */}
              <Check className="w-5 h-5 text-vital-normal" /> Round Complete
            </h2>
            <p className="text-xs text-ink-muted mt-0.5">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
              {' · '}{selectedWard}
            </p>
          </div>
          <button
            onClick={() => navigateTo('dashboard')}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-surface-sunken rounded-xl text-ink-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Discharge-ready list */}
        <div className="bg-surface-card rounded-2xl border border-accent shadow-sm overflow-hidden mb-4">
          <div className="bg-accent text-white px-5 py-3 flex items-center gap-2">
            <LogOut className="w-4 h-4" />
            <span className="font-bold text-sm">Discharge Ready</span>
            <span className="ml-auto bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {dischargeReady.length} patient{dischargeReady.length !== 1 ? 's' : ''}
            </span>
          </div>
          {dischargeReady.length === 0 ? (
            <div className="px-5 py-8 text-center text-ink-muted text-sm">
              No patients marked as discharge ready during this round.
            </div>
          ) : (
            <div className="divide-y divide-line">
              {dischargeReady.map(p => (
                <div key={p.ipNo} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-soft border border-accent flex items-center justify-center font-black text-accent-fg text-sm shrink-0">
                    {p.bed}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink truncate">{p.name}</p>
                    <p className="text-xs text-ink-muted truncate">{p.age}y · {p.diagnosis}</p>
                  </div>
                  {p.pod !== undefined && (
                    <span className="text-xs font-bold text-vital-normal-fg bg-vital-normal-surface border border-vital-normal-border px-2 py-0.5 rounded-full shrink-0">
                      POD {p.pod}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-auto">
          <button
            onClick={() => navigateTo('dashboard')}
            /* bg-accent (not bg-ink) deliberately: --color-ink flips to near-white in dark
               mode, which would make this button's white text invisible. Matches the fix
               already used in DailyRounds.tsx (bed badge / add-task button, task 3). */
            className="w-full min-h-[50px] bg-accent hover:bg-accent-pressed text-white font-bold rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" /> Finish Rounds
          </button>
        </div>
      </div>
    );
  }

  // ─── Ward selection screen ───
  if (!selectedWard) {
    return (
      <div className="min-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-bold text-ink">Start Ward Rounds</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
              {' · '}Select a ward to begin
            </p>
          </div>
          <button
            onClick={() => navigateTo('dashboard')}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-surface-sunken rounded-xl text-ink-muted hover:text-ink transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {allActivePatients.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-ink-muted gap-4">
            <ClipboardCheck className="w-16 h-16 opacity-30" />
            <p className="text-lg font-medium">No active patients to round on</p>
            <button onClick={() => navigateTo('dashboard')} className="text-accent-fg hover:underline text-sm">
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
                    ? 'border-vital-critical-border bg-vital-critical-surface hover:border-vital-critical'
                    /* blue here was decorative (ward-picker hover/count), not a lab value —
                       reclassified to accent so blue stays reserved for its clinical
                       ("abnormal-low") meaning per docs/UI-UX-CURRENT-STATE.md 2.1 */
                    : 'border-line bg-surface-card hover:border-accent'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-lg font-bold ${icuWardNames.has(ward) ? 'text-vital-critical-fg' : 'text-ink'}`}>
                    {ward}
                  </span>
                  <span className={`text-3xl font-black ${icuWardNames.has(ward) ? 'text-vital-critical' : 'text-accent-fg'}`}>
                    {count}
                  </span>
                </div>
                <p className="text-xs text-ink-muted">{count} patient{count !== 1 ? 's' : ''}</p>
                {icuWardNames.has(ward) && (
                  <span className="mt-2 inline-block text-xs font-bold text-vital-critical uppercase tracking-widest">ICU</span>
                )}
              </button>
            ))}
            {wardCounts.size > 1 && (
              <button
                onClick={() => setSelectedWard('__all__')}
                className="p-6 rounded-2xl border-2 border-dashed border-line bg-surface-sunken hover:border-accent hover:bg-accent-soft text-left transition-all"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-lg font-bold text-ink">All Wards</span>
                  <span className="text-3xl font-black text-ink-muted">{allActivePatients.length}</span>
                </div>
                <p className="text-xs text-ink-muted">Round on all {allActivePatients.length} patients</p>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (activePatients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-ink-muted gap-4">
        <ClipboardCheck className="w-16 h-16 opacity-30" />
        <p className="text-lg font-medium">No active patients in this ward</p>
        <button onClick={() => setSelectedWard(null)} className="text-accent-fg hover:underline text-sm">
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
    // Admin-configured custom shortcuts (set in Admin Settings → Hospital → Ward Round Shortcuts)
    ...(customTodoShortcuts ?? []).map(s => ({ label: s, task: s })),
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
        // bg-slate-900/60 backdrop scrim left hardcoded (judgment call, not in the
        // mapping table): a scrim's entire job is to darken whatever's behind it in
        // BOTH themes. bg-ink/60 would break this — --color-ink flips to near-white
        // in dark mode, which would lighten the background instead of dimming it.
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity">
          <div className="bg-surface-card rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center">
            <AlertTriangle className="w-12 h-12 text-vital-critical mx-auto mb-4" />
            <h3 className="text-xl font-bold text-ink mb-2">Session Expired</h3>
            <p className="text-sm text-ink mb-6 font-medium">
              Your login session has ended. Your draft note is secure on this device, but cannot be synced yet.
              <br /><br />
              Please log in again to continue.
            </p>
            <button
              onClick={() => { logout(); }}
              /* active:bg-blue-800 was a stray mismatched shade on an otherwise-teal
                 button (no other blue involved here) — folded into accent-pressed. */
              className="w-full py-3 bg-accent hover:bg-accent-pressed active:bg-accent-pressed text-white font-bold rounded-xl transition-colors shadow-sm"
            >
              Log In Again
            </button>
          </div>
        </div>
      )}

      {/* ─── Realtime connection status (Task 6) ─── */}
      <RoundModeOfflineBanner onRetry={forceReconnect} networkQuality={networkQuality} />

      {/* ─── Round note conflict modal (Task 2) ─── */}
      {roundConflict && (
        <RoundConflictModal
          conflict={roundConflict}
          onResolve={(choice) => resolveConflict(choice, undefined)}
          onDismiss={dismissConflict}
        />
      )}

      {/* ─── Header ─── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-ink">Ward Rounds</h2>
          <p className="text-xs text-ink-muted">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
            {' · '}
            <button
              onClick={() => { setSelectedWard(null); setIndex(0); setSavedSet(new Set()); }}
              className="text-accent-fg hover:underline"
            >
              {selectedWard === '__all__' ? 'All Wards' : selectedWard}
            </button>
            {' · '}Swipe or use arrows
          </p>
        </div>
        <button
          onClick={() => navigateTo('dashboard')}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-surface-sunken rounded-xl text-ink-muted hover:text-ink transition-colors"
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
                  ? /* isActive pill: left hardcoded (judgment call, not a mechanical
                       lookup) — this is the same "always-dark identity chrome" idiom
                       as the Patient Header below (which uses the darker bg-red-900/
                       bg-slate-900 shades for the same ICU/default split), so both
                       stay in sync. Converting only this chip to bg-accent/bg-ink
                       would (a) desync it from the header's
                       still-hardcoded look and (b) bg-ink risks the near-white-in-
                       dark-mode bug this task warns against. See Patient Header
                       comment below and task-4-report.md for full reasoning. */
                    isIcu
                    ? 'bg-red-800 text-white border-red-900 shadow-sm'
                    : 'bg-slate-800 text-white border-slate-900 shadow-sm'
                  : isSavedP
                  ? 'bg-vital-normal-surface text-vital-normal-fg border-vital-normal-border'
                  /* blue hover border here is decorative (chip hover), not a lab value */
                  : 'bg-surface-card text-ink border-line hover:border-accent'
              }`}
            >
              <span className={`font-black text-sm ${isActive ? 'text-white' : 'text-ink'}`}>
                {p.bed}
              </span>
              <span className="max-w-[80px] truncate">{p.name.split(' ')[0]}</span>
              {isSavedP && !isActive && <span className="text-vital-normal text-xs">✓</span>}
              {isConserv && (
                // text-green-300 (active branch) stays hardcoded — calibrated for the
                // permanently-dark pill above, not the theme-reactive vital-normal-fg
                // (which is tuned against white/light-card backgrounds). Non-active
                // branch converts normally since it sits on a normal light chip.
                <Leaf className={`w-3 h-3 shrink-0 ${isActive ? 'text-green-300' : 'text-vital-normal'}`} />
              )}
            </button>
          );
        })}
      </div>

      {/* ─── Main Card ─── */}
      <div className="flex-1 bg-surface-card rounded-2xl shadow-sm border border-line overflow-hidden">
        {/*
          Patient Header — JUDGMENT CALL, left hardcoded (bg-red-900 / bg-slate-900 +
          text-white, and every light-on-dark color within it below), not tokenized.
          Not a mechanical mapping-table lookup; documented here + commit message +
          task-4-report.md.

          Why: this bar is a deliberately-always-dark "hero" identity block (same role
          as the active pill in the nav strip above), not a plain card section. Two
          token-only options were considered and rejected:
            1. bg-surface-card/bg-surface — in LIGHT mode surface-card is WHITE, which
               would erase the bold dark banner entirely (a real visual regression, not
               a color-space conversion).
            2. bg-accent — recolors this (and the ICU red variant) teal, changing what
               the color communicates (ICU severity) into brand color; also doesn't
               extend sensibly to the red ICU variant.
          Instead this follows the verified precedent already accepted in this app:
          App.tsx's mobile header/sidebar (lines ~684, ~709) and LoginPage.tsx's left
          brand panel (lines ~102-112, see task-2-report.md) both keep a permanently-
          dark block with its light-on-dark text colors left hardcoded, for the same
          reason — the ink/vital-* tokens are calibrated against light-mode card
          backgrounds and lose meaning/contrast against a block that never lightens.
          This is safe (not the bug this task warns against): text-white paired with a
          hardcoded raw color never flips, so it can never become white-on-white the
          way bg-ink + text-white would.
        */}
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
          <div className="px-5 py-3 space-y-1.5 border-b border-line">
            {alerts.map((a, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg ${
                a.type === 'critical' ? 'bg-vital-critical-surface text-vital-critical-fg' :
                a.type === 'warning'  ? 'bg-vital-warning-surface text-vital-warning-fg' :
                /* getSmartAlerts()'s 'info' tier (utils/smartAlerts.ts) is a workflow
                   nudge ("consider discharge planning"), not an abnormal-low lab value
                   — reclassified to accent-soft so blue stays reserved for genuine
                   clinical meaning per docs/UI-UX-CURRENT-STATE.md 2.1. */
                                        'bg-accent-soft text-accent-fg'
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
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-vital-normal-surface text-vital-normal-fg border border-vital-normal-border">
                POD {patient.pod}
              </span>
            )}
            {patient.dos && (
              // DOS = date of surgery, a schedule date shown for context — not a lab
              // value, so reclassified to accent (see Smart Alerts comment above for
              // the same blue-is-not-always-clinical reasoning).
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-accent-soft text-accent-fg border border-accent">
                <Calendar className="w-3 h-3" /> DOS: {patient.dos}
              </span>
            )}
          </div>

          {/* Management Plan — resident selects during rounds */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-ink-muted uppercase tracking-wider shrink-0">Plan</span>
            <div className="flex gap-1.5">
              <button
                onClick={() => updatePatient({ ...patient, management: 'surgical_fixation' as ManagementPlan })}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  // border-blue-700 on the original was a stray mismatched shade next
                  // to a teal fill (no blue/clinical meaning) — aligned to border-accent.
                  (patient.management ?? 'surgical_fixation') === 'surgical_fixation'
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface-card text-ink border-line hover:border-accent'
                }`}
              >
                <Scissors className="w-3 h-3" /> Surgical Fixation
              </button>
              <button
                onClick={() => updatePatient({ ...patient, management: 'conservative' as ManagementPlan })}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  // Judgment call: NOT bg-vital-normal (solid) + text-white as the
                  // mapping table's literal "solid fill" option would suggest — that
                  // pairing computes to ~1.7:1 contrast in dark mode (--color-vital-
                  // normal is #4ade80 there, calibrated as a small graphic/icon tone,
                  // not a big fill safe under white text), which fails WCAG AA and
                  // would be a genuine legibility regression. Using the standard pale
                  // surface+fg+border trio instead — the same trio used for every
                  // other green instance in this file — is accessibility-safe in both
                  // themes. This also matches index.css's own stated intent ("kills
                  // teal+emerald split") of folding emerald into vital-normal rather
                  // than treating it as a second brand accent.
                  patient.management === 'conservative'
                    ? 'bg-vital-normal-surface text-vital-normal-fg border-vital-normal-border'
                    : 'bg-surface-card text-ink border-line hover:border-vital-normal-border'
                }`}
              >
                <Leaf className="w-3 h-3" /> Conservative
              </button>
              <button
                onClick={() => updatePatient({
                  ...patient,
                  patientStatus: patient.patientStatus === PatientStatus.DischargeReady
                    ? PatientStatus.Fit
                    : PatientStatus.DischargeReady,
                })}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  patient.patientStatus === PatientStatus.DischargeReady
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface-card text-ink border-line hover:border-accent hover:text-accent-fg'
                }`}
              >
                <LogOut className="w-3 h-3" />
                {patient.patientStatus === PatientStatus.DischargeReady ? 'Discharge Ready ✓' : 'Discharge Ready'}
              </button>
            </div>
          </div>

          {/* Comorbidities */}
          {/* purple was never part of this app's ink+teal chrome or vital-* clinical
              palette (leftover from before the Scrub Teal restyle, same class of stray
              color as the bg-purple-600 case flagged for LoginPage.tsx) — these are
              reference/informational tags, not a selected/primary element, so mapped
              to the neutral chip idiom (bg-surface-sunken) rather than accent. */}
          {(patient.comorbidities?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1">
              {patient.comorbidities.map(c => (
                <span key={c} className="px-2 py-0.5 text-[10px] font-medium bg-surface-sunken text-ink border border-line rounded-full">
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* Latest investigations — values shown are not color-flagged by range in
              the current implementation (no abnormal/normal distinction existed
              before this change either); preserved as plain neutral text, not
              invented as part of this color-token conversion. */}
          {latestLabs.length > 0 && (
            <div>
              <p className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-1.5">Latest Investigations</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {latestLabs.map(lab => (
                  <div key={lab.type} className="bg-surface-sunken rounded-lg px-2 py-1.5 border border-line min-w-0">
                    <p className="text-[9px] text-ink-muted uppercase tracking-wide truncate">{lab.type}</p>
                    <p className="text-sm font-bold text-ink">{lab.value}</p>
                    <p className="text-[9px] text-ink-muted">{lab.date}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PAC Clearance — shown for all pending (pre-op) patients */}
          {isPending && (
            <div data-no-swipe>
              <div className="flex items-center gap-1.5 mb-2">
                {/* decorative heading icon, not a lab value — reclassified to accent */}
                <HeartPulse className="w-4 h-4 text-accent-fg" />
                <p className="text-xs font-bold text-ink-muted uppercase tracking-wider">
                  PAC Clearance
                </p>
                {isSaved && <span className="text-vital-normal-fg text-xs font-semibold">· Saved ✓</span>}
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
            <p className="text-xs font-bold text-ink-muted uppercase tracking-wider mb-2">
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
                        // "order completed" state, per the brief's own example — vital-normal
                        done
                          ? 'bg-vital-normal-surface text-vital-normal-fg border-vital-normal-border cursor-default'
                          // hover here previews clickability, not a lab value — accent
                          : 'bg-surface-sunken text-ink border-line hover:bg-accent-soft hover:text-accent-fg hover:border-accent active:scale-95'
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
                <div key={todo.id} className="flex items-center rounded-lg border border-line overflow-hidden">
                  <button
                    onClick={() => handleToggleTodo(todo.id)}
                    className="flex-1 min-w-0 flex items-center gap-2.5 text-sm text-left p-2.5 min-h-11 hover:bg-surface-sunken transition-colors text-ink"
                  >
                    <Square className="w-4 h-4 text-ink-muted shrink-0" />
                    <span className="truncate">{todo.task}</span>
                  </button>
                  <button
                    onClick={() => handleDeleteTodo(todo.id)}
                    aria-label={`Delete task: ${todo.task}`}
                    className="shrink-0 min-w-11 min-h-11 flex items-center justify-center text-ink-muted hover:text-vital-critical active:text-vital-critical transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {doneTodos.map(todo => (
                <div key={todo.id} className="flex items-center rounded-lg border border-line overflow-hidden">
                  <button
                    onClick={() => handleToggleTodo(todo.id)}
                    className="flex-1 min-w-0 flex items-center gap-2.5 text-sm text-left p-2.5 min-h-11 hover:bg-surface-sunken transition-colors text-ink-muted line-through"
                  >
                    <CheckSquare className="w-4 h-4 text-vital-normal shrink-0" />
                    <span className="truncate">{todo.task}</span>
                  </button>
                  <button
                    onClick={() => handleDeleteTodo(todo.id)}
                    aria-label={`Delete task: ${todo.task}`}
                    className="shrink-0 min-w-11 min-h-11 flex items-center justify-center text-ink-muted hover:text-vital-critical active:text-vital-critical transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            {/* Add new todo — Enter submits and refocuses for next item */}
            <div className="flex gap-2">
              <input
                ref={todoInputRef}
                type="text"
                placeholder="New order / task…"
                className="flex-1 text-sm p-2.5 min-h-[44px] border border-line rounded-lg focus:ring-2 focus:ring-accent outline-none bg-surface-card"
                value={newTodoText}
                onChange={e => setNewTodoText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTodo(); } }}
              />
              <button
                onClick={handleAddTodo}
                disabled={!newTodoText.trim()}
                /* bg-accent (not bg-ink) — same fix as the Finish Rounds / Log In Again
                   buttons above, avoiding the bg-ink + text-white dark-mode bug. */
                className="w-11 h-11 flex items-center justify-center bg-accent hover:bg-accent-pressed disabled:opacity-30 text-white rounded-lg transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Next patient preview ─── */}
      {nextPatient && (
        <div className="mt-3 px-3 py-2 bg-surface-sunken border border-line rounded-xl flex items-center gap-3">
          <span className="text-[9px] font-bold uppercase tracking-wider text-ink-muted shrink-0">Next</span>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-base shrink-0 border ${icuWardNames.has(nextPatient.ward ?? '') ? 'bg-vital-critical-surface border-vital-critical-border text-vital-critical-fg' : 'bg-surface-sunken border-line text-ink'}`}>
            {nextPatient.bed}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ink truncate">{nextPatient.name}</p>
            <p className="text-[10px] text-ink-muted truncate">{nextPatient.diagnosis}</p>
          </div>
          {nextPatient.pod !== undefined && (
            <span className="text-[10px] font-bold text-vital-normal-fg bg-vital-normal-surface border border-vital-normal-border px-2 py-0.5 rounded-full shrink-0">
              POD {nextPatient.pod}
            </span>
          )}
          {(nextPatient.comorbidities?.length ?? 0) > 0 && (
            // same purple → neutral-chip reclassification as the Comorbidities section above
            <span className="text-[9px] text-ink bg-surface-sunken border border-line px-1.5 py-0.5 rounded-full shrink-0 hidden sm:block truncate max-w-[80px]">
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
          className="w-11 h-11 flex items-center justify-center shrink-0 rounded-xl border border-line hover:bg-surface-sunken disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 flex gap-2">
          <button
            onClick={() => handleSave(false)}
            /* surface-sunken → hover:surface: verified precedent for a neutral secondary-
               button hover already established in WardDashboard.tsx (e.g. its Export
               button, ~line 800: "bg-surface-card ... hover:bg-surface"), reused here
               since surface is reliably lighter than surface-sunken in both themes. */
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] py-2 bg-surface-sunken hover:bg-surface text-ink font-semibold rounded-xl transition-colors text-sm"
          >
            <Save className="w-4 h-4 shrink-0" /> Save
          </button>
          <button
            onClick={() => handleSave(true)}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] py-2 bg-accent hover:bg-accent-pressed text-white font-semibold rounded-xl transition-colors text-xs sm:text-sm shadow-sm"
          >
            {index < activePatients.length - 1 ? (
              <><Save className="w-3.5 h-3.5 shrink-0" /> Save & Next</>
            ) : (
              <><Check className="w-3.5 h-3.5 shrink-0" /> Round Complete</>
            )}
          </button>
        </div>

        <button
          onClick={goNext}
          disabled={index === activePatients.length - 1}
          className="w-11 h-11 flex items-center justify-center shrink-0 rounded-xl border border-line hover:bg-surface-sunken disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Counter + safe-area bottom padding for iOS home indicator */}
      <p className="text-center text-xs text-ink-muted mt-3 pb-[env(safe-area-inset-bottom)]">
        {index + 1} of {activePatients.length} patients
        {savedSet.size > 0 && ` · ${savedSet.size} noted`}
      </p>
    </div>
  );
};

export default RoundMode;
