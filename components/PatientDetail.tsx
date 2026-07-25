import React, { useMemo, useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useApp, useConfig } from '../contexts/AppContext';
import { PatientStatus } from '../types';
import { can } from '../utils/permissions';
import { getLabTrend, needsPac, wardOptionsForPatient } from '../utils/calculations';
import {
  ArrowLeft, Phone, MessageCircle, Activity, FileImage,
  Droplet, ClipboardCheck, CheckSquare, HeartPulse,
  TrendingUp, TrendingDown, Minus, AlertCircle, LogOut, FileText, Trash2,
  FileJson, Download, Pill, ClipboardList, Droplets, Bandage,
  Calculator, Send, ChevronDown, Home, ArrowRightLeft, Pencil, Plus, Leaf,
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import DateBottomSheet from './ui/DateBottomSheet';
import ErrorBoundary from './ErrorBoundary';
import DemographicsSection from './patient/DemographicsSection';
import ComorbiditiesSection from './patient/ComorbiditiesSection';
import RadiologyPanel from './patient/RadiologyPanel';
import StickyPatientHeader from './patient/StickyPatientHeader';
import MoveBedSheet from './patient/MoveBedSheet';
import FHIRExportModal from './FHIRExportModal';
import ScoringTools from './ScoringTools';
import ReferralLetter from './ReferralLetter';
import { todayYmd } from '../utils/dates';
const MedicationChart  = lazy(() => import('./MedicationChart'));
const NursingNotes     = lazy(() => import('./NursingNotes'));
const IntakeOutput     = lazy(() => import('./IntakeOutput'));
const BloodTransfusion = lazy(() => import('./BloodTransfusion'));
const WoundCare        = lazy(() => import('./WoundCare'));

// ─── Status Badge Config ──────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, { bg: string; text: string; dot: string }> = {
  'Fit':        { bg: 'bg-vital-normal-surface',  text: 'text-vital-normal-fg',  dot: 'bg-vital-normal'  },
  'Review':     { bg: 'bg-vital-warning-surface', text: 'text-vital-warning-fg', dot: 'bg-vital-warning' },
  'Critical':   { bg: 'bg-vital-critical-surface',text: 'text-vital-critical-fg',dot: 'bg-vital-critical'},
  'Went Home':  { bg: 'bg-accent-soft',           text: 'text-accent-fg',        dot: 'bg-accent'        },
  'Discharged': { bg: 'bg-surface-sunken',        text: 'text-ink-muted',        dot: 'bg-ink-faint'     },
  'Stable':     { bg: 'bg-vital-normal-surface',  text: 'text-vital-normal-fg',  dot: 'bg-vital-normal'  },
};
const DEFAULT_STATUS = { bg: 'bg-surface-sunken', text: 'text-ink-muted', dot: 'bg-ink-faint' };

const PAC_BADGE: Record<string, { bg: string; text: string; border: string; dot: string; icon: string }> = {
  'PAC Fit':     { bg: 'bg-vital-normal-surface',  text: 'text-vital-normal-fg',  border: 'border-vital-normal-border',  dot: 'bg-vital-normal',  icon: '✓' },
  'PAC Pending': { bg: 'bg-surface',               text: 'text-ink-muted',       border: 'border-line',                 dot: 'bg-ink-faint',     icon: '…' },
  'PAC Unfit':   { bg: 'bg-vital-critical-surface',text: 'text-vital-critical-fg',border: 'border-vital-critical-border',dot: 'bg-vital-critical',icon: '✕' },
  'PAC Review':  { bg: 'bg-vital-warning-surface', text: 'text-vital-warning-fg', border: 'border-vital-warning-border', dot: 'bg-vital-warning', icon: '?' },
};

function formatDateChip(iso: string | undefined): string {
  if (!iso) return 'Pending';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface PatientDetailProps {
  /** When provided (sheet / deep-link), overrides the router's navParams.id. */
  patientId?: string;
  /** When rendered in a sheet: close it instead of navigating to the dashboard. */
  onClose?: () => void;
  /** Layout hint — trims chrome the sheet already provides (e.g. its own close). */
  inSheet?: boolean;
}

const PatientDetail: React.FC<PatientDetailProps> = ({ patientId, onClose, inSheet }) => {
  const { navParams, navigateTo, patients, updatePatient, deletePatient, user } = useApp();
  const effectiveId = patientId ?? navParams.id;
  // In a sheet we close it; on the full route we navigate back to the dashboard.
  const dismiss = onClose ?? (() => navigateTo('dashboard'));
  const { labTypes, wards, showNursingNotes, showMedicationChart, showIntakeOutput, showBloodTransfusion, showWoundCare, hospitalName } = useConfig();

  const [showDischargeConfirm,  setShowDischargeConfirm]  = useState(false);
  const [showWentHomeConfirm,   setShowWentHomeConfirm]   = useState(false);
  const [showDeleteConfirm,     setShowDeleteConfirm]     = useState(false);
  const [showFhirExport,       setShowFhirExport]       = useState(false);
  const [showScoring,          setShowScoring]           = useState(false);
  const [showReferral,         setShowReferral]          = useState(false);
  const [activeTab,            setActiveTab]             = useState<'overview' | 'medications' | 'nursing' | 'io' | 'transfusion' | 'wound'>('overview');
  const [editingDate,          setEditingDate]           = useState<'doa' | 'dos' | null>(null);
  const [diagExpanded,         setDiagExpanded]          = useState(false);
  const [showMoveBed,          setShowMoveBed]           = useState(false);

  // Slim sticky header reveals once the tall hero scrolls out of view.
  const [showSticky, setShowSticky] = useState(false);
  const heroSentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = heroSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => setShowSticky(!entry.isIntersecting), { threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [effectiveId]);

  const canDischarge = can(user, 'patient:discharge');
  const canDelete    = can(user, 'patient:delete');
  const canEdit      = can(user, 'patient:edit');

  const patient = useMemo(() => patients.find(p => p.ipNo === effectiveId), [patients, effectiveId]);

  // Inline-editable fields — save on blur
  const [editDiagnosis, setEditDiagnosis] = useState('');
  const [editProcedure, setEditProcedure] = useState('');
  useEffect(() => {
    if (patient) {
      setEditDiagnosis(patient.diagnosis);
      setEditProcedure(patient.procedure ?? '');
    }
  }, [patient?.ipNo]);

  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-ink-faint">
        <AlertCircle className="w-12 h-12 mb-3 opacity-50" />
        <p className="text-lg font-medium">Patient not found</p>
        <button onClick={dismiss} className="mt-4 text-accent-fg hover:underline text-sm flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> {inSheet ? 'Close' : 'Back to dashboard'}
        </button>
      </div>
    );
  }

  const activeLabTypes     = labTypes.filter(lt => patient.labResults.some(r => r.type === lt.name));
  const pendingTodos       = patient.todos.filter(t => !t.isDone);
  const completedTodos     = patient.todos.filter(t => t.isDone);
  const daysSinceAdmission = Math.floor((Date.now() - new Date(patient.doa).getTime()) / 86_400_000);
  const isAlreadyDischarged = patient.patientStatus === PatientStatus.Discharged;
  const statusBadge        = STATUS_BADGE[patient.patientStatus] ?? DEFAULT_STATUS;
  const pacBadge           = PAC_BADGE[patient.pacStatus] ?? PAC_BADGE['PAC Pending'];
  const isDiagCode         = /^[#A-Z]\w{2,}$/.test(editDiagnosis.trim());
  const moveBedWardOptions = wardOptionsForPatient(wards, patient.unit);

  const handleDischarge = () => {
    updatePatient({ ...patient, patientStatus: PatientStatus.Discharged, dod: todayYmd() });
    setShowDischargeConfirm(false);
    navigateTo('discharge', { id: patient.ipNo });
  };

  const handleWentHome = () => {
    updatePatient({ ...patient, patientStatus: PatientStatus.WentHome });
    setShowWentHomeConfirm(false);
    dismiss();
  };

  const handleReturnToWard = () => {
    updatePatient({ ...patient, patientStatus: PatientStatus.Review });
    dismiss();
  };

  const handleDelete = () => {
    deletePatient(patient.ipNo);
    setShowDeleteConfirm(false);
    dismiss();
  };

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'up')    return <TrendingUp   className="w-3.5 h-3.5 text-vital-critical" />;
    if (trend === 'down')  return <TrendingDown  className="w-3.5 h-3.5 text-vital-normal" />;
    if (trend === 'equal') return <Minus         className="w-3.5 h-3.5 text-ink-faint" />;
    return null;
  };

  const mobileNumber = patient.mobile?.replace(/\D/g, '') ?? '';

  return (
    <div className="pb-24">
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>

      {/* ─── SLIM STICKY HEADER (reveals on scroll) ────────────────────── */}
      <StickyPatientHeader
        patient={patient}
        statusLabel={patient.patientStatus === PatientStatus.Review ? 'Needs review' : patient.patientStatus}
        statusColor={statusBadge}
        visible={showSticky}
      />

      {/* ─── DARK HEADER CARD ──────────────────────────────────────────── */}
      <div className="bg-accent rounded-b-3xl overflow-hidden mb-4 -mx-4 sm:-mx-8 px-4 sm:px-8 pt-2 pb-6">

        {/* Back / close — sits top-left, clear of the status badges top-right */}
        <button
          onClick={dismiss}
          className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded"
        >
          <ArrowLeft className="w-4 h-4" /> {inSheet ? 'Close' : 'Dashboard'}
        </button>

        {/* Name row + Status badges */}
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <div className="flex items-center gap-3 min-w-0">
            {canEdit ? (
              <button
                onClick={() => setShowMoveBed(true)}
                aria-label={patient.bed ? `Change bed (currently ${patient.bed})` : 'Assign bed'}
                title="Tap to assign / change bed"
                className="relative bg-white/10 hover:bg-white/20 w-12 h-12 shrink-0 rounded-xl flex items-center justify-center text-lg font-bold font-mono text-white border border-white/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                {patient.bed || <Plus className="w-5 h-5 text-white/70" />}
                <span className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 border-2 border-accent">
                  <Pencil className="w-2.5 h-2.5 text-accent" />
                </span>
              </button>
            ) : (
              <div className="bg-white/10 w-12 h-12 shrink-0 rounded-xl flex items-center justify-center text-lg font-bold font-mono text-white border border-white/20">
                {patient.bed || '—'}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-white tracking-tight truncate">{patient.name}</h1>
              <p className="text-white/70 text-xs mt-0.5">
                {patient.age}y · {patient.gender} · IP {patient.ipNo} · {patient.ward}
              </p>
            </div>
          </div>
          {/* Patient status + PAC status stacked */}
          <div className="shrink-0 flex flex-col items-end gap-1.5 mt-1">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold ${statusBadge.bg} ${statusBadge.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`} />
              {patient.patientStatus === PatientStatus.Review ? 'Needs Review' : patient.patientStatus}
            </span>
            {needsPac(patient) ? (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold border ${pacBadge.bg} ${pacBadge.text} ${pacBadge.border}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${pacBadge.dot}`} />
                {patient.pacStatus}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold border bg-vital-normal/20 text-white border-vital-normal/40">
                <Leaf className="w-3 h-3" aria-hidden="true" /> Conservative
              </span>
            )}
          </div>
        </div>

        {/* POD + Admitted metric chips — same white/10 treatment for both: a saturated
            green POD chip didn't read well against the new solid accent header. */}
        <div className="flex gap-3 mt-4">
          {patient.pod !== undefined && (
            <div className="flex-1 bg-white/10 border border-white/15 rounded-2xl px-4 py-3 text-center">
              <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Post-Op Day</p>
              <p className="text-3xl font-black font-mono text-white leading-tight mt-0.5">{patient.pod}</p>
            </div>
          )}
          <div className={`${patient.pod !== undefined ? 'flex-1' : 'flex-1'} bg-white/10 border border-white/15 rounded-2xl px-4 py-3 text-center`}>
            <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Admitted</p>
            <p className="text-3xl font-black font-mono text-white leading-tight mt-0.5">{daysSinceAdmission}d</p>
          </div>
        </div>
      </div>

      {/* Sentinel: once this scrolls above the top, the slim sticky header shows. */}
      <div ref={heroSentinelRef} className="h-0" aria-hidden="true" />

      {/* ─── RADIOLOGY (pinned — first-class for an ortho ward) ────────── */}
      <RadiologyPanel patient={patient} onOpenFull={() => navigateTo('radiology', { id: patient.ipNo })} />

      {/* ─── DIAGNOSIS + PROCEDURE CARD ────────────────────────────────── */}
      <div className="bg-surface-card rounded-2xl shadow-sm border border-line overflow-hidden mb-3">
        <div className="border-l-4 border-accent px-4 py-4 space-y-3.5">

          {/* Diagnosis */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint mb-1.5">Diagnosis</p>
            {canEdit ? (
              <div className="flex items-start gap-2">
                {isDiagCode && (
                  <button
                    onClick={() => setDiagExpanded(!diagExpanded)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent-soft border border-accent rounded-lg shrink-0 mt-0.5"
                  >
                    <span className="font-mono text-sm font-bold text-accent-fg leading-none">{editDiagnosis}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-accent-fg transition-transform ${diagExpanded ? 'rotate-180' : ''}`} />
                  </button>
                )}
                <input
                  value={isDiagCode && !diagExpanded ? '' : editDiagnosis}
                  placeholder={isDiagCode && !diagExpanded ? 'Tap code to expand…' : 'Enter diagnosis'}
                  onChange={e => { setEditDiagnosis(e.target.value); setDiagExpanded(false); }}
                  onBlur={() => {
                    if (editDiagnosis.trim() && editDiagnosis !== patient.diagnosis) {
                      updatePatient({ ...patient, diagnosis: editDiagnosis.trim() });
                    } else {
                      setEditDiagnosis(patient.diagnosis);
                    }
                  }}
                  className={`flex-1 text-[18px] font-semibold text-ink bg-transparent border-b border-transparent hover:border-line focus:border-accent focus:bg-accent-soft/40 outline-none py-0.5 transition-colors leading-snug placeholder:text-ink-faint placeholder:text-sm placeholder:font-normal ${isDiagCode && !diagExpanded ? 'hidden' : 'block'}`}
                />
                {isDiagCode && !diagExpanded && (
                  <span className="text-[11px] text-ink-faint italic self-center">tap to expand/edit</span>
                )}
              </div>
            ) : (
              <p className="text-[18px] font-semibold text-ink leading-snug">{patient.diagnosis}</p>
            )}
          </div>

          <div className="h-px bg-line" />

          {/* Procedure */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint mb-1.5">Procedure</p>
            {canEdit ? (
              <input
                value={editProcedure}
                onChange={e => setEditProcedure(e.target.value)}
                onBlur={() => {
                  const trimmed = editProcedure.trim();
                  if (trimmed !== (patient.procedure ?? '')) {
                    updatePatient({ ...patient, procedure: trimmed || undefined });
                  }
                }}
                className="w-full text-[18px] font-semibold text-ink bg-transparent border-b border-transparent hover:border-line focus:border-accent focus:bg-accent-soft/40 outline-none py-0.5 transition-colors leading-snug placeholder:text-ink-faint placeholder:text-sm placeholder:font-normal"
                placeholder="Enter procedure (optional)"
              />
            ) : (
              <p className="text-[18px] font-semibold text-ink leading-snug">
                {patient.procedure || <span className="text-ink-faint italic text-base font-normal">Pending</span>}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ─── TREATMENT + DATES ROW ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-3">

        {/* Treatment segmented control */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-line px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint mb-2">Treatment</p>
          <div className="flex gap-0.5 p-0.5 bg-surface-sunken rounded-xl" style={{ height: 36 }}>
            <button
              onClick={() => canEdit && updatePatient({ ...patient, management: 'surgical_fixation' })}
              className={`flex-1 text-xs font-bold rounded-lg transition-all leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                (patient.management ?? 'surgical_fixation') === 'surgical_fixation'
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Surgical
            </button>
            <button
              onClick={() => canEdit && updatePatient({ ...patient, management: 'conservative' })}
              className={`flex-1 text-xs font-bold rounded-lg transition-all leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                patient.management === 'conservative'
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Conserv.
            </button>
          </div>
        </div>

        {/* Date chips */}
        <div className="bg-surface-card rounded-2xl shadow-sm border border-line px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint mb-2">Dates</p>
          <div className="flex gap-2">
            <button
              onClick={() => canEdit && setEditingDate('doa')}
              className="flex-1 flex flex-col px-2 py-1.5 bg-surface hover:bg-accent-soft border border-line hover:border-accent rounded-xl transition-colors text-left group"
            >
              <span className="text-[9px] font-bold uppercase tracking-wider text-ink-faint group-hover:text-accent-fg">DOA</span>
              <span className="text-[11px] font-semibold font-mono text-ink leading-none mt-0.5">{formatDateChip(patient.doa)}</span>
            </button>
            <button
              onClick={() => canEdit && setEditingDate('dos')}
              className="flex-1 flex flex-col px-2 py-1.5 bg-surface hover:bg-accent-soft border border-line hover:border-accent rounded-xl transition-colors text-left group"
            >
              <span className="text-[9px] font-bold uppercase tracking-wider text-ink-faint group-hover:text-accent-fg">DOS</span>
              <span className="text-[11px] font-semibold font-mono text-ink leading-none mt-0.5">{formatDateChip(patient.dos) || <span className="text-ink-faint">Pending</span>}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── DEMOGRAPHICS & ADMISSION (inline-editable) ────────────────── */}
      <DemographicsSection patient={patient} canEdit={canEdit} onUpdate={updatePatient} />

      {/* ─── CONTACT CARD ──────────────────────────────────────────────── */}
      {patient.mobile && (
        <div className="bg-surface-card rounded-2xl shadow-sm border border-line px-4 py-3 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint mb-2">Contact</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink">{patient.mobile}</p>
              <p className="text-[11px] text-ink-faint">Patient / Guardian</p>
            </div>
            <a
              href={`tel:${mobileNumber}`}
              className="flex items-center justify-center w-10 h-10 bg-accent-soft hover:bg-accent-soft border border-accent rounded-xl transition-colors shrink-0"
              aria-label="Call"
            >
              <Phone className="w-4.5 h-4.5 text-accent-fg" />
            </a>
            {/* WhatsApp keeps its brand green intentionally — recognizable third-party
                affordance, not one of this app's clinical-state colors. */}
            <a
              href={`https://wa.me/${mobileNumber.startsWith('91') ? mobileNumber : '91' + mobileNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-10 h-10 bg-green-50 hover:bg-green-100 border border-green-200 rounded-xl transition-colors shrink-0"
              aria-label="WhatsApp"
            >
              <MessageCircle className="w-4.5 h-4.5 text-green-600" />
            </a>
          </div>
        </div>
      )}

      {/* ─── PAC STATUS CARD (not applicable to conservative patients) ── */}
      {needsPac(patient) && (
      <button
        onClick={() => navigateTo('pac')}
        className={`w-full text-left bg-surface-card rounded-2xl shadow-sm border border-line px-4 py-3 mb-3 flex items-center gap-4 hover:border-accent active:scale-[0.99] transition-all`}
      >
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl font-black border-2 ${pacBadge.bg} ${pacBadge.border} ${pacBadge.text} shrink-0`}>
          {pacBadge.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint">PAC / Pre-Op Clearance</p>
          <p className={`text-base font-bold mt-0.5 ${pacBadge.text}`}>{patient.pacStatus}</p>
          {patient.pacChecklist && (
            <p className="text-[11px] text-ink-faint mt-0.5 truncate">
              {Object.values(patient.pacChecklist).filter(Boolean).length} items completed
            </p>
          )}
        </div>
        <HeartPulse className="w-5 h-5 text-ink-faint shrink-0" />
      </button>
      )}

      {/* ─── COMORBIDITIES & ALLERGIES (inline-editable) ───────────────── */}
      <ComorbiditiesSection patient={patient} canEdit={canEdit} onUpdate={updatePatient} />

      {/* ─── QUICK ACTIONS ─────────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1 scrollbar-hide">
        <button onClick={() => setShowScoring(true)} className="flex items-center gap-1.5 px-3 py-2.5 bg-accent hover:bg-accent-pressed text-white text-xs font-bold rounded-xl transition-colors shrink-0 min-h-[44px]">
          <Calculator className="w-4 h-4" /><span>Scores</span>
        </button>
        <button onClick={() => setShowReferral(true)} className="flex items-center gap-1.5 px-3 py-2.5 bg-accent hover:bg-accent-pressed text-white text-xs font-bold rounded-xl transition-colors shrink-0 min-h-[44px]">
          <Send className="w-4 h-4" /><span>Refer</span>
        </button>
        <button onClick={() => navigateTo('rounds')} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-surface-card rounded-xl shadow-sm border border-line hover:border-accent hover:bg-accent-soft transition-colors text-xs font-bold text-ink whitespace-nowrap">
          <ClipboardCheck className="w-4 h-4 text-accent-fg" /> Daily Rounds
        </button>
        <button onClick={() => navigateTo('labs', { id: patient.ipNo })} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-surface-card rounded-xl shadow-sm border border-line hover:border-accent hover:bg-accent-soft transition-colors text-xs font-bold text-ink whitespace-nowrap">
          <Droplet className="w-4 h-4 text-accent-fg" /> Lab Trends
        </button>
        <button onClick={() => navigateTo('radiology', { id: patient.ipNo })} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-surface-card rounded-xl shadow-sm border border-line hover:border-accent hover:bg-accent-soft transition-colors text-xs font-bold text-ink whitespace-nowrap">
          <FileImage className="w-4 h-4 text-accent-fg" /> Radiology
        </button>
        <button onClick={() => navigateTo('pac')} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-surface-card rounded-xl shadow-sm border border-line hover:border-accent hover:bg-accent-soft transition-colors text-xs font-bold text-ink whitespace-nowrap">
          <HeartPulse className="w-4 h-4 text-accent-fg" /> PAC Status
        </button>
        {canEdit && (
          <button onClick={() => setShowMoveBed(true)} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-surface-card rounded-xl shadow-sm border border-line hover:border-accent hover:bg-accent-soft transition-colors text-xs font-bold text-ink whitespace-nowrap">
            <ArrowRightLeft className="w-4 h-4 text-accent-fg" /> Move bed
          </button>
        )}
        {can(user, 'investigations:write') && (
          <button onClick={() => setShowFhirExport(true)} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-accent-soft rounded-xl shadow-sm border border-accent hover:bg-accent-soft transition-colors text-xs font-bold text-accent-fg whitespace-nowrap">
            <FileJson className="w-4 h-4 text-accent-fg" /> FHIR
          </button>
        )}
        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify(patient, null, 2)], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `patient_${patient.ipNo}_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-surface-sunken rounded-xl shadow-sm border border-line hover:bg-accent-soft transition-colors text-xs font-bold text-ink-muted whitespace-nowrap"
        >
          <Download className="w-4 h-4 text-ink-muted" /> Export
        </button>
        {isAlreadyDischarged ? (
          <button onClick={() => navigateTo('discharge', { id: patient.ipNo })} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-accent-soft rounded-xl shadow-sm border border-accent hover:bg-accent-soft transition-colors text-xs font-bold text-accent-fg whitespace-nowrap">
            <FileText className="w-4 h-4 text-accent-fg" /> Discharge Summary
          </button>
        ) : patient.patientStatus === PatientStatus.WentHome ? (
          <button onClick={handleReturnToWard} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-accent-soft rounded-xl shadow-sm border border-accent hover:bg-accent-soft transition-colors text-xs font-bold text-accent-fg whitespace-nowrap">
            <ArrowLeft className="w-4 h-4 text-accent-fg" /> Return to Ward
          </button>
        ) : canDischarge ? (
          <>
            <button onClick={() => setShowWentHomeConfirm(true)} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-accent-soft rounded-xl shadow-sm border border-accent hover:bg-accent-soft transition-colors text-xs font-bold text-accent-fg whitespace-nowrap">
              <Home className="w-4 h-4 text-accent-fg" /> Went Home
            </button>
            <button onClick={() => setShowDischargeConfirm(true)} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-vital-critical-surface rounded-xl shadow-sm border border-vital-critical-border hover:opacity-90 transition-colors text-xs font-bold text-vital-critical-fg whitespace-nowrap">
              <LogOut className="w-4 h-4 text-vital-critical" /> Discharge
            </button>
          </>
        ) : null}
      </div>

      {/* ─── DELETE RECORD ─────────────────────────────────────────────── */}
      {canDelete && (
        <div className="flex justify-end mb-4">
          <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-vital-critical-fg border border-vital-critical-border rounded-xl hover:bg-vital-critical-surface transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Delete Record
          </button>
        </div>
      )}

      {/* ─── OPTIONAL TABS (Medications / Nursing / I/O etc.) ──────────── */}
      {(showMedicationChart || showNursingNotes || showIntakeOutput || showBloodTransfusion || showWoundCare) && (
        <div role="tablist" className="flex gap-1 border-b border-line bg-surface-card rounded-t-2xl px-2 pt-2 overflow-x-auto scrollbar-hide mb-0">
          {([
            { key: 'overview',    label: 'Overview',    icon: <Activity className="w-4 h-4" />,       always: true  },
            { key: 'medications', label: 'Medications', icon: <Pill className="w-4 h-4" />,           always: false, enabled: showMedicationChart  },
            { key: 'nursing',     label: 'Nursing',     icon: <ClipboardList className="w-4 h-4" />, always: false, enabled: showNursingNotes     },
            { key: 'io',          label: 'I/O',         icon: <Droplets className="w-4 h-4" />,      always: false, enabled: showIntakeOutput      },
            { key: 'transfusion', label: 'Transfusion', icon: <Droplet className="w-4 h-4" />,       always: false, enabled: showBloodTransfusion  },
            { key: 'wound',       label: 'Wound',       icon: <Bandage className="w-4 h-4" />,       always: false, enabled: showWoundCare         },
          ] as { key: typeof activeTab; label: string; icon: React.ReactNode; always: boolean; enabled?: boolean }[])
            .filter(tab => tab.always || tab.enabled)
            .map(tab => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-sm font-medium rounded-t-xl transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-accent text-accent-fg'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
        </div>
      )}

      {/* Tab content */}
      {showMedicationChart && activeTab === 'medications' && (
        <div className="bg-surface-card rounded-b-2xl shadow-sm border border-t-0 border-line p-5">
          <ErrorBoundary fallbackMessage="Medication chart failed to load.">
            <Suspense fallback={<div className="text-center py-8 text-ink-faint text-sm">Loading…</div>}>
              <MedicationChart patientIpNo={patient.ipNo} hospitalId={user?.hospitalId ?? ''} drugAllergies={patient.drugAllergies ?? []} />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
      {showNursingNotes && activeTab === 'nursing' && (
        <div className="bg-surface-card rounded-b-2xl shadow-sm border border-t-0 border-line p-5">
          <ErrorBoundary fallbackMessage="Nursing notes failed to load.">
            <Suspense fallback={<div className="text-center py-8 text-ink-faint text-sm">Loading…</div>}>
              <NursingNotes patientIpNo={patient.ipNo} hospitalId={user?.hospitalId ?? ''} />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
      {showIntakeOutput && activeTab === 'io' && (
        <div className="bg-surface-card rounded-b-2xl shadow-sm border border-t-0 border-line p-5">
          <ErrorBoundary fallbackMessage="Intake/Output chart failed to load.">
            <Suspense fallback={<div className="text-center py-8 text-ink-faint text-sm">Loading…</div>}>
              <IntakeOutput patientIpNo={patient.ipNo} />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
      {showBloodTransfusion && activeTab === 'transfusion' && (
        <div className="bg-surface-card rounded-b-2xl shadow-sm border border-t-0 border-line p-5">
          <ErrorBoundary fallbackMessage="Blood transfusion records failed to load.">
            <Suspense fallback={<div className="text-center py-8 text-ink-faint text-sm">Loading…</div>}>
              <BloodTransfusion patientIpNo={patient.ipNo} />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
      {showWoundCare && activeTab === 'wound' && (
        <div className="bg-surface-card rounded-b-2xl shadow-sm border border-t-0 border-line p-5">
          <ErrorBoundary fallbackMessage="Wound care records failed to load.">
            <Suspense fallback={<div className="text-center py-8 text-ink-faint text-sm">Loading…</div>}>
              <WoundCare patientIpNo={patient.ipNo} />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}

      {/* ─── OVERVIEW TAB CONTENT ──────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <>
          {/* Lab Summary */}
          {activeLabTypes.length > 0 && (
            <div className="bg-surface-card rounded-2xl shadow-sm border border-line p-4 mt-3">
              <h3 className="font-bold text-ink flex items-center gap-2 mb-3 text-sm">
                <Activity className="w-4 h-4 text-accent-fg" /> Lab Summary
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {activeLabTypes.map(lt => {
                  const data  = getLabTrend(patient.labResults, lt.name);
                  const isHigh = lt.alertHigh !== null && data.latest !== undefined && data.latest > lt.alertHigh;
                  return (
                    <div key={lt.name} className="bg-surface rounded-xl p-3 border border-line">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-ink-muted uppercase">{lt.name}</span>
                        <TrendIcon trend={data.trend} />
                      </div>
                      {data.latest !== undefined ? (
                        <>
                          <span className={`text-xl font-bold font-mono ${isHigh ? 'text-vital-critical-fg' : 'text-ink'}`}>{data.latest}</span>
                          <span className="text-xs text-ink-faint ml-1">{lt.unit}</span>
                          {data.latestDate && <p className="text-xs text-ink-faint mt-0.5">{data.latestDate}</p>}
                        </>
                      ) : (
                        <span className="text-sm text-ink-faint">No data</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active Orders */}
          {patient.todos.length > 0 && (
            <div className="bg-surface-card rounded-2xl shadow-sm border border-line p-4 mt-3">
              <h3 className="font-bold text-ink flex items-center gap-2 mb-3 text-sm">
                <CheckSquare className="w-4 h-4 text-accent-fg" /> Orders ({pendingTodos.length} pending)
              </h3>
              <div className="space-y-1.5">
                {pendingTodos.map(t => (
                  <div key={t.id} className="flex items-center gap-2 p-2 bg-vital-warning-surface rounded-xl border border-vital-warning-border">
                    <div className="w-2 h-2 bg-vital-warning rounded-full shrink-0" />
                    <span className="text-sm text-ink">{t.task}</span>
                  </div>
                ))}
                {completedTodos.map(t => (
                  <div key={t.id} className="flex items-center gap-2 p-2 bg-surface rounded-xl border border-line">
                    <div className="w-2 h-2 bg-vital-normal rounded-full shrink-0" />
                    <span className="text-sm text-ink-faint line-through">{t.task}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Imaging now lives in the pinned RadiologyPanel above. */}

          {/* Rounds History */}
          {patient.dailyRounds.length > 0 && (
            <div className="bg-surface-card rounded-2xl shadow-sm border border-line p-4 mt-3">
              <h3 className="font-bold text-ink flex items-center gap-2 mb-3 text-sm">
                <ClipboardCheck className="w-4 h-4 text-accent-fg" /> Rounds History
              </h3>
              <div className="space-y-2">
                {patient.dailyRounds
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, 5)
                  .map(round => (
                    <div key={round.date} className="bg-surface rounded-xl p-3 border border-line">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-accent-fg">{round.date}</span>
                        <span className="text-xs text-ink-faint">{round.todos.filter(t => t.isDone).length}/{round.todos.length} done</span>
                      </div>
                      <p className="text-sm text-ink">{round.note || 'No note recorded'}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── DIALOGS ───────────────────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={showWentHomeConfirm}
        title="Send Patient Home"
        message={`Mark ${patient.name} as Went Home? They will be removed from the active ward list but can be returned at any time.`}
        confirmLabel="Yes, Went Home"
        variant="warning"
        onConfirm={handleWentHome}
        onCancel={() => setShowWentHomeConfirm(false)}
      />
      <ConfirmDialog
        isOpen={showDischargeConfirm}
        title="Discharge Patient"
        message={`Discharge ${patient.name}? Today (${new Date().toLocaleDateString()}) will be set as the discharge date.`}
        confirmLabel="Confirm Discharge"
        variant="warning"
        onConfirm={handleDischarge}
        onCancel={() => setShowDischargeConfirm(false)}
      />
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Permanently Delete Record"
        message={`This will permanently remove ${patient.name}'s entire record. This cannot be undone.`}
        confirmLabel="Delete Permanently"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {showFhirExport && <FHIRExportModal patient={patient} onClose={() => setShowFhirExport(false)} />}
      {showScoring    && <ScoringTools onClose={() => setShowScoring(false)} />}
      {showReferral   && (
        <ReferralLetter
          patient={patient}
          hospitalName={hospitalName ?? 'Hospital'}
          referringDoctor={user?.name ?? 'Doctor'}
          onClose={() => setShowReferral(false)}
        />
      )}

      {/* Move bed bottom sheet */}
      {showMoveBed && (
        <MoveBedSheet
          patient={patient}
          wardOptions={moveBedWardOptions.map(w => w.name)}
          onSave={(bed, ward) => updatePatient({ ...patient, bed, ward })}
          onClose={() => setShowMoveBed(false)}
        />
      )}

      {/* Date bottom sheet */}
      {editingDate && (
        <DateBottomSheet
          label={editingDate === 'doa' ? 'Date of Admission' : 'Date of Surgery'}
          value={(editingDate === 'doa' ? patient.doa : patient.dos) ?? ''}
          onSave={val => updatePatient(
            editingDate === 'doa'
              ? { ...patient, doa: val || undefined } as Parameters<typeof updatePatient>[0]
              : { ...patient, dos: val || undefined, plannedDos: undefined },
          )}
          onClose={() => setEditingDate(null)}
        />
      )}
    </div>
  );
};

export default PatientDetail;
