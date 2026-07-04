import React, { useState } from 'react';
import { useConfig } from '../../contexts/AppContext';
import { MedicationConfig } from '../../types';
import { Plus, Pencil, Trash2, Save, X, Pill, Activity, RefreshCw } from 'lucide-react';

const DRUG_FORMS = [
  'Tablet', 'Capsule', 'Syrup', 'Injection', 'Infusion',
  'Inhaler (MDI)', 'Inhaler (DPI)', 'Cream', 'Ointment', 'Drops',
  'Oral Drops', 'Solution', 'Powder', 'Sachet', 'Suspension',
  'Patch', 'Suppository',
];

// ─── Inline editable medication row ───
const MedRow: React.FC<{
  med: MedicationConfig;
  onSave: (m: MedicationConfig) => void;
  onDelete: (id: string) => void;
}> = ({ med, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(med);
  const [busy, setBusy] = useState(false);
  const handleSave = async () => {
    setBusy(true);
    try { await onSave(draft); setEditing(false); } finally { setBusy(false); }
  };

  if (!editing) return (
    <tr className="border-b last:border-0 hover:bg-slate-50 text-sm">
      <td className="px-3 py-2 font-medium text-slate-800">{med.name}</td>
      <td className="px-3 py-2 text-slate-500 text-xs">{med.brand || '—'}</td>
      <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-green-50 text-green-700 text-xs rounded">{med.form}</span></td>
      <td className="px-3 py-2 text-slate-600 text-xs">{med.strength || '—'}</td>
      <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded">{med.category}</span></td>
      <td className="px-3 py-2 text-center">
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${med.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          {med.active ? 'Active' : 'Off'}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => { setDraft(med); setEditing(true); }} className="p-1.5 hover:bg-slate-200 rounded text-slate-500 hover:text-teal-600"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => onDelete(med.id)} className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </td>
    </tr>
  );

  return (
    <tr className="border-b bg-green-50/40">
      <td className="px-3 py-2"><input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} className="w-full p-1 border border-green-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-400" /></td>
      <td className="px-3 py-2"><input value={draft.brand} onChange={e => setDraft(d => ({ ...d, brand: e.target.value }))} placeholder="Brand" className="w-full p-1 border border-green-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-400" /></td>
      <td className="px-3 py-2">
        <select value={draft.form} aria-label="Drug form" onChange={e => setDraft(d => ({ ...d, form: e.target.value }))} className="w-full p-1 border border-green-300 rounded text-xs focus:outline-none">
          {DRUG_FORMS.map(f => <option key={f}>{f}</option>)}
        </select>
      </td>
      <td className="px-3 py-2"><input value={draft.strength} onChange={e => setDraft(d => ({ ...d, strength: e.target.value }))} placeholder="500mg" className="w-full p-1 border border-green-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-400" /></td>
      <td className="px-3 py-2"><input value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))} className="w-full p-1 border border-green-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-400" /></td>
      <td className="px-3 py-2 text-center"><input type="checkbox" checked={draft.active} onChange={e => setDraft(d => ({ ...d, active: e.target.checked }))} className="w-4 h-4 accent-green-600" /></td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button onClick={handleSave} disabled={busy} aria-label="Save medication" className="p-1.5 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"><Save className="w-3.5 h-3.5" /></button>
          <button onClick={() => setEditing(false)} aria-label="Cancel editing" className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded"><X className="w-3.5 h-3.5" /></button>
        </div>
      </td>
    </tr>
  );
};

// ─── Medication Settings panel ───
const MedicationSettings: React.FC = () => {
  const { medications, addMedication, saveMedication, removeMedication, seedMedications } = useConfig();

  const [medSearch, setMedSearch] = useState('');
  const [medCategoryFilter, setMedCategoryFilter] = useState('All');
  const [addingMed, setAddingMed] = useState(false);
  const [seedingMeds, setSeedingMeds] = useState(false);
  const [newMed, setNewMed] = useState({ name: '', brand: '', category: '', form: 'Tablet', strength: '' });

  const medCategories = ['All', ...Array.from(new Set(medications.map(m => m.category))).sort()];
  const filteredMeds = medications.filter(m =>
    (medCategoryFilter === 'All' || m.category === medCategoryFilter) &&
    (m.name.toLowerCase().includes(medSearch.toLowerCase()) || m.brand.toLowerCase().includes(medSearch.toLowerCase()))
  );

  const handleAddMed = async () => {
    if (!newMed.name.trim() || !newMed.category.trim()) return;
    setAddingMed(true);
    try {
      await addMedication({ ...newMed, sortOrder: medications.length, active: true });
      setNewMed({ name: '', brand: '', category: newMed.category, form: 'Tablet', strength: '' });
    } finally { setAddingMed(false); }
  };

  const handleSeedMeds = async () => {
    setSeedingMeds(true);
    try { await seedMedications(); } finally { setSeedingMeds(false); }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50 flex-wrap">
        <Pill className="w-5 h-5 text-green-600" />
        <h2 className="font-bold text-slate-800">Medication List</h2>
        <span className="text-xs text-slate-500 ml-1">({medications.length} medications — used in Discharge Summary)</span>
        <div className="ml-auto flex items-center gap-2">
          {medications.length === 0 && (
            <button onClick={handleSeedMeds} disabled={seedingMeds}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${seedingMeds ? 'animate-spin' : ''}`} />
              {seedingMeds ? 'Loading…' : 'Load Indian Medication List'}
            </button>
          )}
        </div>
      </div>

      {medications.length > 0 && (
        <>
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-2 flex-1 min-w-48 border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50">
              <Activity className="w-3.5 h-3.5 text-slate-400" />
              <input value={medSearch} onChange={e => setMedSearch(e.target.value)}
                placeholder="Search medications…"
                className="flex-1 text-xs bg-transparent focus:outline-none text-slate-700" />
            </div>
            <select value={medCategoryFilter} aria-label="Filter medications by category" onChange={e => setMedCategoryFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
              {medCategories.map(c => <option key={c}>{c}</option>)}
            </select>
            <span className="text-xs text-slate-400">{filteredMeds.length} shown</span>
          </div>

          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="px-3 py-3">Generic Name</th>
                  <th className="px-3 py-3">Brand</th>
                  <th className="px-3 py-3">Form</th>
                  <th className="px-3 py-3">Strength</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3 text-center">Status</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMeds.map(med => (
                  <MedRow key={med.id} med={med} onSave={saveMedication} onDelete={removeMedication} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center gap-2">
        <input value={newMed.name} onChange={e => setNewMed(m => ({ ...m, name: e.target.value }))}
          placeholder="Generic name *" className="flex-1 min-w-36 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none" />
        <input value={newMed.brand} onChange={e => setNewMed(m => ({ ...m, brand: e.target.value }))}
          placeholder="Brand name" className="w-36 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none" />
        <select value={newMed.form} aria-label="Drug form" onChange={e => setNewMed(m => ({ ...m, form: e.target.value }))}
          className="w-32 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none">
          {DRUG_FORMS.map(f => <option key={f}>{f}</option>)}
        </select>
        <input value={newMed.strength} onChange={e => setNewMed(m => ({ ...m, strength: e.target.value }))}
          placeholder="Strength, e.g. 500mg" className="w-28 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none" />
        <input value={newMed.category} onChange={e => setNewMed(m => ({ ...m, category: e.target.value }))}
          placeholder="Category *" className="w-40 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none"
          onKeyDown={e => { if (e.key === 'Enter') handleAddMed(); }} />
        <button onClick={handleAddMed} disabled={addingMed || !newMed.name.trim() || !newMed.category.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      <div className="px-4 py-2.5 bg-green-50 border-t border-green-100 flex items-start gap-2 text-xs text-green-800">
        <Pill className="w-3.5 h-3.5 mt-0.5 shrink-0 text-green-600" />
        This list powers the medication search in Discharge Summary. Click "Load Indian Medication List" to seed 300+ pre-loaded medicines.
      </div>
    </div>
  );
};

export default MedicationSettings;
