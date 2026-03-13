import React, { useState, useEffect } from 'react';
import { useConfig, useAuth } from '../contexts/AppContext';
import { WardConfig, LabTypeConfig, MedicationConfig, SpecialtyFieldGroup, SpecialtyField } from '../types';
import { Plus, Pencil, Trash2, Save, X, BedDouble, Activity, FlaskConical, ShieldAlert, UserCheck, Building2, Layers, ClipboardList, Link2, Globe, Server, Radio, CheckCircle2, AlertTriangle, XCircle, Pill, RefreshCw, LayoutTemplate, ChevronDown, ChevronUp, RotateCcw, ToggleRight, UserX, Download } from 'lucide-react';
import { anonymizePatient, exportPatientData } from '../services/patientService';
import { SPECIALTY_DISPLAY_NAMES } from '../services/specialtyTemplates';
import { createIncident, updateIncidentStatus, deleteIncident, fetchIncidents, StatusIncident, IncidentSeverity, IncidentStatus } from '../services/statusService';

// ─── Department presets ───
const DEPARTMENT_PRESETS = [
  { label: 'Orthopaedics',          department: 'DEPARTMENT OF ORTHOPAEDICS',            units: ['OR1','OR2','OR3','OR4','OR5'], preOpModuleName: 'PAC Status',   procedureListName: 'OT List',        preOpChecklistTemplate: ['Consent','Pre-OP Order','Inj. Cefuroxime','Part Preparation (Shave)','Pre-OP X-Ray','C-Sample (Cross Match)','CBD (Catheter)','Implant Order','Things / Materials'] },
  { label: 'General Surgery',       department: 'DEPARTMENT OF GENERAL SURGERY',          units: ['GS1','GS2','GS3','GS4','GS5'], preOpModuleName: 'PAC Status',   procedureListName: 'OT List',        preOpChecklistTemplate: ['Consent','Pre-OP Order','Inj. Antibiotics','Part Preparation','Pre-OP X-Ray','Blood Group & Hold','CBD (Catheter)','Diathermy Setup','Instruments Ready'] },
  { label: 'Neurosurgery',          department: 'DEPARTMENT OF NEUROSURGERY',             units: ['NS1','NS2','NS3'],              preOpModuleName: 'PAC Status',   procedureListName: 'OT List',        preOpChecklistTemplate: ['Consent','Pre-OP Order','Inj. Antibiotics','Part Preparation (Head)','Pre-OP Imaging','Blood Group & Hold','CBD (Catheter)','Neuromonitoring Setup','Instruments Ready'] },
  { label: 'Cardiothoracic Surgery', department: 'DEPARTMENT OF CARDIOTHORACIC SURGERY',  units: ['CT1','CT2','CT3'],              preOpModuleName: 'PAC Status',   procedureListName: 'OT List',        preOpChecklistTemplate: ['Consent','Pre-OP Order','Inj. Antibiotics','ECG','Echocardiogram','Chest X-Ray','Blood Group & Hold','CBD (Catheter)','Bypass Machine Ready'] },
  { label: 'Gynaecology & Obs',     department: 'DEPARTMENT OF GYNAECOLOGY & OBSTETRICS', units: ['GY1','GY2','GY3','GY4'],       preOpModuleName: 'PAC Status',   procedureListName: 'OT List',        preOpChecklistTemplate: ['Consent','Pre-OP Order','Inj. Antibiotics','Part Preparation','Pre-OP Ultrasound','Blood Group & Hold','CBD (Catheter)','Oxytocin Ready'] },
  { label: 'ENT',                   department: 'DEPARTMENT OF ENT',                     units: ['EN1','EN2','EN3'],              preOpModuleName: 'PAC Status',   procedureListName: 'OT List',        preOpChecklistTemplate: ['Consent','Pre-OP Order','Inj. Antibiotics','Part Preparation','Pre-OP Audiometry','Blood Group & Hold','Tracheostomy Tray','ENT Instruments'] },
  { label: 'Ophthalmology',         department: 'DEPARTMENT OF OPHTHALMOLOGY',            units: ['OP1','OP2','OP3'],              preOpModuleName: 'PAC Status',   procedureListName: 'OT List',        preOpChecklistTemplate: ['Consent','Pre-OP Order','Eye Drops Administered','Pupil Dilation','Blood Group & Hold','IV Line','Ophthalmic Instruments'] },
  { label: 'Urology',               department: 'DEPARTMENT OF UROLOGY',                 units: ['UR1','UR2','UR3'],              preOpModuleName: 'PAC Status',   procedureListName: 'OT List',        preOpChecklistTemplate: ['Consent','Pre-OP Order','Inj. Antibiotics','Part Preparation','Urine Culture Result','Blood Group & Hold','CBD (Catheter)','Urological Instruments'] },
  { label: 'Medicine',              department: 'DEPARTMENT OF MEDICINE',                units: ['MD1','MD2','MD3','MD4','MD5'], preOpModuleName: 'Pre-admission', procedureListName: 'Procedure List', preOpChecklistTemplate: ['Consent','Medications Reviewed','IV Line','Blood Group & Hold','ECG','NPO Status Confirmed'] },
  { label: 'Cardiology',            department: 'DEPARTMENT OF CARDIOLOGY',              units: ['CL1','CL2','CL3','CL4'],        preOpModuleName: 'Pre-admission', procedureListName: 'Procedure List', preOpChecklistTemplate: ['Consent','Medications Reviewed','IV Line','Blood Group & Hold','ECG','Echocardiogram','NPO Status Confirmed','Cath Lab Notified'] },
  { label: 'Neurology',             department: 'DEPARTMENT OF NEUROLOGY',               units: ['NL1','NL2','NL3'],              preOpModuleName: 'Pre-admission', procedureListName: 'Procedure List', preOpChecklistTemplate: ['Consent','Medications Reviewed','IV Line','Blood Group & Hold','ECG','Neuroimaging','NPO Status Confirmed'] },
  { label: 'Paediatrics',           department: 'DEPARTMENT OF PAEDIATRICS',             units: ['PD1','PD2','PD3','PD4'],        preOpModuleName: 'Pre-admission', procedureListName: 'Procedure List', preOpChecklistTemplate: ['Consent (Guardian)','Medications Reviewed','IV Line','Blood Group & Hold','Weight Checked','NPO Status Confirmed'] },
  { label: 'Psychiatry',            department: 'DEPARTMENT OF PSYCHIATRY',              units: ['PS1','PS2','PS3'],              preOpModuleName: 'Pre-admission', procedureListName: 'Procedure List', preOpChecklistTemplate: ['Consent','Medications Reviewed','IV Line','Blood Group & Hold','ECG','Risk Assessment'] },
  { label: 'Dermatology',           department: 'DEPARTMENT OF DERMATOLOGY',             units: ['DM1','DM2'],                   preOpModuleName: 'Pre-admission', procedureListName: 'Procedure List', preOpChecklistTemplate: ['Consent','Medications Reviewed','IV Line','Blood Group & Hold','Allergy Check'] },
];

// ─── Inline editable row for a ward ───
const WardRow: React.FC<{ ward: WardConfig; unitOptions: string[]; onSave: (w: WardConfig) => void; onDelete: (id: string) => void }> = ({ ward, unitOptions, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ward);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    try { await onSave(draft); setEditing(false); } finally { setBusy(false); }
  };

  if (!editing) {
    return (
      <tr className="border-b last:border-0 hover:bg-slate-50">
        <td className="px-4 py-3 font-medium text-slate-800">{ward.name}</td>
        <td className="px-4 py-3 text-center">
          {ward.unit?.length
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
              className="p-1.5 hover:bg-slate-200 rounded text-slate-500 hover:text-blue-600 transition-colors">
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
          className="w-full p-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap gap-1.5">
          {unitOptions.map(u => {
            const checked = draft.unit?.includes(u) ?? false;
            return (
              <label key={u} className={`flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer border text-xs font-semibold transition-colors ${checked ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
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
        </div>
      </td>
      <td className="px-4 py-2">
        <input type="number" value={draft.sortOrder} onChange={e => setDraft(d => ({ ...d, sortOrder: parseInt(e.target.value) || 0 }))}
          className="w-16 p-1 border border-blue-300 rounded text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-400" />
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
            className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50">
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

// ─── Inline editable row for a lab type ───
const LabRow: React.FC<{ lab: LabTypeConfig; onSave: (l: LabTypeConfig) => void; onDelete: (id: string) => void }> = ({ lab, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lab);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    try { await onSave(draft); setEditing(false); } finally { setBusy(false); }
  };

  if (!editing) {
    return (
      <tr className="border-b last:border-0 hover:bg-slate-50">
        <td className="px-4 py-3 font-medium text-slate-800">{lab.name}</td>
        <td className="px-4 py-3 text-slate-600">{lab.unit || '—'}</td>
        <td className="px-4 py-3 text-slate-600">
          {lab.alertHigh !== null
            ? <span className="text-red-600 font-medium">&gt; {lab.alertHigh}</span>
            : <span className="text-slate-400">None</span>}
        </td>
        <td className="px-4 py-3">
          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">{lab.category}</span>
        </td>
        <td className="px-4 py-3 text-center">{lab.sortOrder}</td>
        <td className="px-4 py-3 text-center">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${lab.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {lab.active ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <button onClick={() => { setDraft(lab); setEditing(true); }}
              className="p-1.5 hover:bg-slate-200 rounded text-slate-500 hover:text-blue-600 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(lab.id)}
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
          className="w-full p-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </td>
      <td className="px-4 py-2">
        <input value={draft.unit} onChange={e => setDraft(d => ({ ...d, unit: e.target.value }))}
          placeholder="mg/dL"
          className="w-20 p-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </td>
      <td className="px-4 py-2">
        <input type="number" value={draft.alertHigh ?? ''} placeholder="None"
          onChange={e => setDraft(d => ({ ...d, alertHigh: e.target.value === '' ? null : parseFloat(e.target.value) }))}
          className="w-20 p-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </td>
      <td className="px-4 py-2">
        <input value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
          placeholder="e.g. Diabetes"
          className="w-28 p-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </td>
      <td className="px-4 py-2">
        <input type="number" value={draft.sortOrder}
          onChange={e => setDraft(d => ({ ...d, sortOrder: parseInt(e.target.value) || 0 }))}
          className="w-12 p-1 border border-blue-300 rounded text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </td>
      <td className="px-4 py-2 text-center">
        <input type="checkbox" checked={draft.active} onChange={e => setDraft(d => ({ ...d, active: e.target.checked }))}
          className="w-4 h-4 accent-green-600" />
        <label className="text-xs ml-1 text-slate-600">Active</label>
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button onClick={handleSave} disabled={busy}
            className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50">
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

// ─── Inline editable row for a medication ───
const MedRow: React.FC<{ med: MedicationConfig; onSave: (m: MedicationConfig) => void; onDelete: (id: string) => void }> = ({ med, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(med);
  const [busy, setBusy] = useState(false);
  const handleSave = async () => { setBusy(true); try { await onSave(draft); setEditing(false); } finally { setBusy(false); } };

  if (!editing) return (
    <tr className="border-b last:border-0 hover:bg-slate-50 text-sm">
      <td className="px-3 py-2 font-medium text-slate-800">{med.name}</td>
      <td className="px-3 py-2 text-slate-500 text-xs">{med.brand || '—'}</td>
      <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-green-50 text-green-700 text-xs rounded">{med.form}</span></td>
      <td className="px-3 py-2 text-slate-600 text-xs">{med.strength || '—'}</td>
      <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded">{med.category}</span></td>
      <td className="px-3 py-2 text-center">
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${med.active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{med.active ? 'Active' : 'Off'}</span>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => { setDraft(med); setEditing(true); }} className="p-1.5 hover:bg-slate-200 rounded text-slate-500 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => onDelete(med.id)} className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </td>
    </tr>
  );

  return (
    <tr className="border-b bg-green-50/40">
      <td className="px-3 py-2"><input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} className="w-full p-1 border border-green-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-400" /></td>
      <td className="px-3 py-2"><input value={draft.brand} onChange={e => setDraft(d => ({ ...d, brand: e.target.value }))} placeholder="Brand" className="w-full p-1 border border-green-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-400" /></td>
      <td className="px-3 py-2">
        <select value={draft.form} onChange={e => setDraft(d => ({ ...d, form: e.target.value }))} className="w-full p-1 border border-green-300 rounded text-xs focus:outline-none">
          {['Tablet','Capsule','Syrup','Injection','Infusion','Inhaler (MDI)','Inhaler (DPI)','Cream','Ointment','Drops','Oral Drops','Solution','Powder','Sachet','Suspension','Patch','Suppository'].map(f => <option key={f}>{f}</option>)}
        </select>
      </td>
      <td className="px-3 py-2"><input value={draft.strength} onChange={e => setDraft(d => ({ ...d, strength: e.target.value }))} placeholder="500mg" className="w-full p-1 border border-green-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-400" /></td>
      <td className="px-3 py-2"><input value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))} className="w-full p-1 border border-green-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-400" /></td>
      <td className="px-3 py-2 text-center"><input type="checkbox" checked={draft.active} onChange={e => setDraft(d => ({ ...d, active: e.target.checked }))} className="w-4 h-4 accent-green-600" /></td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          <button onClick={handleSave} disabled={busy} className="p-1.5 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50"><Save className="w-3.5 h-3.5" /></button>
          <button onClick={() => setEditing(false)} className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded"><X className="w-3.5 h-3.5" /></button>
        </div>
      </td>
    </tr>
  );
};

// ─── DPDP Right-to-Erasure Panel ───
const DpdpErasurePanel: React.FC<{ hospitalId: string }> = ({ hospitalId }) => {
  const [ipNo, setIpNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleErase = async () => {
    if (!ipNo.trim()) return;
    if (!window.confirm(`Permanently anonymise ALL personal data for patient ${ipNo}? This cannot be undone.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await anonymizePatient(ipNo.trim(), hospitalId);
      setMsg({ ok: true, text: `Patient ${ipNo} — personal data anonymised per DPDP §13.` });
      setIpNo('');
    } catch (err: any) {
      setMsg({ ok: false, text: err.message ?? 'Anonymisation failed.' });
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <UserX className="w-4 h-4 text-red-600" />
        <h2 className="font-bold text-slate-800">Patient Data Erasure (DPDP §13)</h2>
      </div>
      <div className="p-4 space-y-3 text-sm text-slate-700">
        <p className="text-xs text-slate-500">Right to erasure under the Digital Personal Data Protection Act, 2023. Anonymises name, mobile, ABHA ID, and all clinical notes for the specified patient. The anonymised record is retained for audit/billing continuity.</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={ipNo}
            onChange={e => setIpNo(e.target.value)}
            placeholder="IP Number (e.g. IP/2024/1234)"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 outline-none"
          />
          <button
            onClick={handleErase}
            disabled={busy || !ipNo.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {busy ? 'Processing…' : 'Anonymise'}
          </button>
        </div>
        {msg && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-xs font-medium ${msg.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── DPDP Data Portability Panel ───
const DpdpPortabilityPanel: React.FC<{ hospitalId: string }> = ({ hospitalId }) => {
  const [ipNo, setIpNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleExport = async () => {
    if (!ipNo.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await exportPatientData(ipNo.trim(), hospitalId);
      setMsg({ ok: true, text: `Patient ${ipNo} data exported as JSON.` });
    } catch (err: any) {
      setMsg({ ok: false, text: err.message ?? 'Export failed.' });
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <Download className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-800">Patient Data Export (DPDP §16)</h2>
      </div>
      <div className="p-4 space-y-3 text-sm text-slate-700">
        <p className="text-xs text-slate-500">Right to data portability under the Digital Personal Data Protection Act, 2023. Downloads a complete JSON file of all data held for the specified patient — including labs, imaging, rounds, and nursing notes.</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={ipNo}
            onChange={e => setIpNo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleExport()}
            placeholder="IP Number (e.g. IP/2024/1234)"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none"
          />
          <button
            onClick={handleExport}
            disabled={busy || !ipNo.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            {busy ? 'Exporting…' : 'Export JSON'}
          </button>
        </div>
        {msg && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-xs font-medium ${msg.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main AdminSettings view ───
const AdminSettings: React.FC = () => {
  const { user } = useAuth();
  const hospitalId = user?.hospitalId ?? '';
  const { wards, labTypes, addWard, saveWard, removeWard, addLabType, saveLabType, removeLabType, unitChiefs, setUnitChief, hospitalName, department, unitOptions, preOpModuleName, procedureListName, preOpChecklistTemplate, showNursingNotes, showMedicationChart, showIntakeOutput, showBloodTransfusion, showWoundCare, saveHospitalConfig, medications, addMedication, saveMedication, removeMedication, seedMedications, activeSpecialty, activeFieldGroups, templateOverride, saveTemplateOverride, resetTemplateOverride } = useConfig();

  // Hospital settings form
  const [localHospitalName, setLocalHospitalName] = useState(hospitalName);
  const [localDepartment, setLocalDepartment] = useState(department);
  const [localUnits, setLocalUnits] = useState<string[]>(unitOptions);
  const [localPreOpName, setLocalPreOpName] = useState(preOpModuleName);
  const [localProcedureName, setLocalProcedureName] = useState(procedureListName);
  const [localPreOpItems, setLocalPreOpItems] = useState<string[]>(preOpChecklistTemplate);
  const [localShowNursingNotes, setLocalShowNursingNotes] = useState(showNursingNotes);
  const [localShowMedicationChart, setLocalShowMedicationChart] = useState(showMedicationChart);
  const [localShowIntakeOutput, setLocalShowIntakeOutput] = useState(showIntakeOutput);
  const [localShowBloodTransfusion, setLocalShowBloodTransfusion] = useState(showBloodTransfusion);
  const [localShowWoundCare, setLocalShowWoundCare] = useState(showWoundCare);
  const [newUnit, setNewUnit] = useState('');
  const [newPreOpItem, setNewPreOpItem] = useState('');
  const [savingHospital, setSavingHospital] = useState(false);

  // ── Incident Management state ──
  const [incidents, setIncidents] = useState<StatusIncident[]>([]);
  const [incLoading, setIncLoading] = useState(false);
  const [incExpanded, setIncExpanded] = useState(false);
  const [newIncTitle, setNewIncTitle] = useState('');
  const [newIncSeverity, setNewIncSeverity] = useState<IncidentSeverity>('minor');
  const [newIncStatus, setNewIncStatus] = useState<IncidentStatus>('investigating');
  const [newIncDesc, setNewIncDesc] = useState('');
  const [incSaving, setIncSaving] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<Record<string, string>>({});

  const loadIncidents = async () => {
    setIncLoading(true);
    try { setIncidents(await fetchIncidents(20)); } finally { setIncLoading(false); }
  };

  const handleCreateIncident = async () => {
    if (!newIncTitle.trim()) return;
    setIncSaving(true);
    try {
      await createIncident(newIncTitle.trim(), newIncSeverity, newIncStatus, newIncDesc.trim() || undefined);
      setNewIncTitle(''); setNewIncDesc('');
      await loadIncidents();
    } finally { setIncSaving(false); }
  };

  const handleUpdateIncident = async (id: string, status: IncidentStatus) => {
    const msg = updateMsg[id]?.trim();
    if (!msg) return;
    await updateIncidentStatus(id, status, msg);
    setUpdateMsg(prev => ({ ...prev, [id]: '' }));
    await loadIncidents();
  };

  const handleDeleteIncident = async (id: string) => {
    if (!window.confirm('Delete this incident?')) return;
    await deleteIncident(id);
    await loadIncidents();
  };

  const INC_SEVERITY_COLORS: Record<IncidentSeverity, string> = {
    minor:    'bg-yellow-50 border-yellow-200 text-yellow-800',
    major:    'bg-orange-50 border-orange-200 text-orange-800',
    critical: 'bg-red-50   border-red-200   text-red-800',
  };

  const handleAddUnit = () => {
    const trimmed = newUnit.trim().toUpperCase();
    if (trimmed && !localUnits.includes(trimmed)) {
      setLocalUnits(prev => [...prev, trimmed]);
    }
    setNewUnit('');
  };

  const handleAddPreOpItem = () => {
    const trimmed = newPreOpItem.trim();
    if (trimmed && !localPreOpItems.includes(trimmed)) {
      setLocalPreOpItems(prev => [...prev, trimmed]);
    }
    setNewPreOpItem('');
  };

  const applyPreset = (preset: typeof DEPARTMENT_PRESETS[0]) => {
    setLocalDepartment(preset.department);
    setLocalUnits(preset.units);
    setLocalPreOpName(preset.preOpModuleName);
    setLocalProcedureName(preset.procedureListName);
    setLocalPreOpItems(preset.preOpChecklistTemplate);
  };

  const handleSaveHospital = async () => {
    setSavingHospital(true);
    try {
      await saveHospitalConfig({
        hospitalName: localHospitalName, department: localDepartment,
        units: localUnits, preOpModuleName: localPreOpName,
        procedureListName: localProcedureName, preOpChecklistTemplate: localPreOpItems,
        showNursingNotes: localShowNursingNotes, showMedicationChart: localShowMedicationChart,
        showIntakeOutput: localShowIntakeOutput, showBloodTransfusion: localShowBloodTransfusion, showWoundCare: localShowWoundCare,
      });
    } finally { setSavingHospital(false); }
  };

  // New ward form
  const [newWardName, setNewWardName] = useState('');
  const [newWardIsIcu, setNewWardIsIcu] = useState(false);
  const [newWardUnit, setNewWardUnit] = useState<string[]>([]);
  const [addingWard, setAddingWard] = useState(false);

  // New lab type form
  const [newLabName, setNewLabName] = useState('');
  const [newLabUnit, setNewLabUnit] = useState('');
  const [newLabAlertHigh, setNewLabAlertHigh] = useState('');
  const [newLabCategory, setNewLabCategory] = useState('');
  const [addingLab, setAddingLab] = useState(false);

  // Medication management state
  const [medSearch, setMedSearch] = useState('');
  const [medCategoryFilter, setMedCategoryFilter] = useState('All');
  const [addingMed, setAddingMed] = useState(false);
  const [seedingMeds, setSeedingMeds] = useState(false);
  const [newMed, setNewMed] = useState({ name: '', brand: '', category: '', form: 'Tablet', strength: '' });

  const medCategories = ['All', ...Array.from(new Set(medications.map(m => m.category))).sort()];
  const filteredMeds = medications.filter(m =>
    (medCategoryFilter === 'All' || m.category === medCategoryFilter) &&
    (m.name.toLowerCase().includes(medSearch.toLowerCase()) || m.brand.toLowerCase().includes(medSearch.toLowerCase()))
  );

  const handleAddMed = async () => {
    if (!newMed.name.trim() || !newMed.category.trim()) return;
    setAddingMed(true);
    try {
      await addMedication({ ...newMed, sortOrder: medications.length, active: true });
      setNewMed({ name: '', brand: '', category: newMed.category, form: 'Tablet', strength: '' });
    } finally { setAddingMed(false); }
  };

  const handleSeedMeds = async () => {
    setSeedingMeds(true);
    try { await seedMedications(); } finally { setSeedingMeds(false); }
  };

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

  const handleAddLab = async () => {
    if (!newLabName.trim() || !newLabCategory.trim()) return;
    setAddingLab(true);
    try {
      await addLabType(
        newLabName.trim(),
        newLabUnit.trim(),
        newLabAlertHigh ? parseFloat(newLabAlertHigh) : null,
        newLabCategory.trim(),
      );
      setNewLabName('');
      setNewLabUnit('');
      setNewLabAlertHigh('');
      setNewLabCategory('');
    } finally { setAddingLab(false); }
  };

  // ── Department Template state ──
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [draftGroups, setDraftGroups] = useState<SpecialtyFieldGroup[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [newGroupLabel, setNewGroupLabel] = useState('');
  const [newFieldLabels, setNewFieldLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editingTemplate) {
      setDraftGroups(JSON.parse(JSON.stringify(activeFieldGroups)));
      setExpandedGroups(new Set(activeFieldGroups.map(g => g.key)));
    }
  }, [editingTemplate, activeFieldGroups]);

  const toggleGroupExpand = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleAddGroup = () => {
    const label = newGroupLabel.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/\s+/g, '_');
    if (draftGroups.some(g => g.key === key)) return;
    setDraftGroups(prev => [...prev, { key, label, fields: [] }]);
    setExpandedGroups(prev => new Set([...prev, key]));
    setNewGroupLabel('');
  };

  const handleRemoveGroup = (key: string) => {
    setDraftGroups(prev => prev.filter(g => g.key !== key));
  };

  const handleGroupLabelChange = (key: string, label: string) => {
    setDraftGroups(prev => prev.map(g => g.key === key ? { ...g, label } : g));
  };

  const handleAddField = (groupKey: string) => {
    const label = (newFieldLabels[groupKey] ?? '').trim();
    if (!label) return;
    const fieldKey = label.toLowerCase().replace(/\s+/g, '_');
    setDraftGroups(prev => prev.map(g =>
      g.key === groupKey
        ? { ...g, fields: [...g.fields, { key: fieldKey, label, type: 'text' as SpecialtyField['type'] }] }
        : g
    ));
    setNewFieldLabels(prev => ({ ...prev, [groupKey]: '' }));
  };

  const handleRemoveField = (groupKey: string, fieldKey: string) => {
    setDraftGroups(prev => prev.map(g =>
      g.key === groupKey
        ? { ...g, fields: g.fields.filter(f => f.key !== fieldKey) }
        : g
    ));
  };

  const handleSaveTemplate = async () => {
    setSavingTemplate(true);
    try { await saveTemplateOverride(draftGroups); setEditingTemplate(false); }
    finally { setSavingTemplate(false); }
  };

  const handleResetTemplate = async () => {
    if (!window.confirm('Reset to system default template? Your customizations will be lost.')) return;
    await resetTemplateOverride();
    setEditingTemplate(false);
  };

  const sortedWards = [...wards].sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedLabs = [...labTypes].sort((a, b) => a.category.localeCompare(b.category) || a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-6 pb-24">

      {/* ── Hospital Settings ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
          <Building2 className="w-5 h-5 text-slate-600" />
          <h2 className="font-bold text-slate-800">Hospital Settings</h2>
          <span className="text-xs text-slate-500 ml-1">Used in PDF/Excel exports</span>
        </div>
        <div className="p-4 space-y-4">
          {/* Department Presets */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <label className="text-xs font-medium text-slate-600">Quick Presets</label>
              <span className="text-xs text-slate-400">— click to auto-fill department, units & module names</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
              {DEPARTMENT_PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="px-2 py-1.5 text-xs bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-600 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors font-medium text-center truncate"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Hospital Name</label>
              <input
                value={localHospitalName}
                onChange={e => setLocalHospitalName(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="e.g. GOVT MEDICAL COLLEGE, KOZHIKODE"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Department</label>
              <input
                value={localDepartment}
                onChange={e => setLocalDepartment(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="e.g. DEPARTMENT OF ORTHOPAEDICS"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Pre-op Module Name</label>
              <input
                value={localPreOpName}
                onChange={e => setLocalPreOpName(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="e.g. PAC Status / Pre-admission"
              />
              <p className="text-xs text-slate-400 mt-1">Shown in navigation and tabs</p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Procedure List Name</label>
              <input
                value={localProcedureName}
                onChange={e => setLocalProcedureName(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="e.g. OT List / Procedure List"
              />
              <p className="text-xs text-slate-400 mt-1">Shown in navigation and tabs</p>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Clinical Units</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {localUnits.map(u => (
                <span key={u} className="flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs font-bold">
                  {u}
                  <button
                    onClick={() => setLocalUnits(prev => prev.filter(x => x !== u))}
                    className="text-indigo-400 hover:text-red-600 ml-0.5 text-sm leading-none"
                    title="Remove unit"
                  >×</button>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={newUnit}
                onChange={e => setNewUnit(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddUnit(); }}
                placeholder="Add unit, e.g. OR6"
                className="flex-1 min-w-32 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button
                onClick={handleAddUnit}
                disabled={!newUnit.trim()}
                className="flex items-center gap-1 px-3 py-2 min-h-[38px] bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg disabled:opacity-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSaveHospital}
              disabled={savingHospital}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" /> {savingHospital ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Pre-Op Checklist Items ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
          <ClipboardList className="w-5 h-5 text-teal-600" />
          <h2 className="font-bold text-slate-800">Pre-Op Checklist Items</h2>
          <span className="text-xs text-slate-500 ml-1">Shown in Pre-Op Prep screen for all departments</span>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-500">
            These items appear on the pre-operative checklist for every scheduled patient.
            Apply a department preset above to auto-fill with department-specific items.
          </p>
          <div className="flex flex-wrap gap-2">
            {localPreOpItems.map((item, idx) => (
              <span key={idx} className="flex items-center gap-1.5 bg-teal-50 text-teal-800 border border-teal-200 px-2.5 py-1 rounded-full text-xs font-medium">
                {item}
                <button
                  onClick={() => setLocalPreOpItems(prev => prev.filter((_, i) => i !== idx))}
                  className="text-teal-400 hover:text-red-600 transition-colors text-sm leading-none"
                  title="Remove item"
                >×</button>
              </span>
            ))}
            {localPreOpItems.length === 0 && (
              <p className="text-xs text-slate-400 italic">No items — add at least one below.</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={newPreOpItem}
              onChange={e => setNewPreOpItem(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddPreOpItem(); }}
              placeholder="Add checklist item, e.g. Blood Group & Hold"
              className="flex-1 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            />
            <button
              onClick={handleAddPreOpItem}
              disabled={!newPreOpItem.trim()}
              className="flex items-center gap-1 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg disabled:opacity-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          <p className="text-xs text-slate-400">Changes take effect after clicking "Save Settings" above.</p>
        </div>
      </div>

      {/* ── Feature Modules ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
          <ToggleRight className="w-5 h-5 text-violet-600" />
          <h2 className="font-bold text-slate-800">Feature Modules</h2>
          <span className="text-xs text-slate-500 ml-1">Enable or disable optional tabs in Patient Detail</span>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-500">
            These modules are hidden by default. Enable them once the required database tables have been set up.
            Changes are saved with the "Save Settings" button above.
          </p>
          {[
            {
              id: 'nursing',
              label: 'Nursing Notes',
              description: 'Adds a Nursing tab in Patient Detail for shift notes (Morning / Afternoon / Night).',
              value: localShowNursingNotes,
              onChange: setLocalShowNursingNotes,
            },
            {
              id: 'medication',
              label: 'Medication Chart (MAR)',
              description: 'Adds a Medications tab in Patient Detail for prescribing and recording drug administration.',
              value: localShowMedicationChart,
              onChange: setLocalShowMedicationChart,
            },
            {
              id: 'intake-output',
              label: 'Intake / Output',
              description: 'Adds a Fluid Balance tab in Patient Detail to document daily intake and output volumes.',
              value: localShowIntakeOutput,
              onChange: setLocalShowIntakeOutput,
            },
            {
              id: 'blood-transfusion',
              label: 'Blood Transfusion',
              description: 'Adds a Transfusion tab in Patient Detail to record blood products given and adverse reactions.',
              value: localShowBloodTransfusion,
              onChange: setLocalShowBloodTransfusion,
            },
            {
              id: 'wound-care',
              label: 'Wound Care',
              description: 'Adds a Wound Care tab in Patient Detail to document dressing changes, wound condition, and healing progress.',
              value: localShowWoundCare,
              onChange: setLocalShowWoundCare,
            },
          ].map(item => (
            <label key={item.id} className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
              <div className="relative mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={item.value}
                  onChange={e => item.onChange(e.target.checked)}
                />
                <div className={`w-10 h-5 rounded-full transition-colors ${item.value ? 'bg-violet-600' : 'bg-slate-300'}`} />
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${item.value ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800">{item.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* ── Ward Configuration ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <BedDouble className="w-5 h-5 text-blue-600" />
            <h2 className="font-bold text-slate-800">Ward Configuration</h2>
            <span className="text-xs text-slate-500 ml-1">({wards.length} wards)</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Ward Name</th>
                <th className="px-4 py-3 text-center">Unit</th>
                <th className="px-4 py-3 text-center">Order</th>
                <th className="px-4 py-3 text-center">Type</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedWards.map(ward => (
                <WardRow key={ward.id} ward={ward} unitOptions={unitOptions} onSave={saveWard} onDelete={removeWard} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Add new ward */}
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center gap-2">
          <input value={newWardName} onChange={e => setNewWardName(e.target.value)}
            placeholder="New ward name, e.g. Ward 6"
            className="flex-1 min-w-40 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            onKeyDown={e => { if (e.key === 'Enter') handleAddWard(); }}
          />
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-slate-500 font-medium">Units:</span>
            {unitOptions.map(u => {
              const checked = newWardUnit.includes(u);
              return (
                <label key={u} className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer border text-xs font-semibold transition-colors ${checked ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}>
                  <input type="checkbox" className="sr-only" checked={checked}
                    onChange={() => setNewWardUnit(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u])}
                  />
                  {u}
                </label>
              );
            })}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={newWardIsIcu} onChange={e => setNewWardIsIcu(e.target.checked)}
              className="w-4 h-4 accent-red-600" />
            <Activity className="w-3.5 h-3.5 text-red-500" />
            ICU
          </label>
          <button onClick={handleAddWard} disabled={addingWard || !newWardName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
            <Plus className="w-4 h-4" /> Add Ward
          </button>
        </div>

        <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100 flex items-start gap-2 text-xs text-amber-800">
          <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
          Assign a unit to a ward so the patient's unit is auto-filled on admission. Leave as "Shared" for mixed wards like Ortho ICU.
        </div>
      </div>

      {/* ── Lab Type Configuration ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
          <FlaskConical className="w-5 h-5 text-orange-500" />
          <h2 className="font-bold text-slate-800">Lab Type Configuration</h2>
          <span className="text-xs text-slate-500 ml-1">({labTypes.length} tests)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Test Name</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Alert Threshold</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-center">Order</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedLabs.map(lab => (
                <LabRow key={lab.id} lab={lab} onSave={saveLabType} onDelete={removeLabType} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Add new lab type */}
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center gap-2">
          <input value={newLabName} onChange={e => setNewLabName(e.target.value)}
            placeholder="Test name, e.g. Haemoglobin"
            className="flex-1 min-w-36 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          <input value={newLabUnit} onChange={e => setNewLabUnit(e.target.value)}
            placeholder="Unit, e.g. g/dL"
            className="w-28 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          <input type="number" value={newLabAlertHigh} onChange={e => setNewLabAlertHigh(e.target.value)}
            placeholder="Alert &gt; (optional)"
            className="w-32 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          <input value={newLabCategory} onChange={e => setNewLabCategory(e.target.value)}
            placeholder="Category, e.g. Haematology"
            className="w-40 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            onKeyDown={e => { if (e.key === 'Enter') handleAddLab(); }}
          />
          <button onClick={handleAddLab} disabled={addingLab || !newLabName.trim() || !newLabCategory.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
            <Plus className="w-4 h-4" /> Add Test
          </button>
        </div>

        <div className="px-4 py-2.5 bg-blue-50 border-t border-blue-100 flex items-start gap-2 text-xs text-blue-800">
          <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-600" />
          New lab types appear immediately in Lab Trends and Patient Detail. The alert threshold highlights values in red when exceeded.
        </div>
      </div>

      {/* ── Medication Configuration ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50 flex-wrap">
          <Pill className="w-5 h-5 text-green-600" />
          <h2 className="font-bold text-slate-800">Medication List</h2>
          <span className="text-xs text-slate-500 ml-1">({medications.length} medications — used in Discharge Summary)</span>
          <div className="ml-auto flex items-center gap-2">
            {medications.length === 0 && (
              <button onClick={handleSeedMeds} disabled={seedingMeds}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${seedingMeds ? 'animate-spin' : ''}`} />
                {seedingMeds ? 'Loading…' : 'Load Indian Medication List'}
              </button>
            )}
          </div>
        </div>

        {medications.length > 0 && (
          <>
            {/* Filter bar */}
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-2 items-center">
              <div className="flex items-center gap-2 flex-1 min-w-48 border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50">
                <Activity className="w-3.5 h-3.5 text-slate-400" />
                <input value={medSearch} onChange={e => setMedSearch(e.target.value)}
                  placeholder="Search medications…"
                  className="flex-1 text-xs bg-transparent focus:outline-none text-slate-700" />
              </div>
              <select value={medCategoryFilter} onChange={e => setMedCategoryFilter(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
                {medCategories.map(c => <option key={c}>{c}</option>)}
              </select>
              <span className="text-xs text-slate-400">{filteredMeds.length} shown</span>
            </div>

            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-3 py-3">Generic Name</th>
                    <th className="px-3 py-3">Brand</th>
                    <th className="px-3 py-3">Form</th>
                    <th className="px-3 py-3">Strength</th>
                    <th className="px-3 py-3">Category</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMeds.map(med => (
                    <MedRow key={med.id} med={med} onSave={saveMedication} onDelete={removeMedication} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Add new medication */}
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center gap-2">
          <input value={newMed.name} onChange={e => setNewMed(m => ({ ...m, name: e.target.value }))}
            placeholder="Generic name *" className="flex-1 min-w-36 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none" />
          <input value={newMed.brand} onChange={e => setNewMed(m => ({ ...m, brand: e.target.value }))}
            placeholder="Brand name" className="w-36 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none" />
          <select value={newMed.form} onChange={e => setNewMed(m => ({ ...m, form: e.target.value }))}
            className="w-32 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none">
            {['Tablet','Capsule','Syrup','Injection','Infusion','Inhaler (MDI)','Cream','Ointment','Drops','Solution','Powder','Sachet','Suspension'].map(f => <option key={f}>{f}</option>)}
          </select>
          <input value={newMed.strength} onChange={e => setNewMed(m => ({ ...m, strength: e.target.value }))}
            placeholder="Strength, e.g. 500mg" className="w-28 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none" />
          <input value={newMed.category} onChange={e => setNewMed(m => ({ ...m, category: e.target.value }))}
            placeholder="Category *" className="w-40 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none"
            onKeyDown={e => { if (e.key === 'Enter') handleAddMed(); }} />
          <button onClick={handleAddMed} disabled={addingMed || !newMed.name.trim() || !newMed.category.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        <div className="px-4 py-2.5 bg-green-50 border-t border-green-100 flex items-start gap-2 text-xs text-green-800">
          <Pill className="w-3.5 h-3.5 mt-0.5 shrink-0 text-green-600" />
          This list powers the medication search in Discharge Summary. Click "Load Indian Medication List" to seed 300+ pre-loaded medicines.
        </div>
      </div>

      {/* ── Unit Chiefs (OT List auto-fill) ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
          <UserCheck className="w-5 h-5 text-indigo-600" />
          <h2 className="font-bold text-slate-800">Unit Chiefs</h2>
          <span className="text-xs text-slate-500 ml-1">Auto-fills surgeon name in OT List exports</span>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {unitOptions.map(unit => (
            <div key={unit} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg bg-slate-50">
              <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-1 rounded w-10 text-center shrink-0">{unit}</span>
              <input
                type="text"
                value={unitChiefs[unit] ?? ''}
                onChange={e => setUnitChief(unit, e.target.value)}
                placeholder="Surgeon name…"
                className="flex-1 text-sm border border-slate-300 rounded px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              />
            </div>
          ))}
        </div>
        <div className="px-4 py-2.5 bg-indigo-50 border-t border-indigo-100 flex items-start gap-2 text-xs text-indigo-800">
          <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-600" />
          When a unit is selected in the OT List, the surgeon name is filled automatically from this list.
        </div>
      </div>

      {/* ── HIS Integration ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-slate-800">HIS / FHIR Integration</h2>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-slate-600">
            Connect MediWard to your Hospital Information System (HIS) or ABDM/NDHM FHIR server for patient
            data import/export. Leave blank if not configured.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                FHIR Server Base URL
              </label>
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="url"
                  placeholder="https://fhir.yourhospital.in/R4"
                  className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  onChange={() => {/* Future: wire to hospitalConfig */}}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">HL7 FHIR R4 compatible endpoint. Used for patient import and ABHA linking.</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
                ABDM Health Facility Registry ID
              </label>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="IN0000000"
                  className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  onChange={() => {/* Future: wire to hospitalConfig */}}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">Your NHA Health Facility Registry identifier for ABHA / NDHM linkage.</p>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
            <p className="font-semibold mb-1">Integration status: Not configured</p>
            <p>Full HIS integration (bi-directional ADT sync, order management, discharge messaging) is available on the Pro plan. Contact <span className="font-semibold">support@mediward.in</span> to enable.</p>
          </div>
        </div>
      </div>

      {/* ── Incident Management ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={() => { setIncExpanded(v => !v); if (!incExpanded) loadIncidents(); }}
          className="w-full flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
        >
          <Radio className="w-4 h-4 text-red-600" />
          <h2 className="font-bold text-slate-800">Incident Management</h2>
          <span className="text-xs text-slate-500 ml-1">· Public status page</span>
          <span className="ml-auto text-xs text-slate-400">{incExpanded ? '▲' : '▼'}</span>
        </button>

        {incExpanded && (
          <div className="p-4 space-y-5">
            {/* Create Incident */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Create New Incident</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Elevated API response times"
                    value={newIncTitle}
                    onChange={e => setNewIncTitle(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Severity</label>
                  <select value={newIncSeverity} onChange={e => setNewIncSeverity(e.target.value as IncidentSeverity)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-red-500 outline-none">
                    <option value="minor">Minor (partial degradation)</option>
                    <option value="major">Major (significant impact)</option>
                    <option value="critical">Critical (service down)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Initial Status</label>
                  <select value={newIncStatus} onChange={e => setNewIncStatus(e.target.value as IncidentStatus)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-red-500 outline-none">
                    <option value="investigating">Investigating</option>
                    <option value="identified">Identified</option>
                    <option value="monitoring">Monitoring</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Description (optional)</label>
                  <textarea rows={2} placeholder="Brief description visible on status page…"
                    value={newIncDesc} onChange={e => setNewIncDesc(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500 outline-none resize-none bg-white"
                  />
                </div>
              </div>
              <button
                onClick={handleCreateIncident}
                disabled={incSaving || !newIncTitle.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" /> {incSaving ? 'Creating…' : 'Create Incident'}
              </button>
            </div>

            {/* Active & Recent Incidents */}
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Recent Incidents</p>
              {incLoading ? (
                <div className="h-16 bg-slate-100 rounded animate-pulse" />
              ) : incidents.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                  <CheckCircle2 className="w-4 h-4 shrink-0" /> No incidents on record.
                </div>
              ) : (
                incidents.map(inc => (
                  <div key={inc.id} className={`border rounded-xl p-3 space-y-2 ${INC_SEVERITY_COLORS[inc.severity]}`}>
                    <div className="flex items-start gap-2">
                      {inc.status === 'resolved'
                        ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                        : inc.severity === 'critical'
                          ? <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          : <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm">{inc.title}</span>
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-black/10">{inc.severity}</span>
                          <span className="text-[10px] font-semibold uppercase opacity-70">{inc.status}</span>
                        </div>
                        {inc.description && <p className="text-xs opacity-75 mt-0.5">{inc.description}</p>}
                        <p className="text-[10px] opacity-60 mt-1">
                          Started: {new Date(inc.createdAt).toLocaleString('en-IN')}
                          {inc.resolvedAt && ` · Resolved: ${new Date(inc.resolvedAt).toLocaleString('en-IN')}`}
                        </p>
                      </div>
                      <button onClick={() => handleDeleteIncident(inc.id)} className="p-1 hover:bg-black/10 rounded text-current opacity-50 hover:opacity-100 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {inc.status !== 'resolved' && (
                      <div className="flex gap-2 pt-1">
                        <input
                          type="text"
                          placeholder="Update message…"
                          value={updateMsg[inc.id] ?? ''}
                          onChange={e => setUpdateMsg(prev => ({ ...prev, [inc.id]: e.target.value }))}
                          className="flex-1 text-xs border border-current/30 rounded-lg px-2.5 py-1.5 bg-white/60 outline-none focus:bg-white"
                        />
                        <select
                          defaultValue={inc.status}
                          id={`status-${inc.id}`}
                          className="text-xs border border-current/30 rounded-lg px-2 py-1.5 bg-white/60 outline-none"
                        >
                          <option value="investigating">Investigating</option>
                          <option value="identified">Identified</option>
                          <option value="monitoring">Monitoring</option>
                          <option value="resolved">Resolved ✓</option>
                        </select>
                        <button
                          onClick={() => {
                            const sel = document.getElementById(`status-${inc.id}`) as HTMLSelectElement;
                            handleUpdateIncident(inc.id, sel.value as IncidentStatus);
                          }}
                          disabled={!updateMsg[inc.id]?.trim()}
                          className="px-3 py-1.5 text-xs font-semibold bg-black/10 hover:bg-black/20 disabled:opacity-40 rounded-lg transition-colors"
                        >
                          Post
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Data Residency & Security ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-green-600" />
          <h2 className="font-bold text-slate-800">Data Residency &amp; Security</h2>
        </div>
        <div className="p-4 space-y-3 text-sm text-slate-700">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="font-semibold text-green-800 text-xs uppercase tracking-wide mb-1">Data Region</p>
              <p className="font-bold text-green-900">Asia Pacific (Mumbai)</p>
              <p className="text-xs text-green-700 mt-0.5">ap-south-1 · AWS / Supabase India region</p>
              <p className="text-xs text-green-600 mt-1">All patient data is stored within India, compliant with the DPDP Act, 2023.</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="font-semibold text-slate-700 text-xs uppercase tracking-wide mb-1">Encryption</p>
              <p className="font-bold text-slate-800">AES-256 at rest · TLS 1.3 in transit</p>
              <p className="text-xs text-slate-500 mt-1">Database-level encryption enforced by Supabase. All API traffic over HTTPS.</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="font-semibold text-slate-700 text-xs uppercase tracking-wide mb-1">Access Control</p>
              <p className="font-bold text-slate-800">Row-Level Security (RLS)</p>
              <p className="text-xs text-slate-500 mt-1">Each hospital can only access its own data. Enforced at the database layer.</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="font-semibold text-slate-700 text-xs uppercase tracking-wide mb-1">Audit Trail</p>
              <p className="font-bold text-slate-800">Full audit log enabled</p>
              <p className="text-xs text-slate-500 mt-1">Every create/update/delete/login action is logged with user, timestamp, and IP.</p>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <p className="font-semibold mb-0.5">Penetration Testing</p>
            <p>To request a security assessment or penetration test report, contact <span className="font-semibold">security@mediward.in</span>. SOC 2 Type II audit is planned for Q3 2026.</p>
          </div>
        </div>
      </div>

      {/* ── DPDP Data Rights ── */}
      <DpdpPortabilityPanel hospitalId={hospitalId} />
      <DpdpErasurePanel hospitalId={hospitalId} />

      {/* ── Department Template ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-800">Department Clinical Template</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${templateOverride ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
              {templateOverride ? 'Custom' : 'Default'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {templateOverride && !editingTemplate && (
              <button
                onClick={handleResetTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset to Default
              </button>
            )}
            {!editingTemplate ? (
              <button
                onClick={() => setEditingTemplate(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Customize
              </button>
            ) : (
              <button
                onClick={() => setEditingTemplate(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            )}
          </div>
        </div>

        <div className="p-4">
          {/* Specialty tag */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-slate-500">Active specialty:</span>
            <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold border border-indigo-100">
              {SPECIALTY_DISPLAY_NAMES[activeSpecialty] ?? activeSpecialty}
            </span>
            <span className="text-xs text-slate-400">(auto-detected from department)</span>
          </div>

          {!editingTemplate ? (
            /* Read-only view */
            <div className="space-y-2">
              {activeFieldGroups.map(group => (
                <div key={group.key} className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleGroupExpand(group.key)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                  >
                    <span className="text-sm font-semibold text-slate-700">{group.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{group.fields.length} fields</span>
                      {expandedGroups.has(group.key) ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>
                  {expandedGroups.has(group.key) && (
                    <div className="px-4 py-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {group.fields.map(f => (
                        <span key={f.key} className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded px-2 py-1">
                          {f.label} <span className="text-slate-400">({f.type})</span>
                        </span>
                      ))}
                      {group.fields.length === 0 && <span className="text-xs text-slate-400 col-span-3">No fields</span>}
                    </div>
                  )}
                </div>
              ))}
              {activeFieldGroups.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">No field groups configured.</p>
              )}
            </div>
          ) : (
            /* Edit mode */
            <div className="space-y-3">
              {draftGroups.map((group, gi) => (
                <div key={group.key} className="border border-indigo-100 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50">
                    <button onClick={() => toggleGroupExpand(group.key)} className="shrink-0">
                      {expandedGroups.has(group.key) ? <ChevronUp className="w-4 h-4 text-indigo-400" /> : <ChevronDown className="w-4 h-4 text-indigo-400" />}
                    </button>
                    <input
                      value={group.label}
                      onChange={e => handleGroupLabelChange(group.key, e.target.value)}
                      className="flex-1 text-sm font-semibold bg-transparent text-indigo-800 outline-none border-b border-indigo-200 focus:border-indigo-500"
                    />
                    <span className="text-xs text-indigo-400">{group.fields.length} fields</span>
                    <button onClick={() => handleRemoveGroup(group.key)} className="shrink-0 text-red-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {expandedGroups.has(group.key) && (
                    <div className="px-3 py-2 space-y-1.5">
                      {group.fields.map(field => (
                        <div key={field.key} className="flex items-center gap-2">
                          <span className="flex-1 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1">{field.label}</span>
                          <span className="text-[10px] text-slate-400 w-16 shrink-0">{field.type}</span>
                          <button onClick={() => handleRemoveField(group.key, field.key)} className="text-red-400 hover:text-red-600 shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          placeholder="Add field label..."
                          value={newFieldLabels[group.key] ?? ''}
                          onChange={e => setNewFieldLabels(prev => ({ ...prev, [group.key]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleAddField(group.key)}
                          className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                        <button onClick={() => handleAddField(group.key)} className="text-indigo-600 hover:text-indigo-800 shrink-0">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add new group */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  placeholder="New group name..."
                  value={newGroupLabel}
                  onChange={e => setNewGroupLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button onClick={handleAddGroup} className="flex items-center gap-1 px-3 py-2 text-sm text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                  <Plus className="w-4 h-4" /> Add Group
                </button>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveTemplate}
                  disabled={savingTemplate}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {savingTemplate ? 'Saving…' : 'Save Template'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
