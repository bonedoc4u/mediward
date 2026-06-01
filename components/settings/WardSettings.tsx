import React, { useState } from 'react';
import { useConfig } from '../../contexts/AppContext';
import { WardConfig } from '../../types';
import { toast } from '../../utils/toast';
import { Plus, Pencil, Trash2, Save, X, BedDouble, Activity, ShieldAlert } from 'lucide-react';

// ─── Inline editable ward row ───
const WardRow: React.FC<{
  ward: WardConfig;
  wards: WardConfig[];
  unitOptions: string[];
  onSave: (w: WardConfig) => void;
  onDelete: (id: string) => void;
}> = ({ ward, wards, unitOptions, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ward);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (wards.some(w => w.name.toLowerCase() === draft.name.toLowerCase() && w.id !== draft.id)) {
      toast.error('A ward with this name already exists');
      return;
    }
    setBusy(true);
    try { await onSave(draft); setEditing(false); } finally { setBusy(false); }
  };

  if (!editing) {
    return (
      <tr className="border-b last:border-0 hover:bg-slate-50">
        <td className="px-4 py-3 font-medium text-slate-800">{ward.name}</td>
        <td className="px-4 py-3 text-center">
          {ward.unit?.length
            ? <div className="flex flex-wrap gap-1 justify-center">
                {ward.unit.map(u => (
                  <span key={u} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-bold rounded">{u}</span>
                ))}
              </div>
            : <span className="px-2 py-0.5 bg-slate-100 text-slate-400 text-xs rounded">Shared</span>}
        </td>
        <td className="px-4 py-3 text-center">{ward.sortOrder}</td>
        <td className="px-4 py-3 text-center">
          {ward.isIcu
            ? <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded">ICU</span>
            : <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded">General</span>}
        </td>
        <td className="px-4 py-3 text-center">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${ward.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {ward.active ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <button onClick={() => { setDraft(ward); setEditing(true); }}
              className="p-1.5 hover:bg-slate-200 rounded text-slate-500 hover:text-blue-600 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(ward.id)}
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
          className="w-full p-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap gap-1.5">
          {unitOptions.map(u => {
            const checked = draft.unit?.includes(u) ?? false;
            return (
              <label key={u} className={`flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer border text-xs font-semibold transition-colors ${checked ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => setDraft(d => {
                    const cur = d.unit ?? [];
                    const next = cur.includes(u) ? cur.filter(x => x !== u) : [...cur, u];
                    return { ...d, unit: next.length ? next : undefined };
                  })}
                />
                {u}
              </label>
            );
          })}
        </div>
      </td>
      <td className="px-4 py-2">
        <input type="number" value={draft.sortOrder} onChange={e => setDraft(d => ({ ...d, sortOrder: parseInt(e.target.value) || 0 }))}
          className="w-16 p-1 border border-blue-300 rounded text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </td>
      <td className="px-4 py-2 text-center">
        <input type="checkbox" checked={draft.isIcu} onChange={e => setDraft(d => ({ ...d, isIcu: e.target.checked }))}
          className="w-4 h-4 accent-red-600" />
        <label className="text-xs ml-1 text-slate-600">ICU</label>
      </td>
      <td className="px-4 py-2 text-center">
        <input type="checkbox" checked={draft.active} onChange={e => setDraft(d => ({ ...d, active: e.target.checked }))}
          className="w-4 h-4 accent-green-600" />
        <label className="text-xs ml-1 text-slate-600">Active</label>
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button onClick={handleSave} disabled={busy}
            className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50">
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

// ─── Ward Settings panel ───
const WardSettings: React.FC = () => {
  const { wards, unitOptions, addWard, saveWard, removeWard } = useConfig();

  const [newWardName, setNewWardName] = useState('');
  const [newWardIsIcu, setNewWardIsIcu] = useState(false);
  const [newWardUnit, setNewWardUnit] = useState<string[]>([]);
  const [addingWard, setAddingWard] = useState(false);

  const sortedWards = [...wards].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleAddWard = async () => {
    if (!newWardName.trim()) return;
    setAddingWard(true);
    try {
      await addWard(newWardName.trim(), newWardIsIcu, newWardUnit.length ? newWardUnit : undefined);
      setNewWardName('');
      setNewWardIsIcu(false);
      setNewWardUnit([]);
    } finally { setAddingWard(false); }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2">
          <BedDouble className="w-5 h-5 text-blue-600" />
          <h2 className="font-bold text-slate-800">Ward Configuration</h2>
          <span className="text-xs text-slate-500 ml-1">({wards.length} wards)</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">Ward Name</th>
              <th className="px-4 py-3 text-center">Unit</th>
              <th className="px-4 py-3 text-center">Order</th>
              <th className="px-4 py-3 text-center">Type</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedWards.map(ward => (
              <WardRow key={ward.id} ward={ward} wards={wards} unitOptions={unitOptions} onSave={saveWard} onDelete={removeWard} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center gap-2">
        <input value={newWardName} onChange={e => setNewWardName(e.target.value)}
          placeholder="New ward name, e.g. Ward 6"
          className="flex-1 min-w-40 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          onKeyDown={e => { if (e.key === 'Enter') handleAddWard(); }}
        />
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-slate-500 font-medium">Units:</span>
          {unitOptions.map(u => {
            const checked = newWardUnit.includes(u);
            return (
              <label key={u} className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer border text-xs font-semibold transition-colors ${checked ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}>
                <input type="checkbox" className="sr-only" checked={checked}
                  onChange={() => setNewWardUnit(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u])}
                />
                {u}
              </label>
            );
          })}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={newWardIsIcu} onChange={e => setNewWardIsIcu(e.target.checked)}
            className="w-4 h-4 accent-red-600" />
          <Activity className="w-3.5 h-3.5 text-red-500" />
          ICU
        </label>
        <button onClick={handleAddWard} disabled={addingWard || !newWardName.trim()}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
          <Plus className="w-4 h-4" /> Add Ward
        </button>
      </div>

      <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100 flex items-start gap-2 text-xs text-amber-800">
        <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
        Assign a unit to a ward so the patient's unit is auto-filled on admission. Leave as "Shared" for mixed wards like Ortho ICU.
      </div>
    </div>
  );
};

export default WardSettings;
