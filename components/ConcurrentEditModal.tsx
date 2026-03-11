import React from 'react';
import { GitMerge, Save, RefreshCw, X } from 'lucide-react';
import { ConcurrentEditConflict } from '../contexts/PatientContext';

interface Props {
  conflict: ConcurrentEditConflict;
  onResolve: (choice: 'local' | 'remote') => void;
}

/** Fields shown in the diff — label + accessor */
const DIFF_FIELDS: Array<{ label: string; key: keyof ConcurrentEditConflict['localPatient'] }> = [
  { label: 'Bed',       key: 'bed'           },
  { label: 'Ward',      key: 'ward'          },
  { label: 'Diagnosis', key: 'diagnosis'     },
  { label: 'Status',    key: 'patientStatus' },
  { label: 'PAC',       key: 'pacStatus'     },
  { label: 'Procedure', key: 'procedure'     },
  { label: 'DOS',       key: 'dos'           },
];

const ConcurrentEditModal: React.FC<Props> = ({ conflict, onResolve }) => {
  const { localPatient, remotePatient } = conflict;

  const changedFields = DIFF_FIELDS.filter(
    f => String(localPatient[f.key] ?? '') !== String(remotePatient[f.key] ?? ''),
  );

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ced-title"
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg outline-none"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <GitMerge className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 id="ced-title" className="font-bold text-slate-900">Conflicting Changes</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              <strong>{remotePatient.name}</strong> was saved by another user while you were editing.
            </p>
          </div>
        </div>

        {/* Diff table */}
        <div className="px-6 py-4 overflow-y-auto max-h-64">
          {changedFields.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">No field differences detected — timestamps diverged only.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="text-left pb-2 w-24">Field</th>
                  <th className="text-left pb-2">Your version</th>
                  <th className="text-left pb-2">Server version</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {changedFields.map(({ label, key }) => (
                  <tr key={key}>
                    <td className="py-1.5 font-medium text-slate-500 pr-2">{label}</td>
                    <td className="py-1.5 pr-2">
                      <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 rounded text-xs font-mono">
                        {String(localPatient[key] ?? '—')}
                      </span>
                    </td>
                    <td className="py-1.5">
                      <span className="px-1.5 py-0.5 bg-blue-50 text-blue-800 rounded text-xs font-mono">
                        {String(remotePatient[key] ?? '—')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 pt-2 flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => onResolve('remote')}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-slate-300 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-colors text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Use server version
          </button>
          <button
            onClick={() => onResolve('local')}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            <Save className="w-4 h-4" />
            Force-save my version
          </button>
        </div>

        <button
          onClick={() => onResolve('remote')}
          className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          aria-label="Dismiss — keep server version"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default ConcurrentEditModal;
