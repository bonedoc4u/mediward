import React, { useState } from 'react';
import { Activity, Plus, ChevronDown, ChevronUp, AlertTriangle, BarChart2, Table2 } from 'lucide-react';
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

// ── Vitals Sparkline ──────────────────────────────────────────────
interface SparklineRow {
  label: string;
  color: string;
  color2?: string;         // second series (BP diastolic)
  points: number[];
  points2?: number[];
  timestamps: number[];
  thresholdHigh?: number;
  thresholdLow?: number;
  unit: string;
  decimals?: number;
  isAlert: (v: number, v2?: number) => boolean;
}

const W = 100; // viewBox width
const H = 55;  // viewBox height per row
const PAD = { t: 4, b: 4, l: 0, r: 0 };

function buildPoints(vals: number[], w = W, h = H) {
  const valid = vals.filter(v => !isNaN(v));
  if (valid.length < 1) return [];
  const minV = Math.min(...valid);
  const maxV = Math.max(...valid);
  const range = maxV - minV;
  const plotH = h - PAD.t - PAD.b;
  const plotW = w - PAD.l - PAD.r;
  return vals.map((v, i) => {
    const x = PAD.l + (vals.length === 1 ? plotW / 2 : (i / (vals.length - 1)) * plotW);
    // When all values are identical (range=0), center the flat line vertically
    const y = range === 0
      ? PAD.t + plotH / 2
      : PAD.t + plotH - ((v - minV) / range) * plotH;
    return { x, y, v };
  });
}

function thresholdY(threshold: number, vals: number[], h = H) {
  const valid = vals.filter(v => !isNaN(v));
  if (valid.length === 0) return null;
  const minV = Math.min(...valid);
  const maxV = Math.max(...valid);
  const range = maxV - minV || 1;
  const plotH = h - PAD.t - PAD.b;
  const clamped = Math.max(minV, Math.min(maxV, threshold));
  return PAD.t + plotH - ((clamped - minV) / range) * plotH;
}

const VitalsSparklines: React.FC<{ vitals: VitalSigns[] }> = ({ vitals }) => {
  // Use last 14 readings in chronological order (oldest → newest)
  const sorted = [...vitals]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-14);

  if (sorted.length < 2) {
    return (
      <div className="p-6 text-center text-slate-400 text-sm">
        <BarChart2 className="w-7 h-7 mx-auto mb-1.5 opacity-40" />
        Record at least 2 readings to see trends
      </div>
    );
  }

  const ts = sorted.map(v => new Date(v.timestamp).getTime());
  const fmt = (v?: number, d = 0) => v !== undefined ? v.toFixed(d) : '—';
  const fmtDate = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

  const rows: SparklineRow[] = [
    {
      label: 'BP mmHg',
      color: '#ef4444',   // red = systolic
      color2: '#f97316',  // orange = diastolic
      points:  sorted.map(v => v.bpSystolic  ?? NaN),
      points2: sorted.map(v => v.bpDiastolic ?? NaN),
      timestamps: ts,
      thresholdHigh: 160,
      thresholdLow: 90,
      unit: 'mmHg',
      isAlert: (s, d) => !!(isAlertBP(s, d)),
    },
    {
      label: 'Heart Rate',
      color: '#f97316',
      points: sorted.map(v => v.heartRate ?? NaN),
      timestamps: ts,
      thresholdHigh: 100,
      thresholdLow: 50,
      unit: 'bpm',
      isAlert: v => isAlertHR(v),
    },
    {
      label: 'SpO₂',
      color: '#3b82f6',
      points: sorted.map(v => v.spo2 ?? NaN),
      timestamps: ts,
      thresholdLow: 94,
      unit: '%',
      isAlert: v => isAlertSpo2(v),
    },
    {
      label: 'Temp',
      color: '#10b981',
      points: sorted.map(v => v.temperature ?? NaN),
      timestamps: ts,
      thresholdHigh: 38.5,
      thresholdLow: 35.5,
      unit: '°C',
      decimals: 1,
      isAlert: v => isAlertTemp(v),
    },
  ];

  // Filter rows that have at least 1 real value
  const activeRows = rows.filter(r => r.points.some(v => !isNaN(v)));

  if (activeRows.length === 0) {
    return (
      <div className="p-6 text-center text-slate-400 text-sm">
        No chartable vitals yet
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-4">
      {/* X-axis labels (shared) */}
      <div className="flex justify-between text-[10px] text-slate-400 px-0">
        <span>{fmtDate(ts[0])}</span>
        {ts.length > 2 && <span>{fmtDate(ts[Math.floor(ts.length / 2)])}</span>}
        <span>{fmtDate(ts[ts.length - 1])}</span>
      </div>

      {activeRows.map(row => {
        const pts  = buildPoints(row.points.filter(v => !isNaN(v)).length > 0
          ? row.points : [], W, H);
        const pts2 = row.points2
          ? buildPoints(row.points2.filter(v => !isNaN(v)).length > 0
            ? row.points2 : [], W, H)
          : [];

        // For threshold lines, we need all values to compute Y scale
        const allVals = [
          ...row.points.filter(v => !isNaN(v)),
          ...(row.points2 ?? []).filter(v => !isNaN(v)),
        ];
        const tyHigh = row.thresholdHigh !== undefined
          ? thresholdY(row.thresholdHigh, allVals, H) : null;
        const tyLow  = row.thresholdLow  !== undefined
          ? thresholdY(row.thresholdLow,  allVals, H) : null;

        // Valid reading pairs for connecting line (skip NaN gaps)
        const lineSegments1: string[] = [];
        let segment: string[] = [];
        pts.forEach((p, i) => {
          if (!isNaN(row.points[i])) {
            segment.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
          } else if (segment.length > 0) {
            lineSegments1.push(segment.join(' '));
            segment = [];
          }
        });
        if (segment.length > 0) lineSegments1.push(segment.join(' '));

        const lineSegments2: string[] = [];
        let seg2: string[] = [];
        pts2.forEach((p, i) => {
          const v2 = (row.points2 ?? [])[i];
          if (!isNaN(v2)) {
            seg2.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
          } else if (seg2.length > 0) {
            lineSegments2.push(seg2.join(' '));
            seg2 = [];
          }
        });
        if (seg2.length > 0) lineSegments2.push(seg2.join(' '));

        // Latest real value for label
        const lastVal  = [...row.points].reverse().find(v => !isNaN(v));
        const lastVal2 = row.points2 ? [...row.points2].reverse().find(v => !isNaN(v)) : undefined;

        return (
          <div key={row.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{row.label}</span>
              <span className={`text-xs font-bold ${row.isAlert(lastVal ?? 0, lastVal2) ? 'text-red-600' : 'text-slate-700'}`}>
                {lastVal !== undefined ? `${fmt(lastVal, row.decimals ?? 0)}${row.points2 ? `/${fmt(lastVal2, 0)}` : ''}` : '—'}
                {' '}<span className="font-normal text-slate-400">{row.unit}</span>
              </span>
            </div>
            <div className="bg-slate-50 rounded-lg overflow-hidden">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="w-full"
                style={{ height: 56 }}
              >
                {/* Grid lines */}
                <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="#e2e8f0" strokeWidth="0.5" />

                {/* Threshold lines */}
                {tyHigh !== null && (
                  <line x1="0" y1={tyHigh} x2={W} y2={tyHigh}
                    stroke="#ef4444" strokeWidth="0.8" strokeDasharray="2,2" opacity="0.6" />
                )}
                {tyLow !== null && (
                  <line x1="0" y1={tyLow} x2={W} y2={tyLow}
                    stroke="#ef4444" strokeWidth="0.8" strokeDasharray="2,2" opacity="0.6" />
                )}

                {/* Series 1 */}
                {lineSegments1.map((seg, si) => (
                  <polyline key={si} points={seg} fill="none"
                    stroke={row.color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
                ))}
                {pts.map((p, i) => {
                  if (isNaN(row.points[i])) return null;
                  const alert = row.isAlert(row.points[i], (row.points2 ?? [])[i]);
                  return (
                    <circle key={i} cx={p.x} cy={p.y} r={alert ? 2.5 : 1.8}
                      fill={alert ? '#ef4444' : row.color}
                      stroke="white" strokeWidth="0.6" vectorEffect="non-scaling-stroke">
                      <title>{new Date(row.timestamps[i]).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}: {row.points[i].toFixed(row.decimals ?? 0)} {row.unit}</title>
                    </circle>
                  );
                })}

                {/* Series 2 (BP diastolic) */}
                {lineSegments2.map((seg, si) => (
                  <polyline key={`d${si}`} points={seg} fill="none"
                    stroke={row.color2} strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeDasharray="3,1" />
                ))}
                {pts2.map((p, i) => {
                  const v2 = (row.points2 ?? [])[i];
                  if (isNaN(v2)) return null;
                  return (
                    <circle key={`d${i}`} cx={p.x} cy={p.y} r={1.5}
                      fill={row.color2} stroke="white" strokeWidth="0.6" vectorEffect="non-scaling-stroke">
                      <title>Dia {v2} {row.unit}</title>
                    </circle>
                  );
                })}
              </svg>
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-red-500 rounded" />BP Sys</span>
        <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-orange-500 rounded border-dashed" style={{borderBottom:'1px dashed'}} />BP Dia</span>
        <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-orange-400 rounded" />HR</span>
        <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-blue-500 rounded" />SpO₂</span>
        <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-emerald-500 rounded" />Temp</span>
        <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 border-t border-dashed border-red-500" />Alert threshold</span>
      </div>
    </div>
  );
};

// ── Main Widget ────────────────────────────────────────────────────
const VitalsWidget: React.FC<Props> = ({ vitals, onAdd }) => {
  const { user } = useAuth();
  const [showForm, setShowForm]   = useState(false);
  const [showAll, setShowAll]     = useState(false);
  const [viewMode, setViewMode]   = useState<'table' | 'chart'>('table');
  const [form, setForm]           = useState<Omit<VitalSigns, 'id'>>({ ...EMPTY, timestamp: new Date().toISOString().slice(0, 16) });

  const openForm = () => {
    setForm({ ...EMPTY, timestamp: new Date().toISOString().slice(0, 16) });
    setShowForm(true);
  };

  const latest  = vitals[0];
  const visible = showAll ? vitals : vitals.slice(0, 3);

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
        <div className="flex items-center gap-1.5">
          {/* Chart / Table toggle */}
          {vitals.length >= 2 && !showForm && (
            <div className="flex rounded-lg overflow-hidden border border-slate-200 text-xs">
              <button
                onClick={() => setViewMode('table')}
                className={`px-2 py-1 flex items-center gap-1 transition-colors ${viewMode === 'table' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                <Table2 className="w-3 h-3" /> Table
              </button>
              <button
                onClick={() => setViewMode('chart')}
                className={`px-2 py-1 flex items-center gap-1 transition-colors ${viewMode === 'chart' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                <BarChart2 className="w-3 h-3" /> Chart
              </button>
            </div>
          )}
          <button
            onClick={() => showForm ? setShowForm(false) : openForm()}
            className="flex items-center gap-1 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Record
          </button>
        </div>
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
                type="number" placeholder="mmHg" min={40} max={300}
                value={form.bpSystolic ?? ''}
                onChange={e => set('bpSystolic', e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">BP Diastolic</label>
              <input
                type="number" placeholder="mmHg" min={20} max={200}
                value={form.bpDiastolic ?? ''}
                onChange={e => set('bpDiastolic', e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Heart Rate</label>
              <input
                type="number" placeholder="bpm" min={20} max={300}
                value={form.heartRate ?? ''}
                onChange={e => set('heartRate', e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Temperature</label>
              <input
                type="number" step="0.1" placeholder="°C" min={30} max={45}
                value={form.temperature ?? ''}
                onChange={e => set('temperature', e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">SpO₂ %</label>
              <input
                type="number" placeholder="%" min={50} max={100}
                value={form.spo2 ?? ''}
                onChange={e => set('spo2', e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Resp. Rate</label>
              <input
                type="number" placeholder="breaths/min" min={1} max={60}
                value={form.respiratoryRate ?? ''}
                onChange={e => set('respiratoryRate', e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Weight (kg)</label>
              <input
                type="number" step="0.1" placeholder="kg" min={1} max={500}
                value={form.weight ?? ''}
                onChange={e => set('weight', e.target.value)}
                className="w-full mt-0.5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Pain Score (0–10)</label>
              <input
                type="number" min={0} max={10} placeholder="0–10"
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

      {/* Chart view */}
      {!showForm && viewMode === 'chart' && vitals.length > 0 && (
        <VitalsSparklines vitals={vitals} />
      )}

      {/* Table view */}
      {!showForm && viewMode === 'table' && (
        vitals.length === 0 ? (
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
        )
      )}

      {/* Show more / less (table view only) */}
      {viewMode === 'table' && vitals.length > 3 && (
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
