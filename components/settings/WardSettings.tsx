import React, { useState, useMemo } from 'react';
import { useConfig } from '../../contexts/AppContext';
import { WardConfig } from '../../types';
import { toast } from '../../utils/toast';
import {
  Plus, Pencil, Trash2, Save, X, BedDouble, Activity,
  ShieldAlert, ChevronDown, ChevronUp, Info,
} from 'lucide-react';

// ─── Unit Assignment Card ─────────────────────────────────────────────────────
// Shows one unit with its assigned wards. Admin clicks ward chips to remove,
// or taps "+ Ward" to assign a new ward to this unit.
const UnitCard: React.FC<{
  unit: string;
  wards: WardConfig[];
  icuWards: WardConfig[];
  onToggleWard: (wardId: string, unitName: string) => Promise<void>;
}> = ({ unit, wards, icuWards, onToggleWard }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Wards explicitly assigned to this unit
  const assigned = wards.filter(w => !w.isIcu && w.unit?.includes(unit));
  // General wards not yet assigned to this unit
  const unassigned = wards.filter(w => !w.isIcu && !w.unit?.includes(unit) && w.active);

  const toggle = async (wardId: string) => {
    setBusy(wardId);
    try { await onToggleWard(wardId, unit); }
    finally { setBusy(null); setShowAdd(false); }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Unit header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border-b border-indigo-100">
        <span className="w-12 h-8 flex items-center justify-center bg-indigo-600 text-white text-xs font-black rounded-lg shrink-0">
          {unit}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-indigo-900">{assigned.length} ward{assigned.length !== 1 ? 's' : ''} assigned</p>
          <p className="text-xs text-indigo-600">+ Ortho ICU (shared by all units)</p>
        </div>
      </div>

      {/* Assigned wards */}
      <div className="p-3 flex flex-wrap gap-2 min-h-[48px]">
        {assigned.length === 0 && !showAdd && (
          <span className="text-xs text-slate-400 italic self-center">No wards assigned yet.</span>
        )}
        {assigned.map(w => (
          <button
            key={w.id}
            onClick={() => toggle(w.id)}
            disabled={busy === w.id}
            title="Click to remove this ward from the unit"
            className="flex items-center gap-1 px-2.5 py-1 bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-full text-xs font-semibold hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors disabled:opacity-50"
          >
            {w.name}
            <X className="w-3 h-3 shrink-0 opacity-60" />
          </button>
        ))}

        {/* ICU wards shown as auto-included (non-removable) */}
        {icuWards.map(w => (
          <span key={w.id} className="flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-semibold opacity-75" title="Shared ICU — visible to all units">
            <Activity className="w-3 h-3 shrink-0" /> {w.name}
          </span>
        ))}

        {/* Add ward button */}
        {!showAdd && unassigned.length > 0 && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 px-2.5 py-1 border border-dashed border-slate-300 text-slate-500 rounded-full text-xs hover:border-indigo-400 hover:text-indigo-600 transition-colors"
          >
            <Plus className="w-3 h-3" /> Add Ward
          </button>
        )}
      </div>

      {/* Unassigned ward picker */}
      {showAdd && (
        <div className="px-3 pb-3">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Select wards to assign to {unit}:</p>
          <div className="flex flex-wrap gap-1.5">
            {unassigned.map(w => (
              <button
                key={w.id}
                onClick={() => toggle(w.id)}
                disabled={busy === w.id}
                className="px-2.5 py-1 bg-white border border-slate-300 text-slate-700 rounded-full text-xs font-semibold hover:bg-indigo-600 hover:text-white hover:border-indigo-700 transition-colors disabled:opacity-50"
              >
                {w.name}
              </button>
            ))}
            <button onClick={() => setShowAdd(false)} className="px-2.5 py-1 text-xs text-slate-400 hover:text-red-500 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Inline editable ward row ───────────────────────────────────────────────
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
          {ward.isIcu
            ? <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded">All units</span>
            : ward.unit?.length
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
              className="p-1.5 hover:bg-slate-200 rounded text-slate-500 hover:text-teal-600 transition-colors">
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
          className="w-full p-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-teal-400" />
      </td>
      <td className="px-4 py-2">
        {draft.isIcu
          ? <span className="text-xs text-red-600 font-semibold">Visible to all units</span>
          : <div className="flex flex-wrap gap-1.5">
              {unitOptions.map(u => {
                const checked = draft.unit?.includes(u) ?? false;
                return (
                  <label key={u} className={`flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer border text-xs font-semibold transition-colors ${checked ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}>
                    <input type="checkbox" className="sr-only" checked={checked}
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
            </div>}
      </td>
      <td className="px-4 py-2">
        <input type="number" value={draft.sortOrder} onChange={e => setDraft(d => ({ ...d, sortOrder: parseInt(e.target.value) || 0 }))}
          className="w-16 p-1 border border-blue-300 rounded text-sm text-center focus:outline-none focus:ring-1 focus:ring-teal-400" />
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

// ─── Ward Settings panel ─────────────────────────────────────────────────────
const WardSettings: React.FC = () => {
  const { wards, unitOptions, addWard, saveWard, removeWard } = useConfig();

  const [newWardName, setNewWardName]     = useState('');
  const [newWardIsIcu, setNewWardIsIcu]   = useState(false);
  const [newWardUnit, setNewWardUnit]     = useState<string[]>([]);
  const [addingWard, setAddingWard]       = useState(false);
  const [showWardTable, setShowWardTable] = useState(false);

  const sortedWards = useMemo(() => [...wards].sort((a, b) => a.sortOrder - b.sortOrder), [wards]);
  const icuWards    = useMemo(() => sortedWards.filter(w => w.isIcu && w.active), [sortedWards]);
  const generalWards = useMemo(() => sortedWards.filter(w => !w.isIcu), [sortedWards]);

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

  // Toggle a ward's unit assignment — used by UnitCard
  const handleToggleWard = async (wardId: string, unitName: string) => {
    const ward = wards.find(w => w.id === wardId);
    if (!ward) return;
    const cur  = ward.unit ?? [];
    const next = cur.includes(unitName) ? cur.filter(u => u !== unitName) : [...cur, unitName];
    await saveWard({ ...ward, unit: next.length ? next : undefined });
  };

  return (
    <div className="space-y-4">

      {/* ── How units access wards info banner ─────────────────────────── */}
      <div className="flex items-start gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
        <div className="space-y-0.5">
          <p className="font-semibold text-blue-900">How ward access works</p>
          <p>Each unit doctor sees <strong>only their assigned wards</strong> + all <strong>ICU wards</strong> (shared by everyone).</p>
          <p>Multiple units can share the same ward (e.g. Ward 24 → OR1 + OR2). Add new units in <strong>Admin Settings → Hospital</strong>.</p>
        </div>
      </div>

      {/* ── Unit → Ward assignment cards ──────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
          <BedDouble className="w-5 h-5 text-indigo-600" />
          <h2 className="font-bold text-slate-800">Unit — Ward Assignment</h2>
          <span className="text-xs text-slate-500 ml-1">Which wards each unit can access</span>
        </div>

        {unitOptions.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            No units defined yet. Add units in Admin Settings → Hospital tab first.
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {unitOptions.map(unit => (
              <UnitCard
                key={unit}
                unit={unit}
                wards={generalWards}
                icuWards={icuWards}
                onToggleWard={handleToggleWard}
              />
            ))}
          </div>
        )}

        {/* ICU wards shared by all */}
        {icuWards.length > 0 && (
          <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Shared ICU (all units):</span>
            {icuWards.map(w => (
              <span key={w.id} className="flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-semibold">
                <Activity className="w-3 h-3" /> {w.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Add New Ward ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
          <Plus className="w-5 h-5 text-green-600" />
          <h2 className="font-bold text-slate-800">Add New Ward</h2>
        </div>
        <div className="px-4 py-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-40">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Ward Name</label>
            <input
              value={newWardName}
              onChange={e => setNewWardName(e.target.value)}
              placeholder="e.g. Ward 42"
              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              onKeyDown={e => { if (e.key === 'Enter') handleAddWard(); }}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Assign to Units</label>
            <div className="flex flex-wrap gap-1.5">
              {unitOptions.map(u => {
                const checked = newWardUnit.includes(u);
                return (
                  <label key={u} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg cursor-pointer border text-xs font-semibold transition-colors ${checked ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}>
                    <input type="checkbox" className="sr-only" checked={checked}
                      onChange={() => setNewWardUnit(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u])}
                    />
                    {u}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Type</label>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
              <input type="checkbox" checked={newWardIsIcu} onChange={e => setNewWardIsIcu(e.target.checked)}
                className="w-4 h-4 accent-red-600" />
              <Activity className="w-3.5 h-3.5 text-red-500" />
              ICU / Shared by all units
            </label>
          </div>

          <button
            onClick={handleAddWard}
            disabled={addingWard || !newWardName.trim()}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> {addingWard ? 'Adding…' : 'Add Ward'}
          </button>
        </div>
      </div>

      {/* ── Detailed Ward Table (collapsible) ─────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <button
          onClick={() => setShowWardTable(v => !v)}
          className="w-full px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <BedDouble className="w-5 h-5 text-slate-500" />
            <h2 className="font-bold text-slate-800">All Wards</h2>
            <span className="text-xs text-slate-500">({wards.length} total)</span>
          </div>
          {showWardTable
            ? <ChevronUp className="w-4 h-4 text-slate-500" />
            : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>

        {showWardTable && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Ward Name</th>
                  <th className="px-4 py-3 text-center">Access</th>
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
        )}

        {showWardTable && (
          <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100 flex items-start gap-2 text-xs text-amber-800">
            <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
            ICU-type wards are automatically visible to all units. Leave unit blank on a ward to make it shared (all units see it).
          </div>
        )}
      </div>

    </div>
  );
};

export default WardSettings;
