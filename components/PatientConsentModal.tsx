/**
 * PatientConsentModal.tsx
 * DPDP Act 2023 (India) — Informed consent capture before patient record creation.
 * Displays purpose of data collection, data categories, and retention period.
 * Consent timestamp + version stored on the patient record.
 */
import React, { useRef, useEffect } from 'react';
import { ShieldCheck, X, FileText } from 'lucide-react';

export const CONSENT_VERSION = 'v1.0';

interface Props {
  patientName: string;
  onAccept: () => void;
  onCancel: () => void;
}

const PatientConsentModal: React.FC<Props> = ({ patientName, onAccept, onCancel }) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    el.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
      if (e.key !== 'Tab') return;
      const focusable = el.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) { e.preventDefault(); return; }
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md outline-none"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 id="consent-title" className="font-bold text-slate-900">Patient Data Consent</h3>
            <p className="text-xs text-slate-500 mt-0.5">Required before creating a patient record</p>
          </div>
          <button
            onClick={onCancel}
            className="ml-auto p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            aria-label="Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Consent body */}
        <div className="px-6 py-4 space-y-3 text-sm text-slate-600 leading-relaxed overflow-y-auto max-h-72">
          <p>
            You are about to create a medical record for{' '}
            <strong className="text-slate-800">{patientName || 'this patient'}</strong>.
            Under the <strong>Digital Personal Data Protection Act, 2023 (India)</strong>,
            informed consent must be obtained before processing personal health data.
          </p>

          <div className="bg-slate-50 rounded-lg p-3 space-y-2">
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-slate-700 text-xs uppercase tracking-wide mb-1">Data collected</p>
                <p className="text-xs">Name, age, gender, contact number, diagnosis, medications, investigation results, clinical notes, and operative details.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-slate-700 text-xs uppercase tracking-wide mb-1">Purpose</p>
                <p className="text-xs">In-patient clinical management, treatment planning, discharge documentation, and medico-legal records.</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-slate-700 text-xs uppercase tracking-wide mb-1">Retention</p>
                <p className="text-xs">Records retained for a minimum of 7 years per MCI/NMC guidelines. Patient or guardian may request erasure after this period.</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            By proceeding, you confirm that the patient or their authorised guardian has given verbal or written consent for data collection and processing as described above. Consent version: <span className="font-mono">{CONSENT_VERSION}</span>.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-slate-300 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            Consent obtained — proceed
          </button>
        </div>
      </div>
    </div>
  );
};

export default PatientConsentModal;
