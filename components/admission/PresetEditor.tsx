import React, { useState } from 'react';
import { X, RotateCcw, Plus, Save } from 'lucide-react';
import { DEFAULT_COMORBIDITY_MAP } from '../../hooks/useComorbidityPresets';
import { ComorbidityEntry } from '../../types';

interface Props {
  presets: ComorbidityEntry[];
  onSave: (updated: ComorbidityEntry[]) => void;
  onClose: () => void;
  /** Pre-fill the short-form input (used when adding an unrecognised OCR term). */
  prefill?: string;
}

const PresetEditor: React.FC<Props> = ({ presets, onSave, onClose, prefill = '' }) => {
  const [draft, setDraft] = useState<ComorbidityEntry[]>(presets);
  const [shortInput, setShortInput] = useState(prefill);
  const [fullInput, setFullInput] = useState('');
  const isDirty = JSON.stringify(draft) !== JSON.stringify(presets);

  const addEntry = () => {
    const s = shortInput.trim();
    const f = fullInput.trim();
    if (!s || !f) return;
    if (draft.some(e => e.short === s)) { setShortInput(''); setFullInput(''); return; }
    setDraft(prev => [...prev, { short: s, full: f }]);
    setShortInput('');
    setFullInput('');
  };

  const removeEntry = (short: string) => setDraft(prev => prev.filter(e => e.short !== short));

  const isDefault = (short: string) => DEFAULT_COMORBIDITY_MAP.some(e => e.short === short);

  return (
    <div className="fixed inset-0 bg-black/60 z-[90] flex items-end sm:items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit Comorbidity Presets"
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[80svh] flex flex-col outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="font-bold text-slate-800">Comorbidity Presets</h3>
            <p className="text-xs text-slate-500 mt-0.5">Short form → Full name shown to patients &amp; in records</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chips list */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {draft.map(entry => (
              <span
                key={entry.short}
                title={entry.full}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  isDefault(entry.short)
                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                    : 'bg-teal-50 text-teal-700 border-teal-200'
                }`}
              >
                <span className="font-mono">{entry.short}</span>
                {entry.short !== entry.full && (
                  <span className="text-[10px] opacity-60 font-normal">→ {entry.full}</span>
                )}
                <button
                  type="button"
                  onClick={() => removeEntry(entry.short)}
                  aria-label={`Remove ${entry.short}`}
                  className="hover:bg-black/10 rounded-full p-0.5 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-3">
            Default (grey) · Custom (teal) · Hover chip to see full name
          </p>
        </div>

        {/* Add input */}
        <div className="px-5 pb-3 shrink-0 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Short form (e.g. IHD)"
              value={shortInput}
              onChange={e => setShortInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('preset-full-input')?.focus(); } }}
              className="flex-1 text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none font-mono"
            />
            <input
              id="preset-full-input"
              type="text"
              placeholder="Full name (e.g. Ischaemic Heart Disease)"
              value={fullInput}
              onChange={e => setFullInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEntry(); } }}
              className="flex-[2] text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
            />
            <button
              type="button"
              onClick={addEntry}
              disabled={!shortInput.trim() || !fullInput.trim()}
              className="flex items-center gap-1 px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-5 pt-2 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_COMORBIDITY_MAP)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
          </button>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            disabled={!isDirty}
            onClick={() => { onSave(draft); onClose(); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg"
          >
            <Save className="w-4 h-4" /> Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default PresetEditor;
