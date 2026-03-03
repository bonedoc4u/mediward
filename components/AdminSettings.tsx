import React, { useState } from 'react';
import { useConfig } from '../contexts/AppContext';
import { WardConfig, LabTypeConfig } from '../types';
import { Plus, Pencil, Trash2, Save, X, BedDouble, Activity, FlaskConical, ShieldAlert, UserCheck, Building2, Layers, ClipboardList } from 'lucide-react';

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

// ─── Main AdminSettings view ───
const AdminSettings: React.FC = () => {
  const { wards, labTypes, addWard, saveWard, removeWard, addLabType, saveLabType, removeLabType, unitChiefs, setUnitChief, hospitalName, department, unitOptions, preOpModuleName, procedureListName, preOpChecklistTemplate, saveHospitalConfig } = useConfig();

  // Hospital settings form
  const [localHospitalName, setLocalHospitalName] = useState(hospitalName);
  const [localDepartment, setLocalDepartment] = useState(department);
  const [localUnits, setLocalUnits] = useState<string[]>(unitOptions);
  const [localPreOpName, setLocalPreOpName] = useState(preOpModuleName);
  const [localProcedureName, setLocalProcedureName] = useState(procedureListName);
  const [localPreOpItems, setLocalPreOpItems] = useState<string[]>(preOpChecklistTemplate);
  const [newUnit, setNewUnit] = useState('');
  const [newPreOpItem, setNewPreOpItem] = useState('');
  const [savingHospital, setSavingHospital] = useState(false);

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

  const sortedWards = [...wards].sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedLabs = [...labTypes].sort((a, b) => a.category.localeCompare(b.category) || a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-8 pb-20">

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
            <div className="flex flex-wrap gap-1.5">
              {DEPARTMENT_PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-600 rounded-full border border-slate-200 hover:border-blue-300 transition-colors font-medium"
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
            <div className="flex items-center gap-2">
              <input
                value={newUnit}
                onChange={e => setNewUnit(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddUnit(); }}
                placeholder="Add unit, e.g. OR6"
                className="w-36 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button
                onClick={handleAddUnit}
                disabled={!newUnit.trim()}
                className="flex items-center gap-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg disabled:opacity-50 transition-colors"
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
    </div>
  );
};

export default AdminSettings;
