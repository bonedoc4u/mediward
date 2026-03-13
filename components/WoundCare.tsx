/**
 * WoundCare.tsx
 * Wound care documentation for a patient.
 */
import React, { useState, useEffect } from 'react';
import { Bandage, Plus, Trash2, Calendar } from 'lucide-react';
import { useAuth } from '../contexts/AppContext';
import { WoundCareRecord } from '../types';
import { fetchWoundCare, addWoundCare, deleteWoundCare } from '../services/woundCareService';
import { toast } from '../utils/toast';

const WOUND_TYPES = ['Surgical', 'Traumatic', 'Pressure Ulcer', 'Diabetic Foot', 'Venous Ulcer', 'Burns', 'Other'];
const WOUND_CONDITIONS = ['Clean / Healing', 'Granulating', 'Sloughy', 'Infected', 'Necrotic', 'Dehisced'];
const DRESSING_TYPES = ['Dry Sterile', 'Saline Gauze', 'Vaseline Gauze', 'Betadine Pack', 'Alginate', 'Foam Dressing', 'Hydrocolloid', 'Negative Pressure (NPWT)', 'Crepe Bandage'];
const EXUDATE_LEVELS = ['None', 'Minimal', 'Moderate', 'Heavy', 'Purulent'];

const today = () => new Date().toISOString().slice(0, 10);

interface Props {
  patientIpNo: string;
}

const WoundCare: React.FC<Props> = ({ patientIpNo }) => {
  const { user } = useAuth();
  const [records, setRecords] = useState<WoundCareRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    careDate:          today(),
    woundSite:         '',
    woundType:         WOUND_TYPES[0],
    woundCondition:    WOUND_CONDITIONS[0],
    dressingType:      DRESSING_TYPES[0],
    dressingChanged:   true,
    woundMeasurement:  '',
    exudate:           'None',
    notes:             '',
    nextDressingDate:  '',
  });

  useEffect(() => {
    fetchWoundCare(patientIpNo)
      .then(setRecords)
      .catch(() => toast.error('Failed to load wound care records'))
      .finally(() => setLoading(false));
  }, [patientIpNo]);

  const handleAdd = async () => {
    if (!form.woundSite.trim()) { toast.error('Enter wound site'); return; }
    setSaving(true);
    try {
      const created = await addWoundCare(patientIpNo, {
        careDate:         form.careDate,
        woundSite:        form.woundSite.trim(),
        woundType:        form.woundType || undefined,
        woundCondition:   form.woundCondition || undefined,
        dressingType:     form.dressingType || undefined,
        dressingChanged:  form.dressingChanged,
        woundMeasurement: form.woundMeasurement.trim() || undefined,
        exudate:          form.exudate !== 'None' ? form.exudate : undefined,
        notes:            form.notes.trim() || undefined,
        nextDressingDate: form.nextDressingDate || undefined,
        recordedBy:       user?.name ?? user?.email,
      });
      setRecords(prev => [created, ...prev]);
      setForm(f => ({ ...f, woundSite: '', woundMeasurement: '', notes: '', nextDressingDate: '', careDate: today() }));
      setShowAdd(false);
      toast.success('Wound care record added');
    } catch {
      toast.error('Failed to save record');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWoundCare(id);
      setRecords(prev => prev.filter(r => r.id !== id));
      toast.success('Record removed');
    } catch {
      toast.error('Failed to remove record');
    }
  };

  const conditionColor: Record<string, string> = {
    'Clean / Healing': 'bg-green-50 text-green-700',
    'Granulating':     'bg-teal-50 text-teal-700',
    'Sloughy':         'bg-yellow-50 text-yellow-700',
    'Infected':        'bg-red-50 text-red-700',
    'Necrotic':        'bg-slate-100 text-slate-700',
    'Dehisced':        'bg-orange-50 text-orange-700',
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bandage className="w-5 h-5 text-amber-600" />
          <h3 className="font-semibold text-slate-800">Wound Care</h3>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700"
        >
          <Plus className="w-4 h-4" />
          Add Record
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Wound Site *</label>
              <input
                type="text"
                value={form.woundSite}
                onChange={e => setForm(f => ({ ...f, woundSite: e.target.value }))}
                placeholder="e.g. Right knee, Surgical incision"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Care Date</label>
              <input
                type="date"
                value={form.careDate}
                onChange={e => setForm(f => ({ ...f, careDate: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Wound Type</label>
              <select
                value={form.woundType}
                onChange={e => setForm(f => ({ ...f, woundType: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                {WOUND_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Wound Condition</label>
              <select
                value={form.woundCondition}
                onChange={e => setForm(f => ({ ...f, woundCondition: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                {WOUND_CONDITIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Dressing Type</label>
              <select
                value={form.dressingType}
                onChange={e => setForm(f => ({ ...f, dressingType: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                {DRESSING_TYPES.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Exudate</label>
              <select
                value={form.exudate}
                onChange={e => setForm(f => ({ ...f, exudate: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                {EXUDATE_LEVELS.map(e => <option key={e}>{e}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Measurement (optional)</label>
              <input
                type="text"
                value={form.woundMeasurement}
                onChange={e => setForm(f => ({ ...f, woundMeasurement: e.target.value }))}
                placeholder="e.g. 3×2 cm"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Next Dressing Date</label>
              <input
                type="date"
                value={form.nextDressingDate}
                onChange={e => setForm(f => ({ ...f, nextDressingDate: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="dressingChanged"
              type="checkbox"
              checked={form.dressingChanged}
              onChange={e => setForm(f => ({ ...f, dressingChanged: e.target.checked }))}
              className="w-4 h-4 accent-amber-600"
            />
            <label htmlFor="dressingChanged" className="text-sm text-slate-700">Dressing changed this visit</label>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Observations, instructions…"
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Record'}
            </button>
          </div>
        </div>
      )}

      {/* Records list */}
      {loading ? (
        <div className="text-center py-8 text-slate-400 text-sm">Loading…</div>
      ) : records.length === 0 ? (
        <div className="text-center py-12">
          <Bandage className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-slate-500 text-sm font-medium">No wound care records</p>
          <p className="text-slate-400 text-xs mt-1">Tap "Add Record" to begin documenting</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(r => (
            <div key={r.id} className="border border-slate-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 text-sm">{r.woundSite}</span>
                    {r.woundType && (
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{r.woundType}</span>
                    )}
                    {r.woundCondition && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${conditionColor[r.woundCondition] ?? 'bg-slate-100 text-slate-600'}`}>
                        {r.woundCondition}
                      </span>
                    )}
                    {r.dressingChanged && (
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">Dressing changed</span>
                    )}
                  </div>

                  <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                    <span>{new Date(r.careDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    {r.dressingType && <span>Dressing: {r.dressingType}</span>}
                    {r.exudate && <span>Exudate: {r.exudate}</span>}
                    {r.woundMeasurement && <span>{r.woundMeasurement}</span>}
                    {r.recordedBy && <span>By: {r.recordedBy}</span>}
                  </div>

                  {r.nextDressingDate && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700">
                      <Calendar className="w-3 h-3" />
                      Next dressing: {new Date(r.nextDressingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </div>
                  )}

                  {r.notes && <p className="mt-1.5 text-xs text-slate-600">{r.notes}</p>}
                </div>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="flex-shrink-0 p-1.5 text-slate-300 hover:text-rose-500 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WoundCare;
