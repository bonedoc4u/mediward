import React, { useState, useMemo } from 'react';
import { Patient, LabResult, LabTypeConfig } from '../types';
import { useConfig } from '../contexts/AppContext';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { Activity, Plus, TrendingDown, TrendingUp, Minus, Search, ChevronDown } from 'lucide-react';
import { todayYmd } from '../utils/dates';

interface Props {
  patients: Patient[];
  onAddResult: (patientId: string, result: LabResult) => void;
  initialPatientId?: string;
}

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
  param: LabTypeConfig | null;
  onClose: () => void;
  onSave: (paramId: string, entry: LabEntry) => void;
}> = ({ isOpen, param, onClose, onSave }) => {
  const [value, setValue] = useState('');
  const [date, setDate]   = useState(todayYmd());

  const numVal  = parseFloat(value);
  const isHigh  = !isNaN(numVal) && !!param && param.alertHigh !== null && numVal > param.alertHigh;
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
    : 'border-line focus-within:border-accent';

  const hintClass = isHigh ? 'text-vital-critical-fg' : 'text-ink-faint';

  const hintText = isHigh
    ? `↑ Above alert threshold (>${param?.alertHigh})`
    : param?.alertHigh != null
    ? `Alert threshold: >${param.alertHigh} ${param.unit}`
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
  param: LabTypeConfig;
  entries: LabEntry[];
  onAddEntry: (paramId: string) => void;
}> = ({ param, entries, onAddEntry }) => {
  const latest = entries[entries.length - 1];
  const prev   = entries[entries.length - 2];

  const isHigh   = !!latest && param.alertHigh !== null && latest.value > param.alertHigh;
  const isNormal = !!latest && !isHigh;

  const trendDir = prev && latest
    ? latest.value < prev.value ? 'down'
    : latest.value > prev.value ? 'up'
    : 'flat'
    : null;

  const strokeColor = isHigh ? 'var(--color-vital-critical)' : 'var(--color-vital-normal)';
  const borderClass = isHigh ? 'border-vital-critical-border' : 'border-line';
  const valueClass  = isHigh ? 'text-vital-critical-fg' : 'text-ink';

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
              {param.alertHigh !== null && (
                <ReferenceLine y={param.alertHigh} stroke="var(--color-vital-critical)" strokeDasharray="3 3" strokeOpacity={0.6} />
              )}
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
          {param.alertHigh !== null ? `Alert: >${param.alertHigh} ${param.unit}` : 'No alert threshold'}
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
  const { labTypesByCategory } = useConfig();
  const [selectedId, setSelectedId] = useState(initialPatientId);
  const [sheetParam, setSheetParam] = useState<LabTypeConfig | null>(null);

  const selectedPatient = patients.find(p => p.ipNo === selectedId);

  // All active lab types this hospital has configured (Admin Settings → Lab
  // Type Configuration), grouped by category — not a hardcoded list, so a
  // newly-added lab type appears here immediately, matching what Admin
  // Settings already tells the user to expect.
  const allLabTypes = useMemo(
    () => Array.from(labTypesByCategory.values()).flat(),
    [labTypesByCategory],
  );

  const entriesByParam = useMemo(() => {
    const results = selectedPatient?.labResults ?? [];
    const map: Record<string, LabEntry[]> = {};
    for (const param of allLabTypes) {
      map[param.id] = results
        .filter(r => r.type === param.name)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(r => ({ id: r.id, date: r.date, value: r.value }));
    }
    return map;
  }, [selectedPatient, allLabTypes]);

  const handleSaveEntry = (paramId: string, entry: LabEntry) => {
    if (!selectedPatient) return;
    const param = allLabTypes.find(p => p.id === paramId);
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

          {/* Chart grid, grouped by category */}
          {allLabTypes.length === 0 ? (
            <div className="bg-surface rounded-xl border-2 border-dashed border-line p-8 text-center">
              <p className="text-sm font-semibold text-ink-muted">No lab types configured yet</p>
              <p className="text-xs text-ink-faint mt-1">Add one in Admin Settings → Lab Type Configuration</p>
            </div>
          ) : (
            Array.from(labTypesByCategory.entries()).map(([category, params]) => (
              <div key={category} className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint">{category}</p>
                <div className="grid grid-cols-2 gap-3">
                  {params.map(param => (
                    <LabChartCard
                      key={param.id}
                      param={param}
                      entries={entriesByParam[param.id] ?? []}
                      onAddEntry={id => setSheetParam(allLabTypes.find(p => p.id === id) ?? null)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
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
