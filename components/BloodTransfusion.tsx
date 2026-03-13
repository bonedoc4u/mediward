/**
 * BloodTransfusion.tsx
 * Blood transfusion documentation for a patient.
 */
import React, { useState, useEffect } from 'react';
import { Droplets, Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AppContext';
import { BloodTransfusionRecord } from '../types';
import {
  fetchBloodTransfusions,
  addBloodTransfusion,
  deleteBloodTransfusion,
} from '../services/bloodTransfusionService';
import { toast } from '../utils/toast';

const BLOOD_PRODUCTS = ['Packed Red Cells (PRC)', 'Whole Blood', 'Fresh Frozen Plasma (FFP)', 'Platelets', 'Cryoprecipitate'];
const BLOOD_GROUPS = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'];
const REACTIONS = ['None', 'Fever / Chills', 'Urticaria', 'Haemolytic Reaction', 'TACO', 'TRALI', 'Anaphylaxis'];

const today = () => new Date().toISOString().slice(0, 10);

interface Props {
  patientIpNo: string;
}

const BloodTransfusion: React.FC<Props> = ({ patientIpNo }) => {
  const { user } = useAuth();
  const [records, setRecords] = useState<BloodTransfusionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    transfusionDate: today(),
    bloodProduct:    BLOOD_PRODUCTS[0],
    bloodGroup:      '',
    units:           '1',
    bagNo:           '',
    startedAt:       '',
    completedAt:     '',
    reaction:        'None',
    notes:           '',
  });

  useEffect(() => {
    fetchBloodTransfusions(patientIpNo)
      .then(setRecords)
      .catch(() => toast.error('Failed to load transfusion records'))
      .finally(() => setLoading(false));
  }, [patientIpNo]);

  const handleAdd = async () => {
    const units = parseFloat(form.units);
    if (!units || units <= 0) { toast.error('Enter valid units'); return; }
    setSaving(true);
    try {
      const created = await addBloodTransfusion(patientIpNo, {
        transfusionDate: form.transfusionDate,
        bloodProduct:    form.bloodProduct,
        bloodGroup:      form.bloodGroup || undefined,
        units,
        bagNo:           form.bagNo.trim() || undefined,
        startedAt:       form.startedAt ? new Date(form.startedAt).toISOString() : undefined,
        completedAt:     form.completedAt ? new Date(form.completedAt).toISOString() : undefined,
        reaction:        form.reaction !== 'None' ? form.reaction : undefined,
        notes:           form.notes.trim() || undefined,
        recordedBy:      user?.name ?? user?.email,
      });
      setRecords(prev => [created, ...prev]);
      setForm(f => ({
        ...f,
        bagNo: '', startedAt: '', completedAt: '', reaction: 'None', notes: '',
        transfusionDate: today(),
      }));
      setShowAdd(false);
      toast.success('Transfusion record added');
    } catch {
      toast.error('Failed to save record');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBloodTransfusion(id);
      setRecords(prev => prev.filter(r => r.id !== id));
      toast.success('Record removed');
    } catch {
      toast.error('Failed to remove record');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplets className="w-5 h-5 text-red-600" />
          <h3 className="font-semibold text-slate-800">Blood Transfusion</h3>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
        >
          <Plus className="w-4 h-4" />
          Add Record
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Blood Product</label>
              <select
                value={form.bloodProduct}
                onChange={e => setForm(f => ({ ...f, bloodProduct: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                {BLOOD_PRODUCTS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Blood Group</label>
              <select
                value={form.bloodGroup}
                onChange={e => setForm(f => ({ ...f, bloodGroup: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                <option value="">Unknown</option>
                {BLOOD_GROUPS.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Units</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={form.units}
                onChange={e => setForm(f => ({ ...f, units: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Bag / Donor No.</label>
              <input
                type="text"
                value={form.bagNo}
                onChange={e => setForm(f => ({ ...f, bagNo: e.target.value }))}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Date</label>
              <input
                type="date"
                value={form.transfusionDate}
                onChange={e => setForm(f => ({ ...f, transfusionDate: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Reaction</label>
              <select
                value={form.reaction}
                onChange={e => setForm(f => ({ ...f, reaction: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              >
                {REACTIONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Started At (optional)</label>
              <input
                type="datetime-local"
                value={form.startedAt}
                onChange={e => setForm(f => ({ ...f, startedAt: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Completed At (optional)</label>
              <input
                type="datetime-local"
                value={form.completedAt}
                onChange={e => setForm(f => ({ ...f, completedAt: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Notes</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Additional observations…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
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
          <Droplets className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-slate-500 text-sm font-medium">No transfusion records</p>
          <p className="text-slate-400 text-xs mt-1">Tap "Add Record" to document a transfusion</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(r => (
            <div key={r.id} className="border border-slate-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800 text-sm">{r.bloodProduct}</span>
                    {r.bloodGroup && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                        {r.bloodGroup}
                      </span>
                    )}
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {r.units} unit{r.units !== 1 ? 's' : ''}
                    </span>
                    {r.reaction ? (
                      <span className="text-xs flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        <AlertTriangle className="w-3 h-3" /> {r.reaction}
                      </span>
                    ) : (
                      <span className="text-xs flex items-center gap-1 bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> No reaction
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                    <span>{new Date(r.transfusionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    {r.bagNo && <span>Bag: {r.bagNo}</span>}
                    {r.startedAt && <span>Started: {new Date(r.startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
                    {r.completedAt && <span>Completed: {new Date(r.completedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
                    {r.recordedBy && <span>By: {r.recordedBy}</span>}
                  </div>
                  {r.notes && <p className="mt-1 text-xs text-slate-600">{r.notes}</p>}
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

export default BloodTransfusion;
