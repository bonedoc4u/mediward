/**
 * ScoringTools.tsx
 * Clinical scoring calculators: GCS, CHA₂DS₂-VASc, CURB-65, eGFR, Child-Pugh, MELD
 * Rendered as a sheet/modal from PatientDetail or SpecialtyDataPanel.
 */
import React, { useState } from 'react';
import { X, Calculator, ChevronRight } from 'lucide-react';
import BottomSheetPicker from './ui/BottomSheetPicker';

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
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${val === o.v ? 'bg-teal-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400'}`}>
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
            className="w-4 h-4 rounded text-teal-600" />
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
            className="w-4 h-4 rounded text-teal-600" />
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
            className={`px-3 py-1.5 rounded-lg text-sm border ${val === o.v ? 'bg-teal-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}>
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

// ─── NIHSS ────────────────────────────────────────────────────────────────────
function NIHSSCalculator() {
  const items: { key: string; label: string; opts: { v: number; l: string }[] }[] = [
    { key: '1a', label: '1a — Level of Consciousness', opts: [{ v: 0, l: 'Alert' }, { v: 1, l: 'Not alert, arousable' }, { v: 2, l: 'Not alert, obtunded' }, { v: 3, l: 'Unresponsive' }] },
    { key: '1b', label: '1b — LOC Questions (month/age)', opts: [{ v: 0, l: 'Both correct' }, { v: 1, l: 'One correct' }, { v: 2, l: 'Neither correct' }] },
    { key: '1c', label: '1c — LOC Commands (grip/eyes)', opts: [{ v: 0, l: 'Both correct' }, { v: 1, l: 'One correct' }, { v: 2, l: 'Neither correct' }] },
    { key: '2', label: '2 — Best Gaze', opts: [{ v: 0, l: 'Normal' }, { v: 1, l: 'Partial gaze palsy' }, { v: 2, l: 'Forced deviation' }] },
    { key: '3', label: '3 — Visual Fields', opts: [{ v: 0, l: 'No loss' }, { v: 1, l: 'Partial hemianopia' }, { v: 2, l: 'Complete hemianopia' }, { v: 3, l: 'Bilateral hemianopia / blind' }] },
    { key: '4', label: '4 — Facial Palsy', opts: [{ v: 0, l: 'Normal' }, { v: 1, l: 'Minor paralysis' }, { v: 2, l: 'Partial paralysis' }, { v: 3, l: 'Complete paralysis' }] },
    { key: '5a', label: '5a — Left Arm Motor', opts: [{ v: 0, l: 'No drift' }, { v: 1, l: 'Drift before 10 s' }, { v: 2, l: 'Falls before 10 s' }, { v: 3, l: 'No effort against gravity' }, { v: 4, l: 'No movement' }] },
    { key: '5b', label: '5b — Right Arm Motor', opts: [{ v: 0, l: 'No drift' }, { v: 1, l: 'Drift before 10 s' }, { v: 2, l: 'Falls before 10 s' }, { v: 3, l: 'No effort against gravity' }, { v: 4, l: 'No movement' }] },
    { key: '6a', label: '6a — Left Leg Motor', opts: [{ v: 0, l: 'No drift' }, { v: 1, l: 'Drift before 5 s' }, { v: 2, l: 'Falls before 5 s' }, { v: 3, l: 'No effort against gravity' }, { v: 4, l: 'No movement' }] },
    { key: '6b', label: '6b — Right Leg Motor', opts: [{ v: 0, l: 'No drift' }, { v: 1, l: 'Drift before 5 s' }, { v: 2, l: 'Falls before 5 s' }, { v: 3, l: 'No effort against gravity' }, { v: 4, l: 'No movement' }] },
    { key: '7', label: '7 — Limb Ataxia', opts: [{ v: 0, l: 'Absent' }, { v: 1, l: 'Present in one limb' }, { v: 2, l: 'Present in two limbs' }] },
    { key: '8', label: '8 — Sensory', opts: [{ v: 0, l: 'Normal' }, { v: 1, l: 'Mild-moderate loss' }, { v: 2, l: 'Severe or total loss' }] },
    { key: '9', label: '9 — Best Language', opts: [{ v: 0, l: 'No aphasia' }, { v: 1, l: 'Mild-moderate aphasia' }, { v: 2, l: 'Severe aphasia' }, { v: 3, l: 'Mute / global aphasia' }] },
    { key: '10', label: '10 — Dysarthria', opts: [{ v: 0, l: 'Normal' }, { v: 1, l: 'Mild-moderate' }, { v: 2, l: 'Severe / mute' }] },
    { key: '11', label: '11 — Extinction / Inattention', opts: [{ v: 0, l: 'No abnormality' }, { v: 1, l: 'Inattention in one modality' }, { v: 2, l: 'Profound inattention / hemi-neglect' }] },
  ];
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(items.map(i => [i.key, 0])));
  const total = Object.values(vals).reduce((s, v) => s + v, 0);
  const severity = total === 0 ? { label: 'No stroke symptoms', color: 'bg-green-50 text-green-700' }
    : total <= 4 ? { label: 'Minor stroke', color: 'bg-green-50 text-green-700' }
    : total <= 15 ? { label: 'Moderate stroke', color: 'bg-amber-50 text-amber-700' }
    : total <= 20 ? { label: 'Moderate-severe stroke', color: 'bg-orange-50 text-orange-700' }
    : { label: 'Severe stroke', color: 'bg-red-50 text-red-700' };

  return (
    <div className="space-y-4">
      {items.map(item => (
        <div key={item.key}>
          <p className="text-sm font-semibold text-slate-700 mb-1">{item.label}</p>
          <BottomSheetPicker
            title={item.label}
            value={vals[item.key].toString()}
            options={item.opts.map(o => ({ value: o.v.toString(), label: `${o.v} — ${o.l}` }))}
            onChange={v => setVals(p => ({ ...p, [item.key]: parseInt(v) }))}
          />
        </div>
      ))}
      <div className={`rounded-xl p-4 ${severity.color}`}>
        <p className="text-2xl font-black">NIHSS: {total} / 42</p>
        <p className="text-sm font-semibold">{severity.label}</p>
        <p className="text-xs mt-1 opacity-75">0=None · 1-4=Minor · 5-15=Moderate · 16-20=Mod-severe · 21-42=Severe</p>
      </div>
    </div>
  );
}

// ─── APACHE II ────────────────────────────────────────────────────────────────
function APACHE2Calculator() {
  const [temp, setTemp] = useState('');
  const [map, setMap] = useState('');
  const [hr, setHr] = useState('');
  const [rr, setRr] = useState('');
  const [fio2, setFio2] = useState('');
  const [pao2, setPao2] = useState('');
  const [aaDo2, setAaDo2] = useState('');
  const [pH, setPH] = useState('');
  const [na, setNa] = useState('');
  const [k, setK] = useState('');
  const [creatinine, setCreatinine] = useState('');
  const [arf, setArf] = useState(false);
  const [hematocrit, setHematocrit] = useState('');
  const [wbc, setWbc] = useState('');
  const [gcs, setGcs] = useState('15');
  const [ageVal, setAgeVal] = useState('');
  const [chronicPoints, setChronicPoints] = useState(0);

  const compute = (): { aps: number; age: number; chronic: number; total: number } | null => {
    const t = parseFloat(temp);
    const m = parseFloat(map);
    const h = parseFloat(hr);
    const r = parseFloat(rr);
    const fi = parseFloat(fio2);
    const ph = parseFloat(pH);
    const sodium = parseFloat(na);
    const potassium = parseFloat(k);
    const cr = parseFloat(creatinine);
    const hct = parseFloat(hematocrit);
    const w = parseFloat(wbc);
    const g = parseInt(gcs, 10);
    const a = parseFloat(ageVal);

    if ([t, m, h, r, ph, sodium, potassium, cr, hct, w, g, a].some(isNaN)) return null;

    // Temperature (°C)
    const tPts = t >= 41 ? 4 : t >= 39 ? 3 : t >= 38.5 ? 1 : t >= 36 ? 0 : t >= 34 ? 1 : t >= 32 ? 2 : t >= 30 ? 3 : 4;
    // MAP
    const mPts = m >= 160 ? 4 : m >= 130 ? 3 : m >= 110 ? 2 : m >= 70 ? 0 : m >= 50 ? 2 : 4;
    // HR
    const hPts = h >= 180 ? 4 : h >= 140 ? 3 : h >= 110 ? 2 : h >= 70 ? 0 : h >= 55 ? 2 : h >= 40 ? 3 : 4;
    // RR
    const rPts = r >= 50 ? 4 : r >= 35 ? 3 : r >= 25 ? 1 : r >= 12 ? 0 : r >= 10 ? 1 : r >= 6 ? 2 : 4;
    // Oxygenation
    let oPts = 0;
    if (!isNaN(fi)) {
      if (fi >= 0.5) {
        const aa = parseFloat(aaDo2);
        oPts = isNaN(aa) ? 0 : aa >= 500 ? 4 : aa >= 350 ? 3 : aa >= 200 ? 2 : 0;
      } else {
        const po = parseFloat(pao2);
        oPts = isNaN(po) ? 0 : po > 70 ? 0 : po >= 61 ? 1 : po >= 55 ? 3 : 4;
      }
    }
    // pH
    const phPts = ph >= 7.7 ? 4 : ph >= 7.6 ? 3 : ph >= 7.5 ? 1 : ph >= 7.33 ? 0 : ph >= 7.25 ? 2 : ph >= 7.15 ? 3 : 4;
    // Sodium
    const naPts = sodium >= 180 ? 4 : sodium >= 160 ? 3 : sodium >= 155 ? 2 : sodium >= 150 ? 1 : sodium >= 130 ? 0 : sodium >= 120 ? 2 : sodium >= 111 ? 3 : 4;
    // Potassium
    const kPts = potassium >= 7 ? 4 : potassium >= 6 ? 3 : potassium >= 5.5 ? 1 : potassium >= 3.5 ? 0 : potassium >= 3 ? 1 : potassium >= 2.5 ? 2 : 4;
    // Creatinine (×2 if ARF)
    const crBase = cr >= 3.5 ? 4 : cr >= 2 ? 3 : cr >= 1.5 ? 2 : cr >= 0.6 ? 0 : 2;
    const crPts = arf ? crBase * 2 : crBase;
    // Hematocrit
    const hctPts = hct >= 60 ? 4 : hct >= 50 ? 2 : hct >= 46 ? 1 : hct >= 30 ? 0 : hct >= 20 ? 2 : 4;
    // WBC ×10³
    const wPts = w >= 40 ? 4 : w >= 20 ? 2 : w >= 15 ? 1 : w >= 3 ? 0 : w >= 1 ? 2 : 4;
    // GCS (15 - actual GCS)
    const gcsPts = 15 - g;

    const aps = tPts + mPts + hPts + rPts + oPts + phPts + naPts + kPts + crPts + hctPts + wPts + gcsPts;

    const agePts = a < 45 ? 0 : a <= 54 ? 2 : a <= 64 ? 3 : a <= 74 ? 5 : 6;

    return { aps, age: agePts, chronic: chronicPoints, total: aps + agePts + chronicPoints };
  };

  const result = compute();
  const riskTable = (s: number) =>
    s <= 4 ? '~4%' : s <= 9 ? '~8%' : s <= 14 ? '~15%' : s <= 19 ? '~25%' : s <= 24 ? '~40%' : s <= 29 ? '~55%' : s <= 34 ? '~73%' : '~85%';

  const numInput = (label: string, val: string, set: (s: string) => void, ph: string) => (
    <div key={label}>
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      <input type="number" value={val} onChange={e => set(e.target.value)} placeholder={ph}
        className="mt-0.5 w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Acute Physiology Parameters</p>
      <div className="grid grid-cols-2 gap-2">
        {numInput('Temperature (°C)', temp, setTemp, '37.0')}
        {numInput('MAP (mmHg)', map, setMap, '90')}
        {numInput('Heart Rate (bpm)', hr, setHr, '80')}
        {numInput('Respiratory Rate (/min)', rr, setRr, '16')}
        {numInput('FiO₂ (0.21–1.0)', fio2, setFio2, '0.21')}
        {parseFloat(fio2) >= 0.5
          ? numInput('A-aDO₂ (mmHg)', aaDo2, setAaDo2, '200')
          : numInput('PaO₂ (mmHg)', pao2, setPao2, '90')}
        {numInput('Arterial pH', pH, setPH, '7.40')}
        {numInput('Serum Na (mEq/L)', na, setNa, '140')}
        {numInput('Serum K (mEq/L)', k, setK, '4.0')}
        {numInput('Creatinine (mg/dL)', creatinine, setCreatinine, '1.0')}
        {numInput('Haematocrit (%)', hematocrit, setHematocrit, '40')}
        {numInput('WBC (×10³/μL)', wbc, setWbc, '8')}
        {numInput('GCS (actual)', gcs, setGcs, '15')}
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={arf} onChange={e => setArf(e.target.checked)} className="w-4 h-4 rounded" />
        <span className="text-sm text-slate-700">Acute Renal Failure (doubles creatinine score)</span>
      </label>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-2">Age</p>
      {numInput('Age (years)', ageVal, setAgeVal, '50')}
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-2">Chronic Health Points</p>
      <div className="flex gap-2 flex-wrap">
        {[{ v: 0, l: 'None' }, { v: 2, l: 'Elective post-op (+2)' }, { v: 5, l: 'Non-op / Emergency post-op (+5)' }].map(o => (
          <button key={o.v} onClick={() => setChronicPoints(o.v)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${chronicPoints === o.v ? 'bg-teal-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}>
            {o.l}
          </button>
        ))}
      </div>
      {result && (
        <div className={`rounded-xl p-4 ${result.total >= 25 ? 'bg-red-50 text-red-700' : result.total >= 15 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
          <p className="text-2xl font-black">APACHE II: {result.total}</p>
          <p className="text-sm font-semibold">Predicted ICU mortality: {riskTable(result.total)}</p>
          <p className="text-xs mt-1 opacity-75">APS {result.aps} + Age {result.age} + Chronic {result.chronic}</p>
        </div>
      )}
    </div>
  );
}

// ─── SOFA ─────────────────────────────────────────────────────────────────────
function SOFACalculator() {
  const [resp, setResp] = useState(0);
  const [coag, setCoag] = useState(0);
  const [liver, setLiver] = useState(0);
  const [cardio, setCardio] = useState(0);
  const [cns, setCns] = useState(0);
  const [renal, setRenal] = useState(0);
  const total = resp + coag + liver + cardio + cns + renal;
  const interp = total <= 6 ? { label: 'Low risk', color: 'bg-green-50 text-green-700' }
    : total <= 9 ? { label: '~14% mortality', color: 'bg-amber-50 text-amber-700' }
    : total <= 12 ? { label: '~40% mortality', color: 'bg-orange-50 text-orange-700' }
    : total <= 14 ? { label: '~50% mortality', color: 'bg-red-50 text-red-700' }
    : total <= 17 ? { label: '>80% mortality', color: 'bg-red-50 text-red-700' }
    : { label: '>90% mortality', color: 'bg-red-50 text-red-700' };

  const sel = (label: string, val: number, set: (n: number) => void, opts: { v: number; l: string }[]) => (
    <div key={label}>
      <p className="text-sm font-semibold text-slate-700 mb-1">{label}</p>
      <BottomSheetPicker
        title={label}
        value={val.toString()}
        options={opts.map(o => ({ value: o.v.toString(), label: `${o.v} — ${o.l}` }))}
        onChange={v => set(parseInt(v))}
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {sel('Respiration (PaO₂/FiO₂)', resp, setResp, [
        { v: 0, l: '>400' }, { v: 1, l: '300–400' }, { v: 2, l: '200–299' },
        { v: 3, l: '100–199 + ventilation' }, { v: 4, l: '<100 + ventilation' },
      ])}
      {sel('Coagulation (Platelets ×10³/μL)', coag, setCoag, [
        { v: 0, l: '>150' }, { v: 1, l: '101–150' }, { v: 2, l: '51–100' },
        { v: 3, l: '21–50' }, { v: 4, l: '≤20' },
      ])}
      {sel('Liver (Bilirubin mg/dL)', liver, setLiver, [
        { v: 0, l: '<1.2' }, { v: 1, l: '1.2–1.9' }, { v: 2, l: '2.0–5.9' },
        { v: 3, l: '6.0–11.9' }, { v: 4, l: '≥12' },
      ])}
      {sel('Cardiovascular (MAP / vasopressors)', cardio, setCardio, [
        { v: 0, l: 'MAP ≥70 mmHg' }, { v: 1, l: 'MAP <70 mmHg' },
        { v: 2, l: 'Dopamine ≤5 or Dobutamine (any)' },
        { v: 3, l: 'Dopamine >5 or Noradrenaline ≤0.1 μg/kg/min' },
        { v: 4, l: 'Dopamine >15 or Noradrenaline >0.1 μg/kg/min' },
      ])}
      {sel('CNS (GCS)', cns, setCns, [
        { v: 0, l: 'GCS 15' }, { v: 1, l: 'GCS 13–14' }, { v: 2, l: 'GCS 10–12' },
        { v: 3, l: 'GCS 6–9' }, { v: 4, l: 'GCS <6' },
      ])}
      {sel('Renal (Creatinine mg/dL or urine output)', renal, setRenal, [
        { v: 0, l: 'Creat <1.2' }, { v: 1, l: 'Creat 1.2–1.9' }, { v: 2, l: 'Creat 2.0–3.4' },
        { v: 3, l: 'Creat 3.5–4.9 or UO <500 mL/day' }, { v: 4, l: 'Creat ≥5 or UO <200 mL/day' },
      ])}
      <div className={`rounded-xl p-4 ${interp.color}`}>
        <p className="text-2xl font-black">SOFA: {total} / 24</p>
        <p className="text-sm font-semibold">{interp.label}</p>
        <p className="text-xs mt-1 opacity-75">Each organ system scored 0–4</p>
      </div>
    </div>
  );
}

// ─── GRACE Score ──────────────────────────────────────────────────────────────
function GRACECalculator() {
  const [age, setAge] = useState(0);
  const [hrPts, setHrPts] = useState(0);
  const [sbpPts, setSbpPts] = useState(0);
  const [creatPts, setCreatPts] = useState(0);
  const [killip, setKillip] = useState(0);
  const [arrest, setArrest] = useState(false);
  const [stDev, setStDev] = useState(false);
  const [markers, setMarkers] = useState(false);

  const total = age + hrPts + sbpPts + creatPts + killip + (arrest ? 43 : 0) + (stDev ? 30 : 0) + (markers ? 15 : 0);
  const risk = total < 109 ? { label: '<1% in-hospital death risk (low)', color: 'bg-green-50 text-green-700' }
    : total <= 140 ? { label: '1–3% in-hospital death risk (intermediate)', color: 'bg-amber-50 text-amber-700' }
    : { label: '>3% in-hospital death risk (high)', color: 'bg-red-50 text-red-700' };

  const sel = (label: string, val: number, set: (n: number) => void, opts: { v: number; l: string }[]) => (
    <div key={label}>
      <p className="text-sm font-semibold text-slate-700 mb-1">{label}</p>
      <BottomSheetPicker
        title={label}
        value={val.toString()}
        options={opts.map(o => ({ value: o.v.toString(), label: `${o.l} (${o.v} pts)` }))}
        onChange={v => set(parseInt(v))}
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {sel('Age', age, setAge, [
        { v: 0, l: '<40' }, { v: 18, l: '40–49' }, { v: 36, l: '50–59' },
        { v: 55, l: '60–69' }, { v: 73, l: '70–79' }, { v: 91, l: '≥80' },
      ])}
      {sel('Heart Rate (bpm)', hrPts, setHrPts, [
        { v: 0, l: '<70' }, { v: 7, l: '70–89' }, { v: 13, l: '90–109' },
        { v: 23, l: '110–149' }, { v: 36, l: '150–199' }, { v: 46, l: '≥200' },
      ])}
      {sel('Systolic BP (mmHg)', sbpPts, setSbpPts, [
        { v: 63, l: '<80' }, { v: 58, l: '80–99' }, { v: 47, l: '100–119' },
        { v: 37, l: '120–139' }, { v: 26, l: '140–159' }, { v: 11, l: '160–199' }, { v: 0, l: '≥200' },
      ])}
      {sel('Creatinine (mg/dL)', creatPts, setCreatPts, [
        { v: 2, l: '0–0.39' }, { v: 5, l: '0.4–0.79' }, { v: 8, l: '0.8–1.19' },
        { v: 11, l: '1.2–1.59' }, { v: 14, l: '1.6–1.99' }, { v: 23, l: '2.0–3.99' }, { v: 31, l: '≥4' },
      ])}
      {sel('Killip Class', killip, setKillip, [
        { v: 0, l: 'I — No heart failure' }, { v: 21, l: 'II — Rales, JVD, S3' },
        { v: 43, l: 'III — Frank pulmonary oedema' }, { v: 64, l: 'IV — Cardiogenic shock' },
      ])}
      {[
        { label: 'Cardiac Arrest at Admission (+43)', val: arrest, set: setArrest },
        { label: 'ST-Segment Deviation (+30)', val: stDev, set: setStDev },
        { label: 'Elevated Cardiac Markers (+15)', val: markers, set: setMarkers },
      ].map(({ label, val, set }) => (
        <label key={label} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-blue-300">
          <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} className="w-4 h-4 rounded text-teal-600" />
          <span className="text-sm text-slate-700">{label}</span>
        </label>
      ))}
      <div className={`rounded-xl p-4 ${risk.color}`}>
        <p className="text-2xl font-black">GRACE: {total}</p>
        <p className="text-sm font-semibold">{risk.label}</p>
        <p className="text-xs mt-1 opacity-75">&lt;109 low · 110–140 intermediate · &gt;140 high</p>
      </div>
    </div>
  );
}

// ─── mRS ──────────────────────────────────────────────────────────────────────
function MRSCalculator() {
  const grades = [
    { v: 0, l: 'No symptoms', desc: 'Completely asymptomatic' },
    { v: 1, l: 'No significant disability', desc: 'Can do all usual activities despite symptoms' },
    { v: 2, l: 'Slight disability', desc: 'Cannot do all previous activities but independent in self-care' },
    { v: 3, l: 'Moderate disability', desc: 'Requires some help but can walk without assistance' },
    { v: 4, l: 'Moderately severe disability', desc: 'Cannot walk or attend to bodily needs without assistance' },
    { v: 5, l: 'Severe disability', desc: 'Bedridden, incontinent, requires constant nursing care' },
    { v: 6, l: 'Dead', desc: '' },
  ];
  const [grade, setGrade] = useState(0);
  const color = grade <= 2 ? 'bg-green-50 text-green-700'
    : grade <= 4 ? 'bg-amber-50 text-amber-700'
    : grade === 5 ? 'bg-red-50 text-red-700'
    : 'bg-slate-800 text-white';
  const selected = grades[grade];

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-1">Select mRS Grade</p>
        <BottomSheetPicker
          title="Modified Rankin Scale"
          value={grade.toString()}
          options={grades.map(g => ({ value: g.v.toString(), label: `${g.v} — ${g.l}` }))}
          onChange={v => setGrade(parseInt(v))}
        />
      </div>
      <div className={`rounded-xl p-4 ${color}`}>
        <p className="text-2xl font-black">mRS Grade {grade}</p>
        <p className="text-sm font-semibold">{selected.l}</p>
        {selected.desc && <p className="text-xs mt-1 opacity-75">{selected.desc}</p>}
      </div>
    </div>
  );
}

// ─── ECOG ─────────────────────────────────────────────────────────────────────
function ECOGCalculator() {
  const grades = [
    { v: 0, l: 'Fully active', desc: 'No restriction on activities' },
    { v: 1, l: 'Restricted in strenuous activity', desc: 'Ambulatory and able to carry out light work' },
    { v: 2, l: 'Ambulatory, no work capacity', desc: '>50% of waking hours up; self-care only' },
    { v: 3, l: 'Limited self-care', desc: '>50% of waking hours in bed or chair' },
    { v: 4, l: 'Completely disabled', desc: 'No self-care; confined to bed or chair' },
    { v: 5, l: 'Dead', desc: '' },
  ];
  const [grade, setGrade] = useState(0);
  const colors = ['bg-green-50 text-green-700', 'bg-lime-50 text-lime-700', 'bg-amber-50 text-amber-700', 'bg-orange-50 text-orange-700', 'bg-red-50 text-red-700', 'bg-slate-800 text-white'];
  const selected = grades[grade];

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-1">Select ECOG Grade</p>
        <BottomSheetPicker
          title="ECOG Performance Status"
          value={grade.toString()}
          options={grades.map(g => ({ value: g.v.toString(), label: `${g.v} — ${g.l}` }))}
          onChange={v => setGrade(parseInt(v))}
        />
      </div>
      <div className={`rounded-xl p-4 ${colors[grade]}`}>
        <p className="text-2xl font-black">ECOG Grade {grade}</p>
        <p className="text-sm font-semibold">{selected.l}</p>
        {selected.desc && <p className="text-xs mt-1 opacity-75">{selected.desc}</p>}
      </div>
    </div>
  );
}

// ─── PHQ-9 ────────────────────────────────────────────────────────────────────
function PHQ9Calculator() {
  const questions = [
    'Little interest or pleasure in doing things',
    'Feeling down, depressed, or hopeless',
    'Trouble falling/staying asleep, or sleeping too much',
    'Feeling tired or having little energy',
    'Poor appetite or overeating',
    'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
    'Trouble concentrating on things, such as reading the newspaper or watching television',
    'Moving or speaking so slowly that other people could have noticed. Or the opposite — so fidgety or restless',
    'Thoughts that you would be better off dead, or of hurting yourself',
  ];
  const [vals, setVals] = useState<number[]>(Array(9).fill(0));
  const total = vals.reduce((s, v) => s + v, 0);
  const severity = total === 0 ? { label: 'None', color: 'bg-slate-50 text-slate-700' }
    : total <= 4 ? { label: 'Minimal depression', color: 'bg-green-50 text-green-700' }
    : total <= 9 ? { label: 'Mild depression', color: 'bg-green-50 text-green-700' }
    : total <= 14 ? { label: 'Moderate depression', color: 'bg-amber-50 text-amber-700' }
    : total <= 19 ? { label: 'Moderately severe depression', color: 'bg-orange-50 text-orange-700' }
    : { label: 'Severe depression', color: 'bg-red-50 text-red-700' };
  const q9Alert = vals[8] >= 1;
  const optLabels = ['Not at all', 'Several days', 'More than half', 'Nearly every day'];

  return (
    <div className="space-y-3">
      {questions.map((q, i) => (
        <div key={i} className={i === 8 ? 'p-2 border border-red-200 rounded-lg bg-red-50' : ''}>
          <p className="text-sm font-semibold text-slate-700 mb-1">{i + 1}. {q}</p>
          <BottomSheetPicker
            title={`Q${i + 1}`}
            value={vals[i].toString()}
            options={optLabels.map((l, v) => ({ value: v.toString(), label: `${v} — ${l}` }))}
            onChange={v => setVals(p => { const n = [...p]; n[i] = parseInt(v); return n; })}
          />
        </div>
      ))}
      {q9Alert && (
        <div className="rounded-lg p-3 bg-red-100 border border-red-400 text-red-800 text-sm font-semibold">
          Warning: Q9 positive — Consider immediate safety assessment
        </div>
      )}
      <div className={`rounded-xl p-4 ${severity.color}`}>
        <p className="text-2xl font-black">PHQ-9: {total} / 27</p>
        <p className="text-sm font-semibold">{severity.label}</p>
        <p className="text-xs mt-1 opacity-75">1-4 Minimal · 5-9 Mild · 10-14 Moderate · 15-19 Mod-severe · 20-27 Severe</p>
      </div>
    </div>
  );
}

// ─── GAD-7 ────────────────────────────────────────────────────────────────────
function GAD7Calculator() {
  const questions = [
    'Feeling nervous, anxious, or on edge',
    'Not being able to stop or control worrying',
    'Worrying too much about different things',
    'Trouble relaxing',
    'Being so restless that it is hard to sit still',
    'Becoming easily annoyed or irritable',
    'Feeling afraid as if something awful might happen',
  ];
  const [vals, setVals] = useState<number[]>(Array(7).fill(0));
  const total = vals.reduce((s, v) => s + v, 0);
  const severity = total < 5 ? { label: 'Minimal / no anxiety', color: 'bg-green-50 text-green-700' }
    : total <= 9 ? { label: 'Mild anxiety', color: 'bg-green-50 text-green-700' }
    : total <= 14 ? { label: 'Moderate anxiety', color: 'bg-amber-50 text-amber-700' }
    : { label: 'Severe anxiety', color: 'bg-red-50 text-red-700' };
  const optLabels = ['Not at all', 'Several days', 'More than half', 'Nearly every day'];

  return (
    <div className="space-y-3">
      {questions.map((q, i) => (
        <div key={i}>
          <p className="text-sm font-semibold text-slate-700 mb-1">{i + 1}. {q}</p>
          <BottomSheetPicker
            title={`Q${i + 1}`}
            value={vals[i].toString()}
            options={optLabels.map((l, v) => ({ value: v.toString(), label: `${v} — ${l}` }))}
            onChange={v => setVals(p => { const n = [...p]; n[i] = parseInt(v); return n; })}
          />
        </div>
      ))}
      <div className={`rounded-xl p-4 ${severity.color}`}>
        <p className="text-2xl font-black">GAD-7: {total} / 21</p>
        <p className="text-sm font-semibold">{severity.label}</p>
        <p className="text-xs mt-1 opacity-75">5-9 Mild · 10-14 Moderate · 15-21 Severe</p>
      </div>
    </div>
  );
}

// ─── Glasgow-Blatchford Score ─────────────────────────────────────────────────
function BlatchfordCalculator() {
  const [bun, setBun] = useState(0);
  const [hbMale, setHbMale] = useState(0);
  const [hbFemale, setHbFemale] = useState(0);
  const [isFemale, setIsFemale] = useState(false);
  const [sbpPts, setSbpPts] = useState(0);
  const [pulse100, setPulse100] = useState(false);
  const [melena, setMelena] = useState(false);
  const [syncope, setSyncope] = useState(false);
  const [hepatic, setHepatic] = useState(false);
  const [cardiac, setCardiac] = useState(false);

  const hbPts = isFemale ? hbFemale : hbMale;
  const total = bun + hbPts + sbpPts + (pulse100 ? 1 : 0) + (melena ? 1 : 0) + (syncope ? 2 : 0) + (hepatic ? 2 : 0) + (cardiac ? 2 : 0);

  const risk = total === 0 ? { label: 'Low risk — outpatient management possible', color: 'bg-green-50 text-green-700' }
    : total < 6 ? { label: 'Needs intervention / admission', color: 'bg-amber-50 text-amber-700' }
    : { label: 'High risk — major haemorrhage likely', color: 'bg-red-50 text-red-700' };

  const sel = (label: string, val: number, set: (n: number) => void, opts: { v: number; l: string }[]) => (
    <div key={label}>
      <p className="text-sm font-semibold text-slate-700 mb-1">{label}</p>
      <BottomSheetPicker
        title={label}
        value={val.toString()}
        options={opts.map(o => ({ value: o.v.toString(), label: `${o.l} (+${o.v})` }))}
        onChange={v => set(parseInt(v))}
      />
    </div>
  );

  return (
    <div className="space-y-3">
      {sel('BUN (mmol/L)', bun, setBun, [
        { v: 0, l: '<6.5' }, { v: 2, l: '6.5–7.9' }, { v: 3, l: '8.0–9.9' },
        { v: 4, l: '10.0–24.9' }, { v: 6, l: '≥25' },
      ])}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={isFemale} onChange={e => setIsFemale(e.target.checked)} className="w-4 h-4 rounded" />
        <span className="text-sm text-slate-700">Female patient</span>
      </label>
      {!isFemale && sel('Haemoglobin — Male (g/dL)', hbMale, setHbMale, [
        { v: 0, l: '≥13' }, { v: 1, l: '12–12.9' }, { v: 3, l: '10–11.9' }, { v: 6, l: '<10' },
      ])}
      {isFemale && sel('Haemoglobin — Female (g/dL)', hbFemale, setHbFemale, [
        { v: 0, l: '≥12' }, { v: 1, l: '10–11.9' }, { v: 6, l: '<10' },
      ])}
      {sel('Systolic BP (mmHg)', sbpPts, setSbpPts, [
        { v: 0, l: '≥110' }, { v: 1, l: '100–109' }, { v: 2, l: '90–99' }, { v: 3, l: '<90' },
      ])}
      {[
        { label: 'Pulse ≥100 bpm (+1)', val: pulse100, set: setPulse100 },
        { label: 'Melena (+1)', val: melena, set: setMelena },
        { label: 'Syncope (+2)', val: syncope, set: setSyncope },
        { label: 'Hepatic disease (+2)', val: hepatic, set: setHepatic },
        { label: 'Cardiac failure (+2)', val: cardiac, set: setCardiac },
      ].map(({ label, val, set }) => (
        <label key={label} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-blue-300">
          <input type="checkbox" checked={val} onChange={e => set(e.target.checked)} className="w-4 h-4 rounded text-teal-600" />
          <span className="text-sm text-slate-700">{label}</span>
        </label>
      ))}
      <div className={`rounded-xl p-4 ${risk.color}`}>
        <p className="text-2xl font-black">Blatchford: {total}</p>
        <p className="text-sm font-semibold">{risk.label}</p>
        <p className="text-xs mt-1 opacity-75">0=low risk · ≥1=needs intervention · ≥6=high risk</p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
type ToolKey = 'gcs' | 'cha2ds2' | 'curb65' | 'egfr' | 'childpugh' | 'meld' | 'nihss' | 'apache2' | 'sofa' | 'grace' | 'mrs' | 'ecog' | 'phq9' | 'gad7' | 'blatchford';

const TOOLS: { key: ToolKey; label: string; subtitle: string; dept: string }[] = [
  { key: 'gcs',        label: 'GCS',             subtitle: 'Glasgow Coma Scale',         dept: 'Neuro / ICU / Emergency' },
  { key: 'nihss',      label: 'NIHSS',            subtitle: 'Stroke Severity (0–42)',     dept: 'Neurology / Neurosurgery / Emergency' },
  { key: 'mrs',        label: 'mRS',              subtitle: 'Modified Rankin Scale',      dept: 'Neurology / Stroke' },
  { key: 'apache2',    label: 'APACHE II',        subtitle: 'ICU Mortality Prediction',   dept: 'ICU / HDU' },
  { key: 'sofa',       label: 'SOFA',             subtitle: 'Organ Failure Assessment',   dept: 'ICU / HDU' },
  { key: 'cha2ds2',    label: 'CHA₂DS₂-VASc',    subtitle: 'AF Stroke Risk',             dept: 'Cardiology' },
  { key: 'grace',      label: 'GRACE',            subtitle: 'ACS In-Hospital Mortality',  dept: 'Cardiology' },
  { key: 'curb65',     label: 'CURB-65',          subtitle: 'Pneumonia Severity',         dept: 'Pulmonology / Medicine' },
  { key: 'egfr',       label: 'eGFR',             subtitle: 'CKD-EPI 2021',              dept: 'Nephrology / All depts' },
  { key: 'childpugh',  label: 'Child-Pugh',       subtitle: 'Cirrhosis Severity',         dept: 'Gastroenterology' },
  { key: 'meld',       label: 'MELD / MELD-Na',   subtitle: 'Liver Disease Mortality',    dept: 'Gastroenterology' },
  { key: 'blatchford', label: 'Blatchford',       subtitle: 'Upper GI Bleed Risk',        dept: 'Gastroenterology / Emergency' },
  { key: 'ecog',       label: 'ECOG',             subtitle: 'Performance Status',         dept: 'Oncology / All depts' },
  { key: 'phq9',       label: 'PHQ-9',            subtitle: 'Depression Screening',       dept: 'Psychiatry / All depts' },
  { key: 'gad7',       label: 'GAD-7',            subtitle: 'Anxiety Screening',          dept: 'Psychiatry / All depts' },
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
            <Calculator className="w-5 h-5 text-teal-600" />
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
                    <p className="text-xs text-teal-600 mt-0.5">{t.dept}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              ))}
            </div>
          ) : (
            <div>
              {active === 'gcs'        && <GCSCalculator />}
              {active === 'nihss'      && <NIHSSCalculator />}
              {active === 'mrs'        && <MRSCalculator />}
              {active === 'apache2'    && <APACHE2Calculator />}
              {active === 'sofa'       && <SOFACalculator />}
              {active === 'cha2ds2'    && <CHA2DS2VAScCalculator />}
              {active === 'grace'      && <GRACECalculator />}
              {active === 'curb65'     && <CURB65Calculator />}
              {active === 'egfr'       && <EGFRCalculator />}
              {active === 'childpugh'  && <ChildPughCalculator />}
              {active === 'meld'       && <MELDCalculator />}
              {active === 'blatchford' && <BlatchfordCalculator />}
              {active === 'ecog'       && <ECOGCalculator />}
              {active === 'phq9'       && <PHQ9Calculator />}
              {active === 'gad7'       && <GAD7Calculator />}
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
