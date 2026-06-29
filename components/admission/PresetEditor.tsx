import React, { useState } from 'react';
import { X, RotateCcw, Plus, Save } from 'lucide-react';
import { DEFAULT_COMORBIDITY_PRESETS } from '../../hooks/useComorbidityPresets';

interface Props {
  presets: string[];
  onSave: (updated: string[]) => void;
  onClose: () => void;
  prefill?: string;
}

const PresetEditor: React.FC<Props> = ({ presets, onSave, onClose, prefill = '' }) => {
  const [draft, setDraft] = useState<string[]>(presets);
  const [input, setInput] = useState(prefill);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(presets);

  const addTerm = () => {
    const term = input.trim();
    if (!term || draft.includes(term)) { setInput(''); return; }
    setDraft(prev => [...prev, term]);
    setInput('');
  };

  const removeTerm = (term: string) => setDraft(prev => prev.filter(p => p !== term));

  const reset = () => setDraft(DEFAULT_COMORBIDITY_PRESETS);

  const isDefault = (term: string) => DEFAULT_COMORBIDITY_PRESETS.includes(term);

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
            <p className="text-xs text-slate-500 mt-0.5">Customise the quick-add chip list for all admissions</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preset chips */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap gap-2">
            {draft.map(term => (
              <span
                key={term}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  isDefault(term)
                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                    : 'bg-teal-50 text-teal-700 border-teal-200'
                }`}
              >
                {term}
                <button
                  type="button"
                  onClick={() => removeTerm(term)}
                  aria-label={`Remove ${term}`}
                  className="hover:bg-black/10 rounded-full p-0.5 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-3">
            Default presets (grey) · Custom presets (teal) · Removed presets won't show in the picker
          </p>
        </div>

        {/* Add input */}
        <div className="px-5 pb-3 shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add custom preset (e.g. IHD, GERD)…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTerm(); } }}
              className="flex-1 text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
            />
            <button
              type="button"
              onClick={addTerm}
              disabled={!input.trim()}
              className="flex items-center gap-1 px-3 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-5 pt-2 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
          >
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
