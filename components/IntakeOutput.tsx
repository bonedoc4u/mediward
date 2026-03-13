/**
 * IntakeOutput.tsx
 * Fluid balance (intake / output) documentation for a patient.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Droplets, Plus, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuth } from '../contexts/AppContext';
import { IntakeOutputEntry, IOType } from '../types';
import { fetchIntakeOutput, addIntakeOutputEntry, deleteIntakeOutputEntry } from '../services/intakeOutputService';
import { toast } from '../utils/toast';

const INTAKE_CATEGORIES = ['Oral Fluids', 'IV Fluids', 'Blood Products', 'NG/PEG Feed', 'Medications'];
const OUTPUT_CATEGORIES = ['Urine', 'Drain', 'Nasogastric', 'Stool', 'Vomitus', 'Blood Loss'];

const today = () => new Date().toISOString().slice(0, 10);

interface Props {
  patientIpNo: string;
}

const IntakeOutput: React.FC<Props> = ({ patientIpNo }) => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<IntakeOutputEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    type: 'intake' as IOType,
    category: INTAKE_CATEGORIES[0],
    amountMl: '',
    recordedAt: `${today()}T${new Date().toTimeString().slice(0, 5)}`,
    notes: '',
  });

  useEffect(() => {
    fetchIntakeOutput(patientIpNo)
      .then(setEntries)
      .catch(() => toast.error('Failed to load fluid balance'))
      .finally(() => setLoading(false));
  }, [patientIpNo]);

  // Reset category when type changes
  const handleTypeChange = (type: IOType) => {
    setForm(f => ({
      ...f,
      type,
      category: type === 'intake' ? INTAKE_CATEGORIES[0] : OUTPUT_CATEGORIES[0],
    }));
  };

  const handleAdd = async () => {
    const ml = parseInt(form.amountMl, 10);
    if (!ml || ml <= 0) { toast.error('Enter a valid amount'); return; }
    setSaving(true);
    try {
      const created = await addIntakeOutputEntry(patientIpNo, {
        type:       form.type,
        category:   form.category,
        amountMl:   ml,
        recordedAt: new Date(form.recordedAt).toISOString(),
        recordedBy: user?.name ?? user?.email,
        notes:      form.notes.trim() || undefined,
      });
      setEntries(prev => [created, ...prev]);
      setForm(f => ({ ...f, amountMl: '', notes: '' }));
      setShowAdd(false);
      toast.success('Entry added');
    } catch {
      toast.error('Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteIntakeOutputEntry(id);
      setEntries(prev => prev.filter(e => e.id !== id));
      toast.success('Entry removed');
    } catch {
      toast.error('Failed to remove entry');
    }
  };

  // Group by date and compute balance per day
  const grouped = useMemo(() => {
    const map = new Map<string, IntakeOutputEntry[]>();
    for (const e of entries) {
      const day = e.recordedAt.slice(0, 10);
      const arr = map.get(day) ?? [];
      arr.push(e);
      map.set(day, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  const balance = (list: IntakeOutputEntry[]) => {
    const intake = list.filter(e => e.type === 'intake').reduce((s, e) => s + e.amountMl, 0);
    const output = list.filter(e => e.type === 'output').reduce((s, e) => s + e.amountMl, 0);
    return { intake, output, net: intake - output };
  };

  const categories = form.type === 'intake' ? INTAKE_CATEGORIES : OUTPUT_CATEGORIES;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplets className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-slate-800">Fluid Balance</h3>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Add Entry
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          {/* Type toggle */}
          <div className="flex gap-2">
            {(['intake', 'output'] as IOType[]).map(t => (
              <button
                key={t}
                onClick={() => handleTypeChange(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                  form.type === t
                    ? t === 'intake' ? 'bg-teal-600 text-white' : 'bg-rose-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                {t === 'intake' ? '↓ Intake' : '↑ Output'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Category</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Amount (mL)</label>
              <input
                type="number"
                min="0"
                value={form.amountMl}
                onChange={e => setForm(f => ({ ...f, amountMl: e.target.value }))}
                placeholder="e.g. 250"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Date & Time</label>
            <input
              type="datetime-local"
              value={form.recordedAt}
              onChange={e => setForm(f => ({ ...f, recordedAt: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Notes (optional)</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Normal saline 0.9%"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
          </div>
        </div>
      )}

      {/* Records */}
      {loading ? (
        <div className="text-center py-8 text-slate-400 text-sm">Loading…</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-12">
          <Droplets className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-slate-500 text-sm font-medium">No fluid balance entries yet</p>
          <p className="text-slate-400 text-xs mt-1">Tap "Add Entry" to begin documenting</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([day, list]) => {
            const { intake, output, net } = balance(list);
            return (
              <div key={day} className="border border-slate-200 rounded-xl overflow-hidden">
                {/* Day header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                  <span className="text-sm font-semibold text-slate-700">
                    {new Date(day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-teal-700">
                      <TrendingDown className="w-3.5 h-3.5" /> {intake} mL in
                    </span>
                    <span className="flex items-center gap-1 text-rose-600">
                      <TrendingUp className="w-3.5 h-3.5" /> {output} mL out
                    </span>
                    <span className={`font-bold ${net >= 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                      Net {net >= 0 ? '+' : ''}{net} mL
                    </span>
                  </div>
                </div>

                {/* Entries */}
                <div className="divide-y divide-slate-100">
                  {list.map(entry => (
                    <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className={`flex-shrink-0 w-2 h-2 rounded-full ${entry.type === 'intake' ? 'bg-teal-500' : 'bg-rose-500'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700">{entry.category}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                            entry.type === 'intake' ? 'bg-teal-50 text-teal-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {entry.type === 'intake' ? '+' : '−'}{entry.amountMl} mL
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-400">
                            {new Date(entry.recordedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            {entry.recordedBy && ` · ${entry.recordedBy}`}
                          </span>
                          {entry.notes && <span className="text-xs text-slate-500 truncate">{entry.notes}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        className="flex-shrink-0 p-1.5 text-slate-300 hover:text-rose-500 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default IntakeOutput;
