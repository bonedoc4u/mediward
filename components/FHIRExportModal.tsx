import React, { useState, useCallback } from 'react';
import { Patient } from '../types';
import { patientToFhirBundle, parseFhirPatient, FhirBundleSummary } from '../services/fhirService';
import { X, Download, Copy, Check, ChevronDown, ChevronUp, Shield, FileJson, AlertTriangle } from 'lucide-react';

interface Props {
  patient: Patient;
  onClose: () => void;
}

const FHIRExportModal: React.FC<Props> = ({ patient, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [showJson, setShowJson] = useState(false);

  const { bundle, summary } = patientToFhirBundle(patient);
  const jsonString = JSON.stringify(bundle, null, 2);

  // Identify missing required FHIR fields
  const missingFields: string[] = [];
  if (!patient.abhaId) missingFields.push('ABHA ID');
  if (!patient.gender || !['male', 'female', 'other', 'unknown'].includes(patient.gender.toLowerCase())) missingFields.push('structured gender (male/female/other)');
  if (!patient.age) missingFields.push('age / date of birth');

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for environments without clipboard API
      const ta = document.createElement('textarea');
      ta.value = jsonString;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [jsonString]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([jsonString], { type: 'application/fhir+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FHIR_${patient.ipNo}_${patient.name.replace(/\s+/g, '_')}.fhir.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [jsonString, patient.ipNo, patient.name]);

  const ResourceCount = ({ label, count, color }: { label: string; count: number; color: string }) => (
    <div className={`flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100`}>
      <span className="text-xs text-slate-600 font-medium">{label}</span>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{count}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col">

        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-teal-700 to-teal-800 rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-2 text-white">
            <FileJson className="w-5 h-5" />
            <div>
              <h3 className="font-bold text-sm">FHIR R4 Export</h3>
              <p className="text-teal-200 text-xs">NDHM / Ayushman Bharat Profile</p>
            </div>
          </div>
          <button onClick={onClose} className="text-teal-200 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* FHIR completeness warning */}
          {missingFields.length > 0 && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800">Incomplete FHIR record</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Missing: <span className="font-medium">{missingFields.join(', ')}</span>.
                  {' '}Update the patient record to improve NDHM / ABDM interoperability.
                </p>
              </div>
            </div>
          )}

          {/* Patient identity */}
          <div className="bg-teal-50 rounded-lg border border-teal-100 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-slate-800 text-sm">{patient.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {patient.age}y / {patient.gender} &nbsp;·&nbsp; IP: <span className="font-mono font-semibold">{patient.ipNo}</span>
                </p>
              </div>
              {summary.hasAbhaId && (
                <div className="flex items-center gap-1 bg-teal-700 text-white text-[10px] font-bold px-2 py-1 rounded-full shrink-0">
                  <Shield className="w-3 h-3" />
                  ABHA Linked
                </div>
              )}
            </div>
            {patient.abhaId && (
              <div className="mt-2 pt-2 border-t border-teal-200">
                <span className="text-[10px] uppercase font-bold text-teal-600 tracking-wider">ABHA ID</span>
                <p className="font-mono text-sm font-semibold text-teal-900 tracking-widest mt-0.5">{patient.abhaId}</p>
              </div>
            )}
          </div>

          {/* Resource summary */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Bundle Contents</p>
            <div className="grid grid-cols-2 gap-2">
              <ResourceCount label="Conditions" count={summary.conditionCount} color="bg-blue-100 text-blue-700" />
              <ResourceCount label="Lab Observations" count={summary.observationCount} color="bg-violet-100 text-violet-700" />
              <ResourceCount label="Diagnostic Reports" count={summary.diagnosticReportCount} color="bg-orange-100 text-orange-700" />
              <ResourceCount label="Procedures" count={summary.procedureCount} color="bg-green-100 text-green-700" />
            </div>
            <div className="mt-2 flex gap-2">
              <div className={`flex-1 flex items-center gap-2 p-2.5 rounded-lg border ${summary.hasDischargeSummary ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
                <div className={`w-2 h-2 rounded-full ${summary.hasDischargeSummary ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                <span className={`text-xs font-medium ${summary.hasDischargeSummary ? 'text-emerald-700' : 'text-slate-400'}`}>
                  Discharge Summary
                </span>
              </div>
              <div className={`flex-1 flex items-center gap-2 p-2.5 rounded-lg border ${summary.hasAbhaId ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
                <div className={`w-2 h-2 rounded-full ${summary.hasAbhaId ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                <span className={`text-xs font-medium ${summary.hasAbhaId ? 'text-emerald-700' : 'text-slate-400'}`}>
                  ABHA ID
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleCopy}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold border transition-all ${
                copied
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy JSON'}
            </button>
            <button
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold bg-teal-700 hover:bg-teal-800 text-white transition-colors"
            >
              <Download className="w-4 h-4" />
              Download .json
            </button>
          </div>

          {/* JSON preview toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowJson(v => !v)}
              className="w-full flex items-center justify-between text-xs font-semibold text-slate-500 hover:text-slate-700 py-1 transition-colors"
            >
              <span>Preview JSON</span>
              {showJson ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showJson && (
              <pre className="mt-2 bg-slate-900 text-green-300 text-[10px] leading-relaxed rounded-lg p-4 overflow-auto max-h-64 font-mono whitespace-pre-wrap break-all">
                {jsonString}
              </pre>
            )}
          </div>

          <p className="text-[10px] text-slate-400 text-center leading-relaxed">
            FHIR R4 Document Bundle · NDHM Profile · HL7 v4.0.1<br />
            Compatible with Ayushman Bharat / ABHA Health Records
          </p>
        </div>
      </div>
    </div>
  );
};

export default FHIRExportModal;

/* ─── FHIR Import helper (re-exported for convenience) ─────────────────────── */
export { parseFhirPatient };
