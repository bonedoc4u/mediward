import React, { useState } from 'react';
import { useConfig } from '../../contexts/AppContext';
import { Save, Plus, Building2, ClipboardList, ToggleRight, UserCheck, ShieldAlert, Layers, Zap } from 'lucide-react';

const DEPARTMENT_PRESETS = [
  { label: 'Orthopaedics',           department: 'DEPARTMENT OF ORTHOPAEDICS',            units: ['OR1','OR2','OR3','OR4','OR5'], preOpModuleName: 'PAC Status',   procedureListName: 'OT List',        preOpChecklistTemplate: ['Consent','Pre-OP Order','Inj. Cefuroxime','Part Preparation (Shave)','Pre-OP X-Ray','C-Sample (Cross Match)','CBD (Catheter)','Implant Order','Things / Materials'] },
  { label: 'General Surgery',        department: 'DEPARTMENT OF GENERAL SURGERY',          units: ['GS1','GS2','GS3','GS4','GS5'], preOpModuleName: 'PAC Status',   procedureListName: 'OT List',        preOpChecklistTemplate: ['Consent','Pre-OP Order','Inj. Antibiotics','Part Preparation','Pre-OP X-Ray','Blood Group & Hold','CBD (Catheter)','Diathermy Setup','Instruments Ready'] },
  { label: 'Neurosurgery',           department: 'DEPARTMENT OF NEUROSURGERY',             units: ['NS1','NS2','NS3'],              preOpModuleName: 'PAC Status',   procedureListName: 'OT List',        preOpChecklistTemplate: ['Consent','Pre-OP Order','Inj. Antibiotics','Part Preparation (Head)','Pre-OP Imaging','Blood Group & Hold','CBD (Catheter)','Neuromonitoring Setup','Instruments Ready'] },
  { label: 'Cardiothoracic Surgery', department: 'DEPARTMENT OF CARDIOTHORACIC SURGERY',  units: ['CT1','CT2','CT3'],              preOpModuleName: 'PAC Status',   procedureListName: 'OT List',        preOpChecklistTemplate: ['Consent','Pre-OP Order','Inj. Antibiotics','ECG','Echocardiogram','Chest X-Ray','Blood Group & Hold','CBD (Catheter)','Bypass Machine Ready'] },
  { label: 'Gynaecology & Obs',      department: 'DEPARTMENT OF GYNAECOLOGY & OBSTETRICS', units: ['GY1','GY2','GY3','GY4'],       preOpModuleName: 'PAC Status',   procedureListName: 'OT List',        preOpChecklistTemplate: ['Consent','Pre-OP Order','Inj. Antibiotics','Part Preparation','Pre-OP Ultrasound','Blood Group & Hold','CBD (Catheter)','Oxytocin Ready'] },
  { label: 'ENT',                    department: 'DEPARTMENT OF ENT',                     units: ['EN1','EN2','EN3'],              preOpModuleName: 'PAC Status',   procedureListName: 'OT List',        preOpChecklistTemplate: ['Consent','Pre-OP Order','Inj. Antibiotics','Part Preparation','Pre-OP Audiometry','Blood Group & Hold','Tracheostomy Tray','ENT Instruments'] },
  { label: 'Ophthalmology',          department: 'DEPARTMENT OF OPHTHALMOLOGY',            units: ['OP1','OP2','OP3'],              preOpModuleName: 'PAC Status',   procedureListName: 'OT List',        preOpChecklistTemplate: ['Consent','Pre-OP Order','Eye Drops Administered','Pupil Dilation','Blood Group & Hold','IV Line','Ophthalmic Instruments'] },
  { label: 'Urology',                department: 'DEPARTMENT OF UROLOGY',                 units: ['UR1','UR2','UR3'],              preOpModuleName: 'PAC Status',   procedureListName: 'OT List',        preOpChecklistTemplate: ['Consent','Pre-OP Order','Inj. Antibiotics','Part Preparation','Urine Culture Result','Blood Group & Hold','CBD (Catheter)','Urological Instruments'] },
  { label: 'Medicine',               department: 'DEPARTMENT OF MEDICINE',                units: ['MD1','MD2','MD3','MD4','MD5'], preOpModuleName: 'Pre-admission', procedureListName: 'Procedure List', preOpChecklistTemplate: ['Consent','Medications Reviewed','IV Line','Blood Group & Hold','ECG','NPO Status Confirmed'] },
  { label: 'Cardiology',             department: 'DEPARTMENT OF CARDIOLOGY',              units: ['CL1','CL2','CL3','CL4'],        preOpModuleName: 'Pre-admission', procedureListName: 'Procedure List', preOpChecklistTemplate: ['Consent','Medications Reviewed','IV Line','Blood Group & Hold','ECG','Echocardiogram','NPO Status Confirmed','Cath Lab Notified'] },
  { label: 'Neurology',              department: 'DEPARTMENT OF NEUROLOGY',               units: ['NL1','NL2','NL3'],              preOpModuleName: 'Pre-admission', procedureListName: 'Procedure List', preOpChecklistTemplate: ['Consent','Medications Reviewed','IV Line','Blood Group & Hold','ECG','Neuroimaging','NPO Status Confirmed'] },
  { label: 'Paediatrics',            department: 'DEPARTMENT OF PAEDIATRICS',             units: ['PD1','PD2','PD3','PD4'],        preOpModuleName: 'Pre-admission', procedureListName: 'Procedure List', preOpChecklistTemplate: ['Consent (Guardian)','Medications Reviewed','IV Line','Blood Group & Hold','Weight Checked','NPO Status Confirmed'] },
  { label: 'Psychiatry',             department: 'DEPARTMENT OF PSYCHIATRY',              units: ['PS1','PS2','PS3'],              preOpModuleName: 'Pre-admission', procedureListName: 'Procedure List', preOpChecklistTemplate: ['Consent','Medications Reviewed','IV Line','Blood Group & Hold','ECG','Risk Assessment'] },
  { label: 'Dermatology',            department: 'DEPARTMENT OF DERMATOLOGY',             units: ['DM1','DM2'],                   preOpModuleName: 'Pre-admission', procedureListName: 'Procedure List', preOpChecklistTemplate: ['Consent','Medications Reviewed','IV Line','Blood Group & Hold','Allergy Check'] },
];

const FEATURE_FLAGS = [
  { id: 'nursing',         label: 'Nursing Notes',           description: 'Adds a Nursing tab in Patient Detail for shift notes (Morning / Afternoon / Night).' },
  { id: 'medication',      label: 'Medication Chart (MAR)',  description: 'Adds a Medications tab in Patient Detail for prescribing and recording drug administration.' },
  { id: 'intake-output',   label: 'Intake / Output',         description: 'Adds a Fluid Balance tab in Patient Detail to document daily intake and output volumes.' },
  { id: 'blood-transfusion', label: 'Blood Transfusion',     description: 'Adds a Transfusion tab in Patient Detail to record blood products given and adverse reactions.' },
  { id: 'wound-care',        label: 'Wound Care',              description: 'Adds a Wound Care tab in Patient Detail to document dressing changes, wound condition, and healing progress.' },
  { id: 'wound-assessment',  label: 'Wound Assessment',        description: 'Shows the Wound Assessment section in Patient Detail (wound condition, closure type, suture removal date). Hidden by default.' },
  { id: 'rehabilitation',    label: 'Rehabilitation',          description: 'Shows the Rehabilitation section in Patient Detail (weight bearing status, physiotherapy, ROM notes, discharge plan). Hidden by default.' },
  { id: 'news2',             label: 'NEWS2 Score',             description: 'Shows the National Early Warning Score 2 column on the ward dashboard and the NEWS2 badge in Vitals. Disable for departments that do not use NEWS2.' },
] as const;

// ─── Hospital Settings panel ───
const HospitalSettings: React.FC = () => {
  const {
    hospitalName, department, unitOptions, preOpModuleName, procedureListName, preOpChecklistTemplate,
    showNursingNotes, showMedicationChart, showIntakeOutput, showBloodTransfusion, showWoundCare, showWoundAssessment, showRehabilitation, showNews2,
    customTodoShortcuts,
    saveHospitalConfig, unitChiefs, setUnitChief, configUpdatedAt, isLoadingConfig,
  } = useConfig();

  const [localHospitalName, setLocalHospitalName]         = useState(hospitalName);
  const [localDepartment, setLocalDepartment]             = useState(department);
  const [localUnits, setLocalUnits]                       = useState<string[]>(unitOptions);
  const [localPreOpName, setLocalPreOpName]               = useState(preOpModuleName);
  const [localProcedureName, setLocalProcedureName]       = useState(procedureListName);
  const [localPreOpItems, setLocalPreOpItems]             = useState<string[]>(preOpChecklistTemplate);
  const [localShowNursingNotes, setLocalShowNursingNotes] = useState(showNursingNotes);
  const [localShowMedChart, setLocalShowMedChart]         = useState(showMedicationChart);
  const [localShowIO, setLocalShowIO]                     = useState(showIntakeOutput);
  const [localShowBT, setLocalShowBT]                     = useState(showBloodTransfusion);
  const [localShowWC, setLocalShowWC]                     = useState(showWoundCare);
  const [localShowWA, setLocalShowWA]                     = useState(showWoundAssessment);
  const [localShowRehab, setLocalShowRehab]               = useState(showRehabilitation);
  const [localShowNews2, setLocalShowNews2]               = useState(showNews2);
  const [localShortcuts, setLocalShortcuts]               = useState<string[]>(customTodoShortcuts ?? []);
  const [newShortcut, setNewShortcut]                     = useState('');
  const [newUnit, setNewUnit]                             = useState('');
  const [newPreOpItem, setNewPreOpItem]                   = useState('');
  const [saving, setSaving]                               = useState(false);
  const [remoteUpdated, setRemoteUpdated]                 = useState(false);

  // Re-sync local form state when config changes via realtime (another admin saved)
  // configUpdatedAt is set by ConfigContext whenever a background config refresh lands.
  // We show a banner rather than silently overwriting — the admin can see the conflict.
  // Reinitialize local state once the initial DB fetch completes (isLoadingConfig: true → false).
  // This prevents saving stale defaults if the component mounted before the config was fetched.
  const dbLoadedRef = React.useRef(false);
  React.useEffect(() => {
    if (!isLoadingConfig && !dbLoadedRef.current && !saving) {
      dbLoadedRef.current = true;
      setLocalHospitalName(hospitalName);
      setLocalDepartment(department);
      setLocalUnits(unitOptions);
      setLocalPreOpName(preOpModuleName);
      setLocalProcedureName(procedureListName);
      setLocalPreOpItems(preOpChecklistTemplate);
      setLocalShowNursingNotes(showNursingNotes);
      setLocalShowMedChart(showMedicationChart);
      setLocalShowIO(showIntakeOutput);
      setLocalShowBT(showBloodTransfusion);
      setLocalShowWC(showWoundCare);
      setLocalShowWA(showWoundAssessment);
      setLocalShowRehab(showRehabilitation);
      setLocalShowNews2(showNews2);
      setLocalShortcuts(customTodoShortcuts ?? []);
    }
   
  }, [isLoadingConfig]);

  const prevConfigRef = React.useRef(configUpdatedAt);
  React.useEffect(() => {
    if (configUpdatedAt && configUpdatedAt !== prevConfigRef.current && !saving) {
      prevConfigRef.current = configUpdatedAt;
      setLocalHospitalName(hospitalName);
      setLocalDepartment(department);
      setLocalUnits(unitOptions);
      setLocalPreOpName(preOpModuleName);
      setLocalProcedureName(procedureListName);
      setLocalPreOpItems(preOpChecklistTemplate);
      setLocalShowNursingNotes(showNursingNotes);
      setLocalShowMedChart(showMedicationChart);
      setLocalShowIO(showIntakeOutput);
      setLocalShowBT(showBloodTransfusion);
      setLocalShowWC(showWoundCare);
      setLocalShowWA(showWoundAssessment);
      setLocalShowRehab(showRehabilitation);
      setLocalShowNews2(showNews2);
      setLocalShortcuts(customTodoShortcuts ?? []);
      setRemoteUpdated(true);
      setTimeout(() => setRemoteUpdated(false), 4000);
    }
   
  }, [configUpdatedAt]);

  const featureValues: Record<string, [boolean, (v: boolean) => void]> = {
    'nursing':           [localShowNursingNotes, setLocalShowNursingNotes],
    'medication':        [localShowMedChart,     setLocalShowMedChart],
    'intake-output':     [localShowIO,           setLocalShowIO],
    'blood-transfusion': [localShowBT,           setLocalShowBT],
    'wound-care':        [localShowWC,           setLocalShowWC],
    'wound-assessment':  [localShowWA,           setLocalShowWA],
    'rehabilitation':    [localShowRehab,        setLocalShowRehab],
    'news2':             [localShowNews2,        setLocalShowNews2],
  };

  const applyPreset = (p: typeof DEPARTMENT_PRESETS[0]) => {
    setLocalDepartment(p.department);
    setLocalUnits(p.units);
    setLocalPreOpName(p.preOpModuleName);
    setLocalProcedureName(p.procedureListName);
    setLocalPreOpItems(p.preOpChecklistTemplate);
  };

  const handleAddUnit = () => {
    const t = newUnit.trim().toUpperCase();
    if (t && !localUnits.includes(t)) setLocalUnits(prev => [...prev, t]);
    setNewUnit('');
  };

  const handleAddPreOpItem = () => {
    const t = newPreOpItem.trim();
    if (t && !localPreOpItems.includes(t)) setLocalPreOpItems(prev => [...prev, t]);
    setNewPreOpItem('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveHospitalConfig({
        hospitalName: localHospitalName, department: localDepartment,
        units: localUnits, preOpModuleName: localPreOpName,
        procedureListName: localProcedureName, preOpChecklistTemplate: localPreOpItems,
        showNursingNotes: localShowNursingNotes, showMedicationChart: localShowMedChart,
        showIntakeOutput: localShowIO, showBloodTransfusion: localShowBT, showWoundCare: localShowWC,
        showWoundAssessment: localShowWA, showRehabilitation: localShowRehab,
        showNews2: localShowNews2,
        customTodoShortcuts: localShortcuts,
        vitalThresholds: { spO2Min: 90, hrMin: 50, hrMax: 120, sbpMin: 90, rrMin: 10, rrMax: 30 },
      });
    } finally { setSaving(false); }
  };

  const handleAddShortcut = () => {
    const t = newShortcut.trim();
    if (t && !localShortcuts.includes(t)) setLocalShortcuts(prev => [...prev, t]);
    setNewShortcut('');
  };

  return (
    <div className="space-y-6">

      {/* Remote-update notice — another admin saved while this form was open */}
      {remoteUpdated && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 font-medium">
          <span>⚠️</span> Settings were updated by another admin — this form has been refreshed.
        </div>
      )}

      {/* Hospital Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
          <Building2 className="w-5 h-5 text-slate-600" />
          <h2 className="font-bold text-slate-800">Hospital Settings</h2>
          <span className="text-xs text-slate-500 ml-1">Used in PDF/Excel exports</span>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <label className="text-xs font-medium text-slate-600">Quick Presets</label>
              <span className="text-xs text-slate-400">— click to auto-fill department, units & module names</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
              {DEPARTMENT_PRESETS.map(p => (
                <button key={p.label} type="button" onClick={() => applyPreset(p)}
                  className="px-2 py-1.5 text-xs bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-600 rounded-lg border border-slate-200 hover:border-blue-300 transition-colors font-medium text-center truncate">
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Hospital Name</label>
              <input value={localHospitalName} onChange={e => setLocalHospitalName(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                placeholder="e.g. GOVT MEDICAL COLLEGE, KOZHIKODE" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Department</label>
              <input value={localDepartment} onChange={e => setLocalDepartment(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                placeholder="e.g. DEPARTMENT OF ORTHOPAEDICS" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Pre-op Module Name</label>
              <input value={localPreOpName} onChange={e => setLocalPreOpName(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                placeholder="e.g. PAC Status / Pre-admission" />
              <p className="text-xs text-slate-400 mt-1">Shown in navigation and tabs</p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Procedure List Name</label>
              <input value={localProcedureName} onChange={e => setLocalProcedureName(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                placeholder="e.g. OT List / Procedure List" />
              <p className="text-xs text-slate-400 mt-1">Shown in navigation and tabs</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Clinical Units</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {localUnits.map(u => (
                <span key={u} className="flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs font-bold">
                  {u}
                  <button onClick={() => setLocalUnits(prev => prev.filter(x => x !== u))}
                    className="text-indigo-400 hover:text-red-600 ml-0.5 text-sm leading-none" title="Remove unit">×</button>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input value={newUnit} onChange={e => setNewUnit(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddUnit(); }}
                placeholder="Add unit, e.g. OR6"
                className="flex-1 min-w-32 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
              <button onClick={handleAddUnit} disabled={!newUnit.trim()}
                className="flex items-center gap-1 px-3 py-2 min-h-[38px] bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg disabled:opacity-50 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={handleSave} disabled={saving || isLoadingConfig}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* Pre-Op Checklist Items */}
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
                <button onClick={() => setLocalPreOpItems(prev => prev.filter((_, i) => i !== idx))}
                  className="text-teal-400 hover:text-red-600 transition-colors text-sm leading-none" title="Remove item">×</button>
              </span>
            ))}
            {localPreOpItems.length === 0 && (
              <p className="text-xs text-slate-400 italic">No items — add at least one below.</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input value={newPreOpItem} onChange={e => setNewPreOpItem(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddPreOpItem(); }}
              placeholder="Add checklist item, e.g. Blood Group & Hold"
              className="flex-1 p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none" />
            <button onClick={handleAddPreOpItem} disabled={!newPreOpItem.trim()}
              className="flex items-center gap-1 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg disabled:opacity-50 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          <p className="text-xs text-slate-400">Changes take effect after clicking "Save Settings" above.</p>
        </div>
      </div>

      {/* Feature Modules */}
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
          {FEATURE_FLAGS.map(item => {
            const [value, setter] = featureValues[item.id];
            return (
              <label key={item.id} className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                <div className="relative mt-0.5 shrink-0">
                  <input type="checkbox" className="sr-only" checked={value} onChange={e => setter(e.target.checked)} />
                  <div className={`w-10 h-5 rounded-full transition-colors ${value ? 'bg-violet-600' : 'bg-slate-300'}`} />
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Ward Round Shortcuts */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
          <Zap className="w-5 h-5 text-amber-500" />
          <h2 className="font-bold text-slate-800">Ward Round Shortcuts</h2>
          <span className="text-xs text-slate-500 ml-1">Quick-add chips shown in the To-Do section during rounds</span>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-500">
            Add common tasks specific to your department — they appear as one-tap shortcut buttons
            during Ward Rounds alongside the automatic shortcuts (FBS/PPBS, C&D, etc.).
          </p>
          <div className="flex flex-wrap gap-2 min-h-[32px]">
            {localShortcuts.map(s => (
              <span key={s} className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-semibold">
                {s}
                <button
                  onClick={() => setLocalShortcuts(prev => prev.filter(x => x !== s))}
                  className="hover:text-red-600 transition-colors"
                  title="Remove"
                >
                  ×
                </button>
              </span>
            ))}
            {localShortcuts.length === 0 && (
              <p className="text-xs text-slate-400 italic">No custom shortcuts added yet.</p>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={newShortcut}
              onChange={e => setNewShortcut(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddShortcut()}
              placeholder="e.g. IV Fluids, NBM, Bloods…"
              className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 outline-none"
            />
            <button
              onClick={handleAddShortcut}
              disabled={!newShortcut.trim()}
              className="flex items-center gap-1 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-lg disabled:opacity-40 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          <div className="flex justify-end pt-1">
            <button onClick={handleSave} disabled={saving || isLoadingConfig}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Shortcuts'}
            </button>
          </div>
        </div>
      </div>

      {/* Unit Chiefs */}
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

export default HospitalSettings;
