import React, { useState } from 'react';
import { Plus, Trash2, RotateCcw, Save, AlertTriangle } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { DEFAULT_COMORBIDITY_MAP } from '../../hooks/useComorbidityPresets';
import { ComorbidityEntry } from '../../types';

const ComorbiditySettings: React.FC = () => {
  const { comorbidityMap, saveComorbidityMap } = useConfig();
  const effective = comorbidityMap.length > 0 ? comorbidityMap : DEFAULT_COMORBIDITY_MAP;

  const [draft, setDraft] = useState<ComorbidityEntry[]>(effective);
  const [shortInput, setShortInput] = useState('');
  const [fullInput, setFullInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const isDirty = JSON.stringify(draft) !== JSON.stringify(effective);

  const handleAdd = () => {
    const s = shortInput.trim();
    const f = fullInput.trim();
    if (!s || !f) { setAddError('Both short form and full name are required.'); return; }
    if (draft.some(e => e.short.toLowerCase() === s.toLowerCase())) {
      setAddError(`"${s}" already exists.`); return;
    }
    setDraft(prev => [...prev, { short: s, full: f }]);
    setShortInput('');
    setFullInput('');
    setAddError('');
  };

  const handleRemove = (short: string) => setDraft(prev => prev.filter(e => e.short !== short));

  const handleEdit = (short: string, field: 'short' | 'full', value: string) => {
    setDraft(prev => prev.map(e => e.short === short ? { ...e, [field]: value } : e));
  };

  const handleSave = async () => {
    setSaving(true);
    try { await saveComorbidityMap(draft); } finally { setSaving(false); }
  };

  const handleReset = () => setDraft(DEFAULT_COMORBIDITY_MAP);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-800">Comorbidity List</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Define abbreviations and their full clinical names. The short form is what's written on case sheets;
          the full name is what gets recorded in the patient file and read out by OCR.
        </p>
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase w-1/3">Short Form</th>
              <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase">Full Name</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {draft.map((entry) => (
              <tr key={entry.short} className="group hover:bg-slate-50 transition-colors">
                <td className="px-3 py-1.5">
                  <input
                    type="text"
                    value={entry.short}
                    onChange={e => handleEdit(entry.short, 'short', e.target.value)}
                    className="w-full px-2 py-1 border border-transparent rounded text-sm font-mono font-semibold text-slate-700 bg-transparent hover:border-slate-300 focus:border-teal-400 focus:bg-white outline-none"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="text"
                    value={entry.full}
                    onChange={e => handleEdit(entry.short, 'full', e.target.value)}
                    className="w-full px-2 py-1 border border-transparent rounded text-sm text-slate-700 bg-transparent hover:border-slate-300 focus:border-teal-400 focus:bg-white outline-none"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => handleRemove(entry.short)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition"
                    aria-label={`Remove ${entry.short}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {draft.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-slate-400">
                  No comorbidities configured. Add entries below or reset to defaults.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add row */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-500 uppercase">Add New Entry</p>
        <div className="flex gap-2 items-start">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Short form, e.g. HTN"
              value={shortInput}
              onChange={e => { setShortInput(e.target.value); setAddError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fullInput ? handleAdd() : document.getElementById('comorb-full-input')?.focus(); } }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>
          <div className="flex-[2]">
            <input
              id="comorb-full-input"
              type="text"
              placeholder="Full name, e.g. Hypertension"
              value={fullInput}
              onChange={e => { setFullInput(e.target.value); setAddError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!shortInput.trim() || !fullInput.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        {addError && (
          <p className="flex items-center gap-1 text-xs text-red-600">
            <AlertTriangle className="w-3.5 h-3.5" /> {addError}
          </p>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="flex items-center gap-1.5 px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default ComorbiditySettings;
