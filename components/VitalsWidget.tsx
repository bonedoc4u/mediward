import React, { useState } from 'react';
import { Activity, Plus, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { VitalSigns } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  vitals: VitalSigns[];
  onAdd: (v: Omit<VitalSigns, 'id'>) => void;
}

// ── Clinical alert thresholds ──────────────────────────────────────
const isAlertBP   = (s?: number, d?: number) => (s && (s > 160 || s < 90)) || (d && (d > 100 || d < 60));
const isAlertHR   = (v?: number) => v !== undefined && (v > 100 || v < 50);
const isAlertTemp = (v?: number) => v !== undefined && (v > 38.5 || v < 35.5);
const isAlertSpo2 = (v?: number) => v !== undefined && v < 94;
const isAlertRR   = (v?: number) => v !== undefined && (v > 20 || v < 10);

function alertClass(flag: boolean) {
  return flag ? 'text-red-600 font-bold' : 'text-slate-700';
}

const EMPTY: Omit<VitalSigns, 'id'> = {
  timestamp: new Date().toISOString().slice(0, 16),
  bpSystolic: undefined, bpDiastolic: undefined,
  heartRate: undefined, temperature: undefined,
  spo2: undefined, respiratoryRate: undefined,
  weight: undefined, painScore: undefined,
  notes: '',
};

const VitalsWidget: React.FC<Props> = ({ vitals, onAdd }) => {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [showAll, setShowAll]   = useState(false);
  const [form, setForm]         = useState<Omit<VitalSigns, 'id'>>({ ...EMPTY, timestamp: new Date().toISOString().slice(0, 16) });

  const latest   = vitals[0];
  const visible  = showAll ? vitals : vitals.slice(0, 3);

  const set = (key: keyof typeof form, val: string) => {
    const num = parseFloat(val);
    setForm(f => ({ ...f, [key]: val === '' ? undefined : isNaN(num) ? val : num }));
  };

  const handleSave = () => {
    onAdd({ ...form, recordedBy: user?.name ?? 'Nurse' });
    setForm({ ...EMPTY, timestamp: new Date().toISOString().slice(0, 16) });
    setShowForm(false);
  };

  const fmt = (v?: number, dec = 0) => v !== undefined ? v.toFixed(dec) : '—';
  const fmtTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
    } catch { return ts; }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-teal-600" />
          <span className="font-semibold text-slate-800 text-sm">Vital Signs</span>
          {vitals.length > 0 && (
            <span className="text-xs text-slate-400">· {vitals.length} record{vitals.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Record
        </button>
      </div>

      {/* Quick-entry form */}
      {showForm && (
        <div className="p-4 border-b border-slate-100 bg-teal-50/40 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Date & Time</label>
              <input
                type="datetime-local"
                value={form.timestamp as string}
                onChange={e => set('timestamp', e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">BP Systolic</label>
              <input
                type="number" placeholder="mmHg"
                value={form.bpSystolic ?? ''}
                onChange={e => set('bpSystolic', e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">BP Diastolic</label>
              <input
                type="number" placeholder="mmHg"
                value={form.bpDiastolic ?? ''}
                onChange={e => set('bpDiastolic', e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Heart Rate</label>
              <input
                type="number" placeholder="bpm"
                value={form.heartRate ?? ''}
                onChange={e => set('heartRate', e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Temperature</label>
              <input
                type="number" step="0.1" placeholder="°C"
                value={form.temperature ?? ''}
                onChange={e => set('temperature', e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">SpO₂ %</label>
              <input
                type="number" placeholder="%"
                value={form.spo2 ?? ''}
                onChange={e => set('spo2', e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Resp. Rate</label>
              <input
                type="number" placeholder="breaths/min"
                value={form.respiratoryRate ?? ''}
                onChange={e => set('respiratoryRate', e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Weight (kg)</label>
              <input
                type="number" step="0.1" placeholder="kg"
                value={form.weight ?? ''}
                onChange={e => set('weight', e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Pain Score (0–10)</label>
              <input
                type="number" min="0" max="10" placeholder="0–10"
                value={form.painScore ?? ''}
                onChange={e => set('painScore', e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Notes</label>
            <input
              type="text" placeholder="Optional clinical note"
              value={form.notes ?? ''}
              onChange={e => set('notes', e.target.value)}
              className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Latest vitals summary bar */}
      {latest && !showForm && (
        <div className="px-4 py-2 border-b border-slate-100 flex flex-wrap gap-x-4 gap-y-1 bg-white">
          {(latest.bpSystolic !== undefined || latest.bpDiastolic !== undefined) && (
            <span className={`text-xs ${alertClass(!!isAlertBP(latest.bpSystolic, latest.bpDiastolic))}`}>
              BP {fmt(latest.bpSystolic)}/{fmt(latest.bpDiastolic)} mmHg
              {isAlertBP(latest.bpSystolic, latest.bpDiastolic) && <AlertTriangle className="inline w-3 h-3 ml-0.5" />}
            </span>
          )}
          {latest.heartRate !== undefined && (
            <span className={`text-xs ${alertClass(isAlertHR(latest.heartRate))}`}>
              HR {fmt(latest.heartRate)} bpm
              {isAlertHR(latest.heartRate) && <AlertTriangle className="inline w-3 h-3 ml-0.5" />}
            </span>
          )}
          {latest.temperature !== undefined && (
            <span className={`text-xs ${alertClass(isAlertTemp(latest.temperature))}`}>
              Temp {fmt(latest.temperature, 1)}°C
              {isAlertTemp(latest.temperature) && <AlertTriangle className="inline w-3 h-3 ml-0.5" />}
            </span>
          )}
          {latest.spo2 !== undefined && (
            <span className={`text-xs ${alertClass(isAlertSpo2(latest.spo2))}`}>
              SpO₂ {fmt(latest.spo2)}%
              {isAlertSpo2(latest.spo2) && <AlertTriangle className="inline w-3 h-3 ml-0.5" />}
            </span>
          )}
          {latest.respiratoryRate !== undefined && (
            <span className={`text-xs ${alertClass(isAlertRR(latest.respiratoryRate))}`}>
              RR {fmt(latest.respiratoryRate)}
              {isAlertRR(latest.respiratoryRate) && <AlertTriangle className="inline w-3 h-3 ml-0.5" />}
            </span>
          )}
          {latest.weight !== undefined && (
            <span className="text-xs text-slate-700">Wt {fmt(latest.weight, 1)} kg</span>
          )}
          {latest.painScore !== undefined && (
            <span className={`text-xs ${alertClass((latest.painScore ?? 0) >= 7)}`}>
              Pain {fmt(latest.painScore)}/10
              {(latest.painScore ?? 0) >= 7 && <AlertTriangle className="inline w-3 h-3 ml-0.5" />}
            </span>
          )}
          <span className="text-xs text-slate-400 ml-auto">{fmtTime(latest.timestamp)}</span>
        </div>
      )}

      {/* History table */}
      {vitals.length === 0 ? (
        <div className="p-6 text-center text-slate-400 text-sm">
          <Activity className="w-7 h-7 mx-auto mb-1.5 opacity-40" />
          No vitals recorded yet
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: '560px' }}>
            <thead>
              <tr className="bg-slate-50 text-slate-500 uppercase tracking-wide text-[10px]">
                <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left font-semibold z-10">Time</th>
                <th className="px-3 py-2 text-right font-semibold">BP</th>
                <th className="px-3 py-2 text-right font-semibold">HR</th>
                <th className="px-3 py-2 text-right font-semibold">Temp</th>
                <th className="px-3 py-2 text-right font-semibold">SpO₂</th>
                <th className="px-3 py-2 text-right font-semibold">RR</th>
                <th className="px-3 py-2 text-right font-semibold">Wt</th>
                <th className="px-3 py-2 text-right font-semibold">Pain</th>
                <th className="px-3 py-2 text-left font-semibold">By</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((v, i) => (
                <tr key={v.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className={`sticky left-0 px-3 py-2 font-medium text-slate-600 whitespace-nowrap z-10 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                    {fmtTime(v.timestamp)}
                  </td>
                  <td className={`px-3 py-2 text-right ${alertClass(!!isAlertBP(v.bpSystolic, v.bpDiastolic))}`}>
                    {v.bpSystolic !== undefined ? `${fmt(v.bpSystolic)}/${fmt(v.bpDiastolic)}` : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right ${alertClass(isAlertHR(v.heartRate))}`}>{fmt(v.heartRate)}</td>
                  <td className={`px-3 py-2 text-right ${alertClass(isAlertTemp(v.temperature))}`}>
                    {v.temperature !== undefined ? `${fmt(v.temperature, 1)}°` : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right ${alertClass(isAlertSpo2(v.spo2))}`}>
                    {v.spo2 !== undefined ? `${fmt(v.spo2)}%` : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right ${alertClass(isAlertRR(v.respiratoryRate))}`}>{fmt(v.respiratoryRate)}</td>
                  <td className="px-3 py-2 text-right text-slate-600">
                    {v.weight !== undefined ? `${fmt(v.weight, 1)}` : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right ${alertClass((v.painScore ?? 0) >= 7)}`}>
                    {v.painScore !== undefined ? fmt(v.painScore) : '—'}
                  </td>
                  <td className="px-3 py-2 text-slate-500 truncate max-w-[80px]">{v.recordedBy ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Show more / less */}
      {vitals.length > 3 && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="w-full py-2 text-xs text-blue-600 hover:bg-slate-50 flex items-center justify-center gap-1 border-t border-slate-100 transition-colors"
        >
          {showAll ? <><ChevronUp className="w-3.5 h-3.5" />Show less</> : <><ChevronDown className="w-3.5 h-3.5" />Show {vitals.length - 3} more</>}
        </button>
      )}
    </div>
  );
};

export default VitalsWidget;
