/**
 * ScoringTools.tsx
 * Clinical scoring calculators: GCS, CHA₂DS₂-VASc, CURB-65, eGFR, Child-Pugh, MELD
 * Rendered as a sheet/modal from PatientDetail or SpecialtyDataPanel.
 */
import React, { useState } from 'react';
import { X, Calculator, ChevronRight } from 'lucide-react';

// ─── GCS ─────────────────────────────────────────────────────────────────────
function GCSCalculator() {
  const [eye, setEye] = useState(4);
  const [verbal, setVerbal] = useState(5);
  const [motor, setMotor] = useState(6);
  const total = eye + verbal + motor;
  const severity = total <= 8 ? { label: 'Severe', color: 'text-red-600 bg-red-50' }
    : total <= 12 ? { label: 'Moderate', color: 'text-amber-600 bg-amber-50' }
    : { label: 'Mild / Normal', color: 'text-green-600 bg-green-50' };

  const eyeOptions = [
    { v: 1, label: 'None' }, { v: 2, label: 'To pain' },
    { v: 3, label: 'To voice' }, { v: 4, label: 'Spontaneous' },
  ];
  const verbalOptions = [
    { v: 1, label: 'None' }, { v: 2, label: 'Sounds' }, { v: 3, label: 'Words' },
    { v: 4, label: 'Confused' }, { v: 5, label: 'Oriented' },
  ];
  const motorOptions = [
    { v: 1, label: 'None' }, { v: 2, label: 'Extension' }, { v: 3, label: 'Flexion (abnormal)' },
    { v: 4, label: 'Withdrawal' }, { v: 5, label: 'Localises' }, { v: 6, label: 'Obeys' },
  ];

  return (
    <div className="space-y-4">
      {[
        { label: 'Eye Opening (E)', opts: eyeOptions, val: eye, set: setEye },
        { label: 'Verbal Response (V)', opts: verbalOptions, val: verbal, set: setVerbal },
        { label: 'Motor Response (M)', opts: motorOptions, val: motor, set: setMotor },
      ].map(({ label, opts, val, set }) => (
        <div key={label}>
          <p className="text-sm font-semibold text-slate-700 mb-1">{label}</p>
          <div className="flex flex-wrap gap-2">
            {opts.map(o => (
              <button key={o.v} onClick={() => set(o.v)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${val === o.v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400'}`}>
                {o.v} — {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className={`rounded-xl p-4 flex items-center justify-between ${severity.color}`}>
        <div>
          <p className="text-2xl font-black">GCS {total}/15</p>
          <p className="text-sm font-semibold">{severity.label} TBI</p>
        </div>
        <div className="text-right text-sm opacity-75">E{eye} V{verbal} M{motor}</div>
      </div>
    </div>
  );
}

// ─── CHA₂DS₂-VASc ────────────────────────────────────────────────────────────
function CHA2DS2VAScCalculator() {
  const factors = [
    { key: 'chf', label: 'Congestive Heart Failure', points: 1 },
    { key: 'htn', label: 'Hypertension', points: 1 },
    { key: 'age75', label: 'Age ≥ 75 years', points: 2 },
    { key: 'dm', label: 'Diabetes Mellitus', points: 1 },
    { key: 'stroke', label: 'Prior Stroke / TIA / Thromboembolism', points: 2 },
    { key: 'vascular', label: 'Vascular Disease (MI, PAD, aortic plaque)', points: 1 },
    { key: 'age65', label: 'Age 65–74 years', points: 1 },
    { key: 'female', label: 'Female Sex Category', points: 1 },
  ];
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const score = factors.reduce((s, f) => s + (checked[f.key] ? f.points : 0), 0);
  const risk = score === 0 ? 'Low (no anticoagulation)' : score === 1 ? 'Low-moderate (consider anticoagulation)' : 'High — anticoagulate';
  const strokeRisk = ['0%', '1.3%', '2.2%', '3.2%', '4.0%', '6.7%', '9.8%', '9.6%', '12.5%', '15.2%'];

  return (
    <div className="space-y-3">
      {factors.map(f => (
        <label key={f.key} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-blue-300">
          <input type="checkbox" checked={!!checked[f.key]}
            onChange={e => setChecked(p => ({ ...p, [f.key]: e.target.checked }))}
            className="w-4 h-4 rounded text-blue-600" />
          <span className="flex-1 text-sm text-slate-700">{f.label}</span>
          <span className="text-xs font-bold text-slate-500">+{f.points}</span>
        </label>
      ))}
      <div className={`rounded-xl p-4 ${score >= 2 ? 'bg-red-50 text-red-700' : score === 1 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
        <p className="text-2xl font-black">Score: {score}</p>
        <p className="text-sm font-semibold">{risk}</p>
        <p className="text-xs mt-1 opacity-75">Annual stroke risk: {strokeRisk[Math.min(score, 9)]}</p>
      </div>
    </div>
  );
}

// ─── CURB-65 ──────────────────────────────────────────────────────────────────
function CURB65Calculator() {
  const criteria = [
    { key: 'confusion', label: 'Confusion (new onset)' },
    { key: 'urea', label: 'Urea > 7 mmol/L (BUN > 19 mg/dL)' },
    { key: 'rr', label: 'Respiratory Rate ≥ 30/min' },
    { key: 'bp', label: 'BP: Systolic < 90 or Diastolic ≤ 60 mmHg' },
    { key: 'age', label: 'Age ≥ 65 years' },
  ];
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const score = criteria.filter(c => checked[c.key]).length;
  const severity = score <= 1 ? { label: 'Low severity — consider outpatient', color: 'bg-green-50 text-green-700' }
    : score === 2 ? { label: 'Moderate — hospital admission', color: 'bg-amber-50 text-amber-700' }
    : { label: 'Severe — consider ICU', color: 'bg-red-50 text-red-700' };
  const mortality = ['0.6%', '2.7%', '6.8%', '14.0%', '27.8%', '27.8%'];

  return (
    <div className="space-y-3">
      {criteria.map(c => (
        <label key={c.key} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-blue-300">
          <input type="checkbox" checked={!!checked[c.key]}
            onChange={e => setChecked(p => ({ ...p, [c.key]: e.target.checked }))}
            className="w-4 h-4 rounded text-blue-600" />
          <span className="text-sm text-slate-700">{c.label}</span>
        </label>
      ))}
      <div className={`rounded-xl p-4 ${severity.color}`}>
        <p className="text-2xl font-black">CURB-65: {score}/5</p>
        <p className="text-sm font-semibold">{severity.label}</p>
        <p className="text-xs mt-1 opacity-75">30-day mortality: {mortality[score]}</p>
      </div>
    </div>
  );
}

// ─── eGFR (CKD-EPI 2021) ─────────────────────────────────────────────────────
function EGFRCalculator() {
  const [creatinine, setCreatinine] = useState('');
  const [age, setAge] = useState('');
  const [female, setFemale] = useState(false);

  const egfr = (() => {
    const cr = parseFloat(creatinine);
    const a = parseInt(age, 10);
    if (!cr || !a || cr <= 0 || a <= 0) return null;
    const kappa = female ? 0.7 : 0.9;
    const alpha = female ? -0.241 : -0.302;
    const ratio = cr / kappa;
    const val = 142 * Math.pow(Math.min(ratio, 1), alpha) * Math.pow(Math.max(ratio, 1), -1.200) * Math.pow(0.9938, a) * (female ? 1.012 : 1);
    return Math.round(val);
  })();

  const stage = !egfr ? null
    : egfr >= 90 ? { label: 'G1 — Normal or high', color: 'bg-green-50 text-green-700' }
    : egfr >= 60 ? { label: 'G2 — Mildly decreased', color: 'bg-green-50 text-green-700' }
    : egfr >= 45 ? { label: 'G3a — Mildly-moderately decreased', color: 'bg-amber-50 text-amber-700' }
    : egfr >= 30 ? { label: 'G3b — Moderately-severely decreased', color: 'bg-amber-50 text-amber-700' }
    : egfr >= 15 ? { label: 'G4 — Severely decreased', color: 'bg-red-50 text-red-700' }
    : { label: 'G5 — Kidney failure', color: 'bg-red-50 text-red-700' };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-semibold text-slate-700">Creatinine (mg/dL)</label>
          <input type="number" value={creatinine} onChange={e => setCreatinine(e.target.value)} placeholder="e.g. 1.2"
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700">Age (years)</label>
          <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="e.g. 55"
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={female} onChange={e => setFemale(e.target.checked)} className="w-4 h-4 rounded" />
        <span className="text-sm text-slate-700">Female</span>
      </label>
      {egfr && stage && (
        <div className={`rounded-xl p-4 ${stage.color}`}>
          <p className="text-2xl font-black">eGFR: {egfr} mL/min/1.73m²</p>
          <p className="text-sm font-semibold">{stage.label}</p>
          <p className="text-xs mt-1 opacity-75">CKD-EPI 2021 equation</p>
        </div>
      )}
    </div>
  );
}

// ─── Child-Pugh ───────────────────────────────────────────────────────────────
function ChildPughCalculator() {
  const [bilirubin, setBilirubin] = useState(1);
  const [albumin, setAlbumin] = useState(1);
  const [inr, setInr] = useState(1);
  const [ascites, setAscites] = useState(1);
  const [encephalopathy, setEncephalopathy] = useState(1);
  const score = bilirubin + albumin + inr + ascites + encephalopathy;
  const cls = score <= 6 ? { cls: 'A', label: '1-year survival 100%, 2-year 85%', color: 'bg-green-50 text-green-700' }
    : score <= 9 ? { cls: 'B', label: '1-year survival 81%, 2-year 57%', color: 'bg-amber-50 text-amber-700' }
    : { cls: 'C', label: '1-year survival 45%, 2-year 35%', color: 'bg-red-50 text-red-700' };

  const sel = (label: string, val: number, set: (n: number) => void, opts: { v: number; l: string }[]) => (
    <div key={label}>
      <p className="text-sm font-semibold text-slate-700 mb-1">{label}</p>
      <div className="flex gap-2 flex-wrap">
        {opts.map(o => (
          <button key={o.v} onClick={() => set(o.v)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${val === o.v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}>
            {o.l} ({o.v}pt)
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {sel('Bilirubin', bilirubin, setBilirubin, [{ v: 1, l: '<2 mg/dL' }, { v: 2, l: '2–3' }, { v: 3, l: '>3' }])}
      {sel('Albumin', albumin, setAlbumin, [{ v: 1, l: '>3.5 g/dL' }, { v: 2, l: '2.8–3.5' }, { v: 3, l: '<2.8' }])}
      {sel('INR / PT', inr, setInr, [{ v: 1, l: '<1.7' }, { v: 2, l: '1.7–2.3' }, { v: 3, l: '>2.3' }])}
      {sel('Ascites', ascites, setAscites, [{ v: 1, l: 'None' }, { v: 2, l: 'Mild (diuretics)' }, { v: 3, l: 'Moderate–Severe' }])}
      {sel('Encephalopathy', encephalopathy, setEncephalopathy, [{ v: 1, l: 'None' }, { v: 2, l: 'Grade I–II' }, { v: 3, l: 'Grade III–IV' }])}
      <div className={`rounded-xl p-4 ${cls.color}`}>
        <p className="text-2xl font-black">Child-Pugh Class {cls.cls} (Score {score})</p>
        <p className="text-sm font-semibold">{cls.label}</p>
      </div>
    </div>
  );
}

// ─── MELD ─────────────────────────────────────────────────────────────────────
function MELDCalculator() {
  const [creatinine, setCreatinine] = useState('');
  const [bilirubin, setBilirubin] = useState('');
  const [inr, setInr] = useState('');
  const [sodium, setSodium] = useState('');

  const meld = (() => {
    const cr = Math.min(Math.max(parseFloat(creatinine) || 0, 1), 4);
    const bili = Math.max(parseFloat(bilirubin) || 0, 1);
    const i = Math.max(parseFloat(inr) || 0, 1);
    if (!cr || !bili || !i) return null;
    return Math.round(10 * (0.957 * Math.log(cr) + 0.378 * Math.log(bili) + 1.120 * Math.log(i) + 0.643));
  })();

  const meldNa = (() => {
    if (!meld) return null;
    const na = Math.min(Math.max(parseFloat(sodium) || 125, 125), 137);
    return Math.round(meld - na - (0.025 * meld * (140 - na)) + 140);
  })();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Creatinine (mg/dL)', val: creatinine, set: setCreatinine, ph: '1.0' },
          { label: 'Bilirubin (mg/dL)', val: bilirubin, set: setBilirubin, ph: '1.2' },
          { label: 'INR', val: inr, set: setInr, ph: '1.1' },
          { label: 'Sodium (mEq/L)', val: sodium, set: setSodium, ph: '138' },
        ].map(f => (
          <div key={f.label}>
            <label className="text-sm font-semibold text-slate-700">{f.label}</label>
            <input type="number" value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        ))}
      </div>
      {meld !== null && (
        <div className={`rounded-xl p-4 ${meld >= 25 ? 'bg-red-50 text-red-700' : meld >= 15 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
          <p className="text-2xl font-black">MELD: {meld}{meldNa ? ` / MELD-Na: ${meldNa}` : ''}</p>
          <p className="text-sm font-semibold">
            {meld >= 25 ? '3-month mortality >50% — urgent transplant evaluation'
              : meld >= 15 ? 'Significant mortality risk — transplant listing consideration'
              : 'Lower acuity'}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
type ToolKey = 'gcs' | 'cha2ds2' | 'curb65' | 'egfr' | 'childpugh' | 'meld';

const TOOLS: { key: ToolKey; label: string; subtitle: string; dept: string }[] = [
  { key: 'gcs', label: 'GCS', subtitle: 'Glasgow Coma Scale', dept: 'Neuro / ICU / Emergency' },
  { key: 'cha2ds2', label: 'CHA₂DS₂-VASc', subtitle: 'AF Stroke Risk', dept: 'Cardiology' },
  { key: 'curb65', label: 'CURB-65', subtitle: 'Pneumonia Severity', dept: 'Pulmonology / Med' },
  { key: 'egfr', label: 'eGFR', subtitle: 'CKD-EPI 2021', dept: 'Nephrology / All depts' },
  { key: 'childpugh', label: 'Child-Pugh', subtitle: 'Cirrhosis Severity', dept: 'Gastroenterology' },
  { key: 'meld', label: 'MELD / MELD-Na', subtitle: 'Liver Disease Mortality', dept: 'Gastroenterology' },
];

interface Props {
  onClose: () => void;
  initialTool?: ToolKey;
}

const ScoringTools: React.FC<Props> = ({ onClose, initialTool }) => {
  const [active, setActive] = useState<ToolKey | null>(initialTool ?? null);

  return (
    <div className="fixed inset-0 z-[350] flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 sm:p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            {active && (
              <button onClick={() => setActive(null)} className="p-1 hover:bg-slate-100 rounded-lg mr-1">
                <ChevronRight className="w-4 h-4 rotate-180 text-slate-500" />
              </button>
            )}
            <Calculator className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-slate-900">
              {active ? TOOLS.find(t => t.key === active)?.label : 'Clinical Scoring Tools'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Close scoring tools">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          {!active ? (
            <div className="grid grid-cols-1 gap-2">
              {TOOLS.map(t => (
                <button key={t.key} onClick={() => setActive(t.key)}
                  className="flex items-center justify-between p-4 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl text-left transition-colors">
                  <div>
                    <p className="font-bold text-slate-900">{t.label}</p>
                    <p className="text-sm text-slate-500">{t.subtitle}</p>
                    <p className="text-xs text-blue-600 mt-0.5">{t.dept}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              ))}
            </div>
          ) : (
            <div>
              {active === 'gcs' && <GCSCalculator />}
              {active === 'cha2ds2' && <CHA2DS2VAScCalculator />}
              {active === 'curb65' && <CURB65Calculator />}
              {active === 'egfr' && <EGFRCalculator />}
              {active === 'childpugh' && <ChildPughCalculator />}
              {active === 'meld' && <MELDCalculator />}
            </div>
          )}
        </div>

        <div className="px-4 pb-4 pt-2 border-t border-slate-100 shrink-0">
          <p className="text-xs text-slate-400 text-center">For clinical decision support only — verify with treating physician</p>
        </div>
      </div>
    </div>
  );
};

export default ScoringTools;
export type { ToolKey };
