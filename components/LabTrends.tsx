import React, { useState, useMemo } from 'react';
import { Patient, LabResult } from '../types';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ReferenceArea, ResponsiveContainer,
} from 'recharts';
import { Activity, Plus, TrendingDown, TrendingUp, Minus, Search, ChevronDown } from 'lucide-react';
import { todayYmd } from '../utils/dates';

interface Props {
  patients: Patient[];
  onAddResult: (patientId: string, result: LabResult) => void;
  initialPatientId?: string;
}

// ─── Lab Parameters ───────────────────────────────────────────────────────────
interface LabParam {
  id: string;
  name: string;
  unit: string;
  refMin: number | null;
  refMax: number;
}

const LAB_PARAMS: LabParam[] = [
  { id: 'fbs',  name: 'FBS',  unit: 'mg/dL', refMin: 70,   refMax: 100 },
  { id: 'ppbs', name: 'PPBS', unit: 'mg/dL', refMin: null, refMax: 140 },
  { id: 'esr',  name: 'ESR',  unit: 'mm/hr', refMin: 0,    refMax: 20  },
  { id: 'crp',  name: 'CRP',  unit: 'mg/L',  refMin: 0,    refMax: 5   },
];

interface LabEntry { id: string; date: string; value: number; }

// ─── BottomSheet ──────────────────────────────────────────────────────────────
const BottomSheet: React.FC<{ isOpen: boolean; onClose: () => void; children: React.ReactNode }> = ({
  isOpen, onClose, children,
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface-card rounded-t-2xl shadow-2xl
                      animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-surface-sunken rounded-full" />
        </div>
        {children}
      </div>
    </div>
  );
};

// ─── Add Entry Sheet ──────────────────────────────────────────────────────────
const AddEntrySheet: React.FC<{
  isOpen: boolean;
  param: LabParam | null;
  onClose: () => void;
  onSave: (paramId: string, entry: LabEntry) => void;
}> = ({ isOpen, param, onClose, onSave }) => {
  const [value, setValue] = useState('');
  const [date, setDate]   = useState(todayYmd());

  const numVal  = parseFloat(value);
  const isHigh  = !isNaN(numVal) && !!param && numVal > param.refMax;
  const isLow   = !isNaN(numVal) && !!param && param.refMin != null && numVal < param.refMin;
  const isValid = value !== '' && !isNaN(numVal) && !!date;

  const handleSave = () => {
    if (!isValid || !param) return;
    onSave(param.id, { id: crypto.randomUUID(), date, value: numVal });
    setValue('');
    setDate(todayYmd());
    onClose();
  };

  const borderClass = isHigh
    ? 'border-vital-critical-border focus-within:border-vital-critical'
    : isLow
    ? 'border-vital-low-border focus-within:border-vital-low'
    : 'border-line focus-within:border-accent';

  const hintClass = isHigh ? 'text-vital-critical-fg' : isLow ? 'text-vital-low-fg' : 'text-ink-faint';

  const hintText = isHigh
    ? `↑ Above normal (>${param?.refMax})`
    : isLow
    ? `↓ Below normal (<${param?.refMin})`
    : param
    ? `Normal range: ${param.refMin != null ? `${param.refMin}–` : '<'}${param.refMax} ${param.unit}`
    : '';

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="p-5 space-y-4 pb-8">
        <h3 className="text-base font-semibold text-ink">Add {param?.name} entry</h3>

        <div className="space-y-1">
          <label className="text-[10px] font-medium tracking-widest uppercase text-ink-muted">
            Value ({param?.unit})
          </label>
          <div className={`flex items-center bg-surface-card border rounded-xl overflow-hidden
                           focus-within:ring-2 focus-within:ring-accent/20 transition-all ${borderClass}`}>
            <input
              type="number"
              inputMode="decimal"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="0.0"
              autoFocus
              className="flex-1 px-4 py-3 text-2xl font-bold font-mono outline-none bg-transparent text-ink"
            />
            <span className="px-4 text-sm text-ink-faint font-medium">{param?.unit}</span>
          </div>
          <p className={`text-[10px] font-medium ${hintClass}`}>{hintText}</p>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-medium tracking-widest uppercase text-ink-muted">
            Date of test
          </label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            max={todayYmd()}
            className="w-full bg-surface-card border border-line rounded-xl px-4 py-2.5
                       text-sm font-semibold text-ink focus:outline-none
                       focus:ring-2 focus:ring-accent/20 focus:border-accent"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={!isValid}
          className="w-full py-3 bg-accent hover:bg-accent-pressed disabled:opacity-40
                     text-white font-semibold rounded-xl transition-colors"
        >
          Save entry
        </button>
      </div>
    </BottomSheet>
  );
};

// ─── Lab Chart Card ───────────────────────────────────────────────────────────
const LabChartCard: React.FC<{
  param: LabParam;
  entries: LabEntry[];
  onAddEntry: (paramId: string) => void;
}> = ({ param, entries, onAddEntry }) => {
  const latest = entries[entries.length - 1];
  const prev   = entries[entries.length - 2];

  const isHigh   = !!latest && latest.value > param.refMax;
  const isLow    = !!latest && param.refMin != null && latest.value < param.refMin;
  const isNormal = !!latest && !isHigh && !isLow;

  const trendDir = prev && latest
    ? latest.value < prev.value ? 'down'
    : latest.value > prev.value ? 'up'
    : 'flat'
    : null;

  const strokeColor = isHigh ? 'var(--color-vital-critical)' : isLow ? 'var(--color-vital-low)' : 'var(--color-vital-normal)';
  const borderClass = isHigh ? 'border-vital-critical-border' : isLow ? 'border-vital-low-border' : 'border-line';
  const valueClass  = isHigh ? 'text-vital-critical-fg' : isLow ? 'text-vital-low-fg' : 'text-ink';

  const refAreaY1 = param.refMin ?? 0;
  const refAreaY2 = param.refMax;

  const TrendIcon = trendDir === 'down' ? TrendingDown : trendDir === 'up' ? TrendingUp : Minus;
  // down = improving toward/within normal range, up = worsening — reuse the vital-* semantics
  // rather than brand teal, so trend color means the same thing everywhere in the app.
  const trendColor = trendDir === 'down' ? 'text-vital-normal' : trendDir === 'up' ? 'text-vital-critical' : 'text-ink-faint';

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <div className={`bg-surface-card rounded-xl border p-3 flex flex-col gap-1 ${borderClass}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide">
          {param.name}
        </span>
        <div className="flex items-center gap-1">
          {isHigh   && <span className="text-[9px] font-bold bg-vital-critical-surface text-vital-critical-fg border border-vital-critical-border px-1.5 py-0.5 rounded-full">HIGH</span>}
          {isLow    && <span className="text-[9px] font-bold bg-vital-low-surface text-vital-low-fg border border-vital-low-border px-1.5 py-0.5 rounded-full">LOW</span>}
          {isNormal && <span className="text-[9px] font-bold bg-vital-normal-surface text-vital-normal-fg border border-vital-normal-border px-1.5 py-0.5 rounded-full">NL</span>}
          {!latest  && <span className="text-[9px] font-bold bg-surface-sunken text-ink-faint px-1.5 py-0.5 rounded-full">No data</span>}
        </div>
      </div>

      {/* Value row */}
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold font-mono leading-none ${valueClass}`}>
          {latest ? latest.value : '—'}
        </span>
        <span className="text-[10px] text-ink-faint">{param.unit}</span>
        {trendDir && (
          <span className={`ml-1 ${trendColor}`}>
            <TrendIcon className="w-3.5 h-3.5 inline" />
          </span>
        )}
      </div>

      {/* Chart */}
      <div className="h-[72px] -mx-1">
        {entries.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={entries} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`grad-${param.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={strokeColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0}    />
                </linearGradient>
              </defs>
              <ReferenceArea y1={refAreaY1} y2={refAreaY2} fill="var(--color-vital-normal-surface)" fillOpacity={0.8} strokeOpacity={0} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 8, fill: 'var(--color-ink-muted)' }}
                tickFormatter={fmtDate}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ fontSize: 11, padding: '4px 8px', borderRadius: 8, border: '0.5px solid var(--color-line)' }}
                formatter={(v) => [`${v} ${param.unit}`, param.name]}
                labelFormatter={(d) => fmtDate(String(d))}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={strokeColor}
                strokeWidth={1.5}
                fill={`url(#grad-${param.id})`}
                dot={{ r: 3, fill: strokeColor, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-1 text-ink-faint">
            <Activity className="w-5 h-5" />
            <p className="text-[10px] text-ink-faint">
              {entries.length === 0 ? 'No entries yet' : 'Need 2+ entries for chart'}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-1">
        <span className="text-[9px] text-ink-faint font-mono">
          Ref: {param.refMin != null ? `${param.refMin}–` : '<'}{param.refMax} {param.unit}
        </span>
        <button
          onClick={() => onAddEntry(param.id)}
          className="flex items-center gap-1 text-[10px] font-semibold text-accent-fg
                     hover:text-accent-pressed transition-colors"
        >
          <Plus className="w-3 h-3" /> Add entry
        </button>
      </div>
    </div>
  );
};

// ─── Patient Picker ───────────────────────────────────────────────────────────
const PatientPicker: React.FC<{
  patients: Patient[];
  selectedId: string;
  onSelect: (id: string) => void;
}> = ({ patients, selectedId, onSelect }) => {
  const [search, setSearch] = useState('');
  const [open, setOpen]     = useState(false);

  const filtered = useMemo(() =>
    patients.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.ipNo.includes(search) ||
      p.bed.includes(search),
    ), [patients, search]);

  const selected = patients.find(p => p.ipNo === selectedId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 bg-surface-card border border-line rounded-xl
                   px-4 py-3 text-left hover:border-accent transition-colors"
      >
        {selected ? (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{selected.name}</p>
              <p className="text-[11px] text-ink-faint">Bed {selected.bed} · IP: {selected.ipNo}</p>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <Search className="w-4 h-4 text-ink-faint" />
            <span className="text-sm text-ink-faint">Search patient…</span>
          </div>
        )}
        <ChevronDown className={`w-4 h-4 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-surface-card border border-line
                        rounded-xl shadow-xl z-30 max-h-64 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-line">
            <div className="flex items-center gap-2 bg-surface rounded-lg px-3 py-2">
              <Search className="w-3.5 h-3.5 text-ink-faint shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Name, bed or IP no."
                className="flex-1 text-sm bg-transparent outline-none text-ink placeholder:text-ink-faint"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <p className="text-center text-xs text-ink-faint py-6">No patients found</p>
            ) : (
              filtered.map(p => (
                <button
                  key={p.ipNo}
                  onClick={() => { onSelect(p.ipNo); setOpen(false); setSearch(''); }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left
                              hover:bg-accent-soft transition-colors ${p.ipNo === selectedId ? 'bg-accent-soft' : ''}`}
                >
                  <div className="w-8 h-8 rounded-lg bg-surface-sunken flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold font-mono text-ink-muted">{p.bed}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{p.name}</p>
                    <p className="text-[10px] text-ink-faint">IP: {p.ipNo} · {p.ward}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const LabTrends: React.FC<Props> = ({ patients, onAddResult, initialPatientId = '' }) => {
  const [selectedId, setSelectedId] = useState(initialPatientId);
  const [sheetParam, setSheetParam] = useState<LabParam | null>(null);

  const selectedPatient = patients.find(p => p.ipNo === selectedId);

  const entriesByParam = useMemo(() => {
    const results = selectedPatient?.labResults ?? [];
    const map: Record<string, LabEntry[]> = {};
    for (const param of LAB_PARAMS) {
      map[param.id] = results
        .filter(r => r.type.toUpperCase() === param.name)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(r => ({ id: r.id, date: r.date, value: r.value }));
    }
    return map;
  }, [selectedPatient]);

  const handleSaveEntry = (paramId: string, entry: LabEntry) => {
    if (!selectedPatient) return;
    const param = LAB_PARAMS.find(p => p.id === paramId);
    if (!param) return;
    onAddResult(selectedPatient.ipNo, {
      id: entry.id,
      date: entry.date,
      type: param.name,
      value: entry.value,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Patient picker */}
      <div className="bg-surface-card rounded-xl border border-line p-4 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint mb-2">
          Select Patient
        </p>
        <PatientPicker
          patients={patients}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {!selectedPatient ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-surface
                        rounded-xl border-2 border-dashed border-line p-16 text-center">
          <Activity className="w-10 h-10 text-ink-faint mb-3" />
          <p className="text-sm font-semibold text-ink-muted">Select a patient above</p>
          <p className="text-xs text-ink-faint mt-1">Lab trends will appear here</p>
        </div>
      ) : (
        <>
          {/* Patient header */}
          <div className="bg-accent rounded-xl p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{selectedPatient.name}</p>
              <p className="text-[11px] text-white/70 mt-0.5">
                {selectedPatient.age}y {selectedPatient.gender} · Bed {selectedPatient.bed} · IP: {selectedPatient.ipNo}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-white/70">{selectedPatient.ward}</p>
              <p className="text-[10px] text-white font-semibold mt-0.5">
                {Object.values(entriesByParam).reduce((n, e) => n + e.length, 0)} entries
              </p>
            </div>
          </div>

          {/* 2×2 chart grid */}
          <div className="grid grid-cols-2 gap-3">
            {LAB_PARAMS.map(param => (
              <LabChartCard
                key={param.id}
                param={param}
                entries={entriesByParam[param.id] ?? []}
                onAddEntry={id => setSheetParam(LAB_PARAMS.find(p => p.id === id) ?? null)}
              />
            ))}
          </div>

          {/* Add investigation hook */}
          <button className="w-full py-3 border-2 border-dashed border-line rounded-xl
                             text-xs font-semibold text-ink-faint hover:border-accent
                             hover:text-accent-fg transition-colors flex items-center justify-center gap-2">
            <Plus className="w-3.5 h-3.5" /> Add investigation
          </button>
        </>
      )}

      {/* Add entry bottom sheet */}
      <AddEntrySheet
        isOpen={!!sheetParam}
        param={sheetParam}
        onClose={() => setSheetParam(null)}
        onSave={handleSaveEntry}
      />
    </div>
  );
};

export default LabTrends;
