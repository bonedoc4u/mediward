import React, { useMemo, useState, useEffect, lazy, Suspense } from 'react';
import { useApp, useConfig } from '../contexts/AppContext';
import { PatientStatus } from '../types';
import { can } from '../utils/permissions';
import { getLabTrend } from '../utils/calculations';
import {
  ArrowLeft, Phone, MessageCircle, Activity, FileImage,
  Droplet, ClipboardCheck, CheckSquare, HeartPulse,
  TrendingUp, TrendingDown, Minus, AlertCircle, LogOut, FileText, Trash2,
  FileJson, Download, Pill, ClipboardList, Droplets, Bandage,
  Calculator, Send, X, ChevronDown,
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import ErrorBoundary from './ErrorBoundary';
import FHIRExportModal from './FHIRExportModal';
import ScoringTools from './ScoringTools';
import ReferralLetter from './ReferralLetter';

const MedicationChart  = lazy(() => import('./MedicationChart'));
const NursingNotes     = lazy(() => import('./NursingNotes'));
const IntakeOutput     = lazy(() => import('./IntakeOutput'));
const BloodTransfusion = lazy(() => import('./BloodTransfusion'));
const WoundCare        = lazy(() => import('./WoundCare'));

// ─── Status Badge Config ──────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, { bg: string; text: string; dot: string }> = {
  'Fit':        { bg: 'bg-green-100',   text: 'text-green-800',  dot: 'bg-green-500'  },
  'Review':     { bg: 'bg-amber-100',   text: 'text-amber-800',  dot: 'bg-amber-500'  },
  'Critical':   { bg: 'bg-red-100',     text: 'text-red-800',    dot: 'bg-red-500'    },
  'Discharged': { bg: 'bg-blue-100',    text: 'text-blue-800',   dot: 'bg-blue-500'   },
  'Stable':     { bg: 'bg-green-100',   text: 'text-green-800',  dot: 'bg-green-500'  },
};
const DEFAULT_STATUS = { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400' };

const PAC_BADGE: Record<string, { bg: string; text: string; border: string; dot: string; icon: string }> = {
  'PAC Fit':     { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', icon: '✓' },
  'PAC Pending': { bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400',   icon: '…' },
  'PAC Unfit':   { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500',     icon: '✕' },
  'PAC Review':  { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500',   icon: '?' },
};

function formatDateChip(iso: string | undefined): string {
  if (!iso) return 'Pending';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

// ─── Date Bottom Sheet ────────────────────────────────────────────────────────
const DateBottomSheet: React.FC<{
  label: string;
  value: string;
  onSave: (v: string) => void;
  onClose: () => void;
}> = ({ label, value, onSave, onClose }) => {
  const [date, setDate] = useState(value);
  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl shadow-2xl px-5 pt-5 pb-10 animate-[slideUp_0.25s_ease-out]">
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-slate-800">{label}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          max={new Date().toISOString().split('T')[0]}
          className="w-full px-4 py-3.5 border border-slate-200 rounded-2xl text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent mb-4"
          autoFocus
        />
        <button
          onClick={() => { onSave(date); onClose(); }}
          className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-2xl transition-colors"
        >
          Confirm Date
        </button>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const PatientDetail: React.FC = () => {
  const { navParams, navigateTo, patients, updatePatient, deletePatient, user } = useApp();
  const { labTypes, showNursingNotes, showMedicationChart, showIntakeOutput, showBloodTransfusion, showWoundCare, hospitalName } = useConfig();

  const [showDischargeConfirm, setShowDischargeConfirm] = useState(false);
  const [showDeleteConfirm,    setShowDeleteConfirm]    = useState(false);
  const [showFhirExport,       setShowFhirExport]       = useState(false);
  const [showScoring,          setShowScoring]           = useState(false);
  const [showReferral,         setShowReferral]          = useState(false);
  const [activeTab,            setActiveTab]             = useState<'overview' | 'medications' | 'nursing' | 'io' | 'transfusion' | 'wound'>('overview');
  const [editingDate,          setEditingDate]           = useState<'doa' | 'dos' | null>(null);
  const [diagExpanded,         setDiagExpanded]          = useState(false);

  const canDischarge = can(user, 'patient:discharge');
  const canDelete    = can(user, 'patient:delete');
  const canEdit      = can(user, 'patient:edit');

  const patient = useMemo(() => patients.find(p => p.ipNo === navParams.id), [patients, navParams.id]);

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
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <AlertCircle className="w-12 h-12 mb-3 opacity-50" />
        <p className="text-lg font-medium">Patient not found</p>
        <button onClick={() => navigateTo('dashboard')} className="mt-4 text-teal-600 hover:underline text-sm flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
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

  const handleDischarge = () => {
    updatePatient({ ...patient, patientStatus: PatientStatus.Discharged, dod: new Date().toISOString().split('T')[0] });
    setShowDischargeConfirm(false);
    navigateTo('discharge', { id: patient.ipNo });
  };

  const handleDelete = () => {
    deletePatient(patient.ipNo);
    setShowDeleteConfirm(false);
    navigateTo('dashboard');
  };

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'up')    return <TrendingUp   className="w-3.5 h-3.5 text-red-500" />;
    if (trend === 'down')  return <TrendingDown  className="w-3.5 h-3.5 text-green-500" />;
    if (trend === 'equal') return <Minus         className="w-3.5 h-3.5 text-slate-400" />;
    return null;
  };

  const mobileNumber = patient.mobile?.replace(/\D/g, '') ?? '';

  return (
    <div className="pb-24">
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>

      {/* ─── DARK HEADER CARD ──────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-b-3xl overflow-hidden mb-4 -mx-4 sm:-mx-8 px-4 sm:px-8 pt-2 pb-6">

        {/* Back */}
        <button
          onClick={() => navigateTo('dashboard')}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors mb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded"
        >
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>

        {/* Name row + Status badges */}
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-white/10 w-12 h-12 shrink-0 rounded-xl flex items-center justify-center text-lg font-bold text-white border border-white/20">
              {patient.bed}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-white tracking-tight truncate">{patient.name}</h1>
              <p className="text-slate-400 text-xs mt-0.5">
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
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold border ${pacBadge.bg} ${pacBadge.text} ${pacBadge.border}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${pacBadge.dot}`} />
              {patient.pacStatus}
            </span>
          </div>
        </div>

        {/* POD + Admitted metric chips */}
        <div className="flex gap-3 mt-4">
          {patient.pod !== undefined && (
            <div className="flex-1 bg-green-500/20 border border-green-400/25 rounded-2xl px-4 py-3 text-center">
              <p className="text-green-300 text-[10px] font-bold uppercase tracking-widest">Post-Op Day</p>
              <p className="text-3xl font-black text-green-200 leading-tight mt-0.5">{patient.pod}</p>
            </div>
          )}
          <div className={`${patient.pod !== undefined ? 'flex-1' : 'flex-1'} bg-white/10 border border-white/15 rounded-2xl px-4 py-3 text-center`}>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Admitted</p>
            <p className="text-3xl font-black text-white leading-tight mt-0.5">{daysSinceAdmission}d</p>
          </div>
        </div>
      </div>

      {/* ─── DIAGNOSIS + PROCEDURE CARD ────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-3">
        <div className="border-l-4 border-teal-500 px-4 py-4 space-y-3.5">

          {/* Diagnosis */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Diagnosis</p>
            {canEdit ? (
              <div className="flex items-start gap-2">
                {isDiagCode && (
                  <button
                    onClick={() => setDiagExpanded(!diagExpanded)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-50 border border-teal-200 rounded-lg shrink-0 mt-0.5"
                  >
                    <span className="font-mono text-sm font-bold text-teal-700 leading-none">{editDiagnosis}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-teal-500 transition-transform ${diagExpanded ? 'rotate-180' : ''}`} />
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
                  className={`flex-1 text-[18px] font-semibold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-400 focus:bg-teal-50/20 outline-none py-0.5 transition-colors leading-snug placeholder:text-slate-300 placeholder:text-sm placeholder:font-normal ${isDiagCode && !diagExpanded ? 'hidden' : 'block'}`}
                />
                {isDiagCode && !diagExpanded && (
                  <span className="text-[11px] text-slate-400 italic self-center">tap to expand/edit</span>
                )}
              </div>
            ) : (
              <p className="text-[18px] font-semibold text-slate-900 leading-snug">{patient.diagnosis}</p>
            )}
          </div>

          <div className="h-px bg-slate-100" />

          {/* Procedure */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Procedure</p>
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
                className="w-full text-[18px] font-semibold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-teal-400 focus:bg-teal-50/20 outline-none py-0.5 transition-colors leading-snug placeholder:text-slate-300 placeholder:text-sm placeholder:font-normal"
                placeholder="Enter procedure (optional)"
              />
            ) : (
              <p className="text-[18px] font-semibold text-slate-900 leading-snug">
                {patient.procedure || <span className="text-slate-400 italic text-base font-normal">Pending</span>}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ─── TREATMENT + DATES ROW ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mb-3">

        {/* Treatment segmented control */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Treatment</p>
          <div className="flex gap-0.5 p-0.5 bg-slate-100 rounded-xl" style={{ height: 36 }}>
            <button
              onClick={() => canEdit && updatePatient({ ...patient, management: 'surgical_fixation' })}
              className={`flex-1 text-xs font-bold rounded-lg transition-all leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                (patient.management ?? 'surgical_fixation') === 'surgical_fixation'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Surgical
            </button>
            <button
              onClick={() => canEdit && updatePatient({ ...patient, management: 'conservative' })}
              className={`flex-1 text-xs font-bold rounded-lg transition-all leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                patient.management === 'conservative'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Conserv.
            </button>
          </div>
        </div>

        {/* Date chips */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-3 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Dates</p>
          <div className="flex gap-2">
            <button
              onClick={() => canEdit && setEditingDate('doa')}
              className="flex-1 flex flex-col px-2 py-1.5 bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-300 rounded-xl transition-colors text-left group"
            >
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-teal-600">DOA</span>
              <span className="text-[11px] font-semibold text-slate-800 leading-none mt-0.5">{formatDateChip(patient.doa)}</span>
            </button>
            <button
              onClick={() => canEdit && setEditingDate('dos')}
              className="flex-1 flex flex-col px-2 py-1.5 bg-slate-50 hover:bg-teal-50 border border-slate-200 hover:border-teal-300 rounded-xl transition-colors text-left group"
            >
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-teal-600">DOS</span>
              <span className="text-[11px] font-semibold text-slate-800 leading-none mt-0.5">{formatDateChip(patient.dos) || <span className="text-slate-300">Pending</span>}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── CONTACT CARD ──────────────────────────────────────────────── */}
      {patient.mobile && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-3 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Contact</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">{patient.mobile}</p>
              <p className="text-[11px] text-slate-400">Patient / Guardian</p>
            </div>
            <a
              href={`tel:${mobileNumber}`}
              className="flex items-center justify-center w-10 h-10 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors shrink-0"
              aria-label="Call"
            >
              <Phone className="w-4.5 h-4.5 text-teal-600" />
            </a>
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

      {/* ─── PAC STATUS CARD ───────────────────────────────────────────── */}
      <button
        onClick={() => navigateTo('pac')}
        className={`w-full text-left bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-3 mb-3 flex items-center gap-4 hover:border-slate-200 active:scale-[0.99] transition-all`}
      >
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl font-black border-2 ${pacBadge.bg} ${pacBadge.border} ${pacBadge.text} shrink-0`}>
          {pacBadge.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">PAC / Pre-Op Clearance</p>
          <p className={`text-base font-bold mt-0.5 ${pacBadge.text}`}>{patient.pacStatus}</p>
          {patient.pacChecklist && (
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              {Object.values(patient.pacChecklist).filter(Boolean).length} items completed
            </p>
          )}
        </div>
        <HeartPulse className="w-5 h-5 text-slate-300 shrink-0" />
      </button>

      {/* ─── COMORBIDITIES ─────────────────────────────────────────────── */}
      {patient.comorbidities.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-3 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Comorbidities</p>
          <div className="flex flex-wrap gap-1.5">
            {patient.comorbidities.map(c => (
              <span key={c} className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium">{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* ─── QUICK ACTIONS ─────────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1 scrollbar-hide">
        <button onClick={() => setShowScoring(true)} className="flex items-center gap-1.5 px-3 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-colors shrink-0 min-h-[44px]">
          <Calculator className="w-4 h-4" /><span>Scores</span>
        </button>
        <button onClick={() => setShowReferral(true)} className="flex items-center gap-1.5 px-3 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition-colors shrink-0 min-h-[44px]">
          <Send className="w-4 h-4" /><span>Refer</span>
        </button>
        <button onClick={() => navigateTo('rounds')} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-white rounded-xl shadow-sm border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-xs font-bold text-slate-700 whitespace-nowrap">
          <ClipboardCheck className="w-4 h-4 text-blue-500" /> Daily Rounds
        </button>
        <button onClick={() => navigateTo('labs', { id: patient.ipNo })} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-white rounded-xl shadow-sm border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-xs font-bold text-slate-700 whitespace-nowrap">
          <Droplet className="w-4 h-4 text-blue-500" /> Lab Trends
        </button>
        <button onClick={() => navigateTo('radiology', { id: patient.ipNo })} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-white rounded-xl shadow-sm border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-xs font-bold text-slate-700 whitespace-nowrap">
          <FileImage className="w-4 h-4 text-blue-500" /> Radiology
        </button>
        <button onClick={() => navigateTo('pac')} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-white rounded-xl shadow-sm border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-xs font-bold text-slate-700 whitespace-nowrap">
          <HeartPulse className="w-4 h-4 text-blue-500" /> PAC Status
        </button>
        <button onClick={() => setShowFhirExport(true)} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-teal-50 rounded-xl shadow-sm border border-teal-200 hover:bg-teal-100 transition-colors text-xs font-bold text-teal-700 whitespace-nowrap">
          <FileJson className="w-4 h-4 text-teal-600" /> FHIR
        </button>
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
          className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-slate-50 rounded-xl shadow-sm border border-slate-200 hover:bg-slate-100 transition-colors text-xs font-bold text-slate-600 whitespace-nowrap"
        >
          <Download className="w-4 h-4 text-slate-500" /> Export
        </button>
        {isAlreadyDischarged ? (
          <button onClick={() => navigateTo('discharge', { id: patient.ipNo })} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-teal-50 rounded-xl shadow-sm border border-teal-200 hover:bg-teal-100 transition-colors text-xs font-bold text-teal-700 whitespace-nowrap">
            <FileText className="w-4 h-4 text-teal-600" /> Discharge Summary
          </button>
        ) : canDischarge ? (
          <button onClick={() => setShowDischargeConfirm(true)} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-red-50 rounded-xl shadow-sm border border-red-200 hover:bg-red-100 transition-colors text-xs font-bold text-red-700 whitespace-nowrap">
            <LogOut className="w-4 h-4 text-red-500" /> Discharge
          </button>
        ) : null}
      </div>

      {/* ─── DELETE RECORD ─────────────────────────────────────────────── */}
      {canDelete && (
        <div className="flex justify-end mb-4">
          <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Delete Record
          </button>
        </div>
      )}

      {/* ─── OPTIONAL TABS (Medications / Nursing / I/O etc.) ──────────── */}
      {(showMedicationChart || showNursingNotes || showIntakeOutput || showBloodTransfusion || showWoundCare) && (
        <div role="tablist" className="flex gap-1 border-b border-slate-200 bg-white rounded-t-2xl px-2 pt-2 overflow-x-auto scrollbar-hide mb-0">
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
                    ? 'border-teal-500 text-teal-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
        </div>
      )}

      {/* Tab content */}
      {showMedicationChart && activeTab === 'medications' && (
        <div className="bg-white rounded-b-2xl shadow-sm border border-t-0 border-slate-200 p-5">
          <ErrorBoundary fallbackMessage="Medication chart failed to load.">
            <Suspense fallback={<div className="text-center py-8 text-slate-400 text-sm">Loading…</div>}>
              <MedicationChart patientIpNo={patient.ipNo} hospitalId={user?.hospitalId ?? ''} drugAllergies={patient.drugAllergies ?? []} />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
      {showNursingNotes && activeTab === 'nursing' && (
        <div className="bg-white rounded-b-2xl shadow-sm border border-t-0 border-slate-200 p-5">
          <ErrorBoundary fallbackMessage="Nursing notes failed to load.">
            <Suspense fallback={<div className="text-center py-8 text-slate-400 text-sm">Loading…</div>}>
              <NursingNotes patientIpNo={patient.ipNo} hospitalId={user?.hospitalId ?? ''} />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
      {showIntakeOutput && activeTab === 'io' && (
        <div className="bg-white rounded-b-2xl shadow-sm border border-t-0 border-slate-200 p-5">
          <ErrorBoundary fallbackMessage="Intake/Output chart failed to load.">
            <Suspense fallback={<div className="text-center py-8 text-slate-400 text-sm">Loading…</div>}>
              <IntakeOutput patientIpNo={patient.ipNo} />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
      {showBloodTransfusion && activeTab === 'transfusion' && (
        <div className="bg-white rounded-b-2xl shadow-sm border border-t-0 border-slate-200 p-5">
          <ErrorBoundary fallbackMessage="Blood transfusion records failed to load.">
            <Suspense fallback={<div className="text-center py-8 text-slate-400 text-sm">Loading…</div>}>
              <BloodTransfusion patientIpNo={patient.ipNo} />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
      {showWoundCare && activeTab === 'wound' && (
        <div className="bg-white rounded-b-2xl shadow-sm border border-t-0 border-slate-200 p-5">
          <ErrorBoundary fallbackMessage="Wound care records failed to load.">
            <Suspense fallback={<div className="text-center py-8 text-slate-400 text-sm">Loading…</div>}>
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
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mt-3">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-3 text-sm">
                <Activity className="w-4 h-4 text-teal-500" /> Lab Summary
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {activeLabTypes.map(lt => {
                  const data  = getLabTrend(patient.labResults, lt.name);
                  const isHigh = lt.alertHigh !== null && data.latest !== undefined && data.latest > lt.alertHigh;
                  return (
                    <div key={lt.name} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">{lt.name}</span>
                        <TrendIcon trend={data.trend} />
                      </div>
                      {data.latest !== undefined ? (
                        <>
                          <span className={`text-xl font-bold ${isHigh ? 'text-red-600' : 'text-slate-800'}`}>{data.latest}</span>
                          <span className="text-xs text-slate-400 ml-1">{lt.unit}</span>
                          {data.latestDate && <p className="text-xs text-slate-400 mt-0.5">{data.latestDate}</p>}
                        </>
                      ) : (
                        <span className="text-sm text-slate-400">No data</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active Orders */}
          {patient.todos.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mt-3">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-3 text-sm">
                <CheckSquare className="w-4 h-4 text-teal-500" /> Orders ({pendingTodos.length} pending)
              </h3>
              <div className="space-y-1.5">
                {pendingTodos.map(t => (
                  <div key={t.id} className="flex items-center gap-2 p-2 bg-amber-50 rounded-xl border border-amber-100">
                    <div className="w-2 h-2 bg-amber-400 rounded-full shrink-0" />
                    <span className="text-sm text-slate-700">{t.task}</span>
                  </div>
                ))}
                {completedTodos.map(t => (
                  <div key={t.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="w-2 h-2 bg-green-400 rounded-full shrink-0" />
                    <span className="text-sm text-slate-400 line-through">{t.task}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Imaging */}
          {patient.investigations.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mt-3">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-3 text-sm">
                <FileImage className="w-4 h-4 text-teal-500" /> Imaging ({patient.investigations.length})
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {patient.investigations.slice(0, 6).map(inv => (
                  <div key={inv.id} className="relative aspect-square bg-black rounded-xl overflow-hidden border border-slate-200">
                    <img src={inv.imageUrl} alt={inv.type} className="w-full h-full object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                      <p className="text-[10px] text-white font-bold">{inv.type}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rounds History */}
          {patient.dailyRounds.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mt-3">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-3 text-sm">
                <ClipboardCheck className="w-4 h-4 text-teal-500" /> Rounds History
              </h3>
              <div className="space-y-2">
                {patient.dailyRounds
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, 5)
                  .map(round => (
                    <div key={round.date} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-teal-600">{round.date}</span>
                        <span className="text-xs text-slate-400">{round.todos.filter(t => t.isDone).length}/{round.todos.length} done</span>
                      </div>
                      <p className="text-sm text-slate-700">{round.note || 'No note recorded'}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── DIALOGS ───────────────────────────────────────────────────── */}
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

      {/* Date bottom sheet */}
      {editingDate && (
        <DateBottomSheet
          label={editingDate === 'doa' ? 'Date of Admission' : 'Date of Surgery'}
          value={(editingDate === 'doa' ? patient.doa : patient.dos) ?? ''}
          onSave={val => updatePatient({ ...patient, [editingDate === 'doa' ? 'doa' : 'dos']: val || undefined })}
          onClose={() => setEditingDate(null)}
        />
      )}
    </div>
  );
};

export default PatientDetail;
