import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';

interface Props {
  onAccept: () => void;
}

const STORAGE_KEY = 'mediward_disclaimer_accepted';

export function hasAcceptedDisclaimer(): boolean {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function markDisclaimerAccepted(): void {
  localStorage.setItem(STORAGE_KEY, 'true');
}

const ClinicalDisclaimer: React.FC<Props> = ({ onAccept }) => {
  const [checked, setChecked] = useState(false);

  const handleAccept = () => {
    markDisclaimerAccepted();
    onAccept();
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90svh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 bg-amber-50 border-b border-amber-200 flex items-start gap-3">
          <div className="bg-amber-100 p-2 rounded-lg shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 text-lg leading-tight">Clinical Decision Support — Disclaimer</h2>
            <p className="text-xs text-amber-700 mt-0.5">Please read before proceeding</p>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4 text-sm text-slate-700">
          <p>
            <strong>MediWard</strong> is a clinical workflow and documentation aid. It is designed to support — not
            replace — the professional judgement of licensed healthcare practitioners.
          </p>

          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-xs space-y-1">
            <p className="font-semibold">This software does NOT:</p>
            <ul className="list-disc list-inside space-y-0.5 pl-1">
              <li>Provide medical diagnoses or treatment recommendations</li>
              <li>Replace consultation with a qualified clinician</li>
              <li>Guarantee accuracy of displayed clinical data</li>
              <li>Serve as a regulatory-approved medical device (unless explicitly certified)</li>
            </ul>
          </div>

          <p>
            All clinical decisions — including prescriptions, procedures, discharge, and emergency responses — remain
            the sole responsibility of the attending clinician.
          </p>

          <div className="space-y-2">
            <p className="font-semibold text-slate-800">Data & Privacy</p>
            <p>
              Patient data is stored in a secure cloud database and is subject to applicable data protection laws
              (including the DPDP Act, 2023 for Indian deployments). Your institution is the data controller.
              Do not enter identifiable patient information unless your institution has authorised use of this system.
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-slate-800">Limitation of Liability</p>
            <p>
              The developers and operators of MediWard shall not be liable for any clinical outcome, adverse event,
              or patient harm arising from reliance on information displayed within this application.
            </p>
          </div>

          <p className="text-xs text-slate-400">
            By continuing, you acknowledge that you are a licensed healthcare professional authorised by your
            institution to access this system.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 space-y-3">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={e => setChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-blue-600 shrink-0"
            />
            <span className="text-sm text-slate-700">
              I have read and understood this disclaimer. I am a licensed healthcare professional authorised
              to use this system.
            </span>
          </label>
          <button
            disabled={!checked}
            onClick={handleAccept}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all
              disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed
              enabled:bg-blue-600 enabled:hover:bg-blue-700 enabled:text-white"
          >
            <ShieldCheck className="w-4 h-4" />
            Accept &amp; Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClinicalDisclaimer;
