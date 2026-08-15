/**
 * EmergencyPatientView.tsx — read-only summary shown after a break-glass
 * (emergency access) lookup, see GlobalSearch.tsx for the entry point and
 * contexts/PatientContext.tsx's fetchEmergencyPatient for the audit-logged
 * fetch. Deliberately read-only: this is for a covering clinician looking
 * something up under time pressure, not a routine editing session. If real
 * edit-during-coverage need shows up, that's a follow-up, not something to
 * guess into scope here — the patient isn't merged into the app's normal
 * `patients` state at all, so there's no update/delete path wired to it.
 */
import React, { useRef, useEffect } from 'react';
import { AlertTriangle, X, Calendar, Activity, CheckSquare, ClipboardList } from 'lucide-react';
import { Patient } from '../types';
import { getStatusColor } from '../utils/calculations';

interface Props {
  patient: Patient;
  reason: string;
  onClose: () => void;
}

const EmergencyPatientView: React.FC<Props> = ({ patient, reason, onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const pendingTodos = patient.todos.filter(t => !t.isDone);
  const latestRound = [...patient.dailyRounds].sort((a, b) => b.date.localeCompare(a.date))[0];
  const recentLabs = [...patient.labResults]
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, 6);

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="emergency-view-title"
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg outline-none max-h-[85vh] flex flex-col"
      >
        {/* Header — amber, unmistakably distinct from a normal patient view */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-amber-200 bg-amber-50 rounded-t-2xl">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-700" />
          </div>
          <div className="min-w-0">
            <h3 id="emergency-view-title" className="font-bold text-amber-900">Emergency Access — Read Only</h3>
            <p className="text-xs text-amber-700 mt-0.5 truncate">
              Outside your unit ({patient.unit ?? 'unassigned'}) — logged with your stated reason
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded-full text-amber-600 hover:text-amber-800 hover:bg-amber-100 shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto text-sm">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Reason given</p>
            <p className="text-slate-700 mt-0.5">{reason}</p>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-bold text-slate-900 text-base">{patient.name}</h4>
              <p className="text-xs text-slate-500">
                {patient.age}y · {patient.gender} · IP {patient.ipNo} · Bed {patient.bed} · {patient.ward}
              </p>
            </div>
            <span className={`px-2 py-0.5 rounded text-xs font-medium border shrink-0 ${getStatusColor(patient.patientStatus)}`}>
              {patient.patientStatus}
            </span>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Diagnosis</p>
            <p className="text-slate-700 mt-0.5">{patient.diagnosis}</p>
            {patient.procedure && <p className="text-xs text-slate-500 mt-0.5">Procedure: {patient.procedure}</p>}
          </div>

          {patient.comorbidities.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Comorbidities</p>
              <div className="flex flex-wrap gap-1">
                {patient.comorbidities.map(c => (
                  <span key={c} className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 rounded-full text-[11px] font-medium">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {patient.drugAllergies && patient.drugAllergies.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <p className="text-xs font-bold text-rose-700 uppercase tracking-wide">Drug Allergies</p>
              <p className="text-rose-800 text-sm mt-0.5">{patient.drugAllergies.join(', ')}</p>
            </div>
          )}

          {latestRound && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Latest Round Note ({latestRound.date})
              </p>
              <p className="text-slate-700 mt-0.5 whitespace-pre-wrap">{latestRound.note || '—'}</p>
            </div>
          )}

          {recentLabs.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1 mb-1">
                <Activity className="w-3.5 h-3.5" /> Recent Labs
              </p>
              <div className="space-y-1">
                {recentLabs.map(l => (
                  <div key={`${l.type}-${l.date}`} className="flex justify-between text-xs text-slate-600 bg-slate-50 rounded px-2 py-1">
                    <span className="font-medium">{l.type}</span>
                    <span>{l.value} <span className="text-slate-400">({l.date})</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendingTodos.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1 mb-1">
                <CheckSquare className="w-3.5 h-3.5" /> Pending Orders / To-Do
              </p>
              <div className="space-y-1">
                {pendingTodos.map(t => (
                  <div key={t.id} className="flex items-center gap-2 text-xs text-slate-700 bg-slate-50 rounded px-2 py-1.5">
                    <ClipboardList className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {t.task}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmergencyPatientView;
