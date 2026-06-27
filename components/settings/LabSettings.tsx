import React, { useState } from 'react';
import { useConfig } from '../../contexts/AppContext';
import { LabTypeConfig } from '../../types';
import { toast } from '../../utils/toast';
import { Plus, Pencil, Trash2, Save, X, FlaskConical, ShieldAlert } from 'lucide-react';

// ─── Inline editable lab type row ───
const LabRow: React.FC<{
  lab: LabTypeConfig;
  labTypes: LabTypeConfig[];
  onSave: (l: LabTypeConfig) => void;
  onDelete: (id: string) => void;
}> = ({ lab, labTypes, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lab);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (labTypes.some(l => l.name.toLowerCase() === draft.name.toLowerCase() && l.id !== draft.id)) {
      toast.error('A lab type with this name already exists');
      return;
    }
    setBusy(true);
    try { await onSave(draft); setEditing(false); } finally { setBusy(false); }
  };

  if (!editing) {
    return (
      <tr className="border-b last:border-0 hover:bg-slate-50">
        <td className="px-4 py-3 font-medium text-slate-800">{lab.name}</td>
        <td className="px-4 py-3 text-slate-600">{lab.unit || '—'}</td>
        <td className="px-4 py-3 text-slate-600">
          {lab.alertHigh !== null
            ? <span className="text-red-600 font-medium">&gt; {lab.alertHigh}</span>
            : <span className="text-slate-400">None</span>}
        </td>
        <td className="px-4 py-3">
          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">{lab.category}</span>
        </td>
        <td className="px-4 py-3 text-center">{lab.sortOrder}</td>
        <td className="px-4 py-3 text-center">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${lab.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {lab.active ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <button onClick={() => { setDraft(lab); setEditing(true); }}
              className="p-1.5 hover:bg-slate-200 rounded text-slate-500 hover:text-teal-600 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(lab.id)}
              className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-600 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b bg-blue-50/40">
      <td className="px-4 py-2">
        <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          className="w-full p-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-teal-400" />
      </td>
      <td className="px-4 py-2">
        <input value={draft.unit} onChange={e => setDraft(d => ({ ...d, unit: e.target.value }))}
          className="w-full p-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-teal-400" />
      </td>
      <td className="px-4 py-2">
        <input type="number" value={draft.alertHigh ?? ''}
          onChange={e => setDraft(d => ({ ...d, alertHigh: e.target.value ? parseFloat(e.target.value) : null }))}
          className="w-full p-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-teal-400" />
      </td>
      <td className="px-4 py-2">
        <input value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
          className="w-full p-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-teal-400" />
      </td>
      <td className="px-4 py-2">
        <input type="number" value={draft.sortOrder}
          onChange={e => setDraft(d => ({ ...d, sortOrder: parseInt(e.target.value) || 0 }))}
          className="w-16 p-1 border border-blue-300 rounded text-sm text-center focus:outline-none focus:ring-1 focus:ring-teal-400" />
      </td>
      <td className="px-4 py-2 text-center">
        <input type="checkbox" checked={draft.active} onChange={e => setDraft(d => ({ ...d, active: e.target.checked }))}
          className="w-4 h-4 accent-green-600" />
        <label className="text-xs ml-1 text-slate-600">Active</label>
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button onClick={handleSave} disabled={busy}
            className="p-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded transition-colors disabled:opacity-50">
            <Save className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setEditing(false)}
            className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
};

// ─── Lab Settings panel ───
const LabSettings: React.FC = () => {
  const { labTypes, addLabType, saveLabType, removeLabType } = useConfig();

  const [newLabName, setNewLabName] = useState('');
  const [newLabUnit, setNewLabUnit] = useState('');
  const [newLabAlertHigh, setNewLabAlertHigh] = useState('');
  const [newLabCategory, setNewLabCategory] = useState('');
  const [addingLab, setAddingLab] = useState(false);

  const sortedLabs = [...labTypes].sort((a, b) => a.category.localeCompare(b.category) || a.sortOrder - b.sortOrder);

  const handleAddLab = async () => {
    if (!newLabName.trim() || !newLabCategory.trim()) return;
    setAddingLab(true);
    try {
      await addLabType(
        newLabName.trim(),
        newLabUnit.trim(),
        newLabAlertHigh ? parseFloat(newLabAlertHigh) : null,
        newLabCategory.trim(),
      );
      setNewLabName('');
      setNewLabUnit('');
      setNewLabAlertHigh('');
      setNewLabCategory('');
    } finally { setAddingLab(false); }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
        <FlaskConical className="w-5 h-5 text-orange-500" />
        <h2 className="font-bold text-slate-800">Lab Type Configuration</h2>
        <span className="text-xs text-slate-500 ml-1">({labTypes.length} tests)</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">Test Name</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Alert Threshold</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-center">Order</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedLabs.map(lab => (
              <LabRow key={lab.id} lab={lab} labTypes={labTypes} onSave={saveLabType} onDelete={removeLabType} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center gap-2">
        <input value={newLabName} onChange={e => setNewLabName(e.target.value)}
          placeholder="Test name, e.g. Haemoglobin"
          className="flex-1 min-w-36 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
        <input value={newLabUnit} onChange={e => setNewLabUnit(e.target.value)}
          placeholder="Unit, e.g. g/dL"
          className="w-28 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
        <input type="number" value={newLabAlertHigh} onChange={e => setNewLabAlertHigh(e.target.value)}
          placeholder="Alert > (optional)"
          className="w-32 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
        <input value={newLabCategory} onChange={e => setNewLabCategory(e.target.value)}
          placeholder="Category, e.g. Haematology"
          className="w-40 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none"
          onKeyDown={e => { if (e.key === 'Enter') handleAddLab(); }}
        />
        <button onClick={handleAddLab} disabled={addingLab || !newLabName.trim() || !newLabCategory.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
          <Plus className="w-4 h-4" /> Add Test
        </button>
      </div>

      <div className="px-4 py-2.5 bg-blue-50 border-t border-blue-100 flex items-start gap-2 text-xs text-blue-800">
        <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-teal-600" />
        New lab types appear immediately in Lab Trends and Patient Detail. The alert threshold highlights values in red when exceeded.
      </div>
    </div>
  );
};

export default LabSettings;
