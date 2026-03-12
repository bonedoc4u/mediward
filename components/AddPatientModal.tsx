import React, { useState, useEffect, useRef } from 'react';
import { Patient, Gender, PacStatus, Ward } from '../types';
import { useConfig, useAuth } from '../contexts/AppContext';
import { parseFhirPatient } from '../services/fhirService';
import { X, Save, UserPlus, Pencil, Loader2, FileJson, ChevronDown, ChevronUp } from 'lucide-react';
import PatientConsentModal, { CONSENT_VERSION } from './PatientConsentModal';


interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (patient: Patient) => void;
  initialData?: Patient | null;
}

const COMORBIDITY_OPTIONS = [
  "HTN", "DM", "CAD", "CKD", "CVA",
  "Hypothyroid", "Hyperthyroid", "Asthma", "COPD", "TB",
  "Seizure Disorder", "DLP", "NOCM", "CA", "RA",
  "SVT", "DCM", "Parkinson's", "Hyponatremia", "Factor VIII Def.",
  "Sickle Cell Anemia", "Cardioembolism", "Pulmon Atresia", "RAD", "RDD", "Psy"
];

const COLORS = [
  "bg-red-100 text-red-800", "bg-orange-100 text-orange-800", "bg-amber-100 text-amber-800",
  "bg-green-100 text-green-800", "bg-emerald-100 text-emerald-800", "bg-teal-100 text-teal-800",
  "bg-cyan-100 text-cyan-800", "bg-sky-100 text-sky-800", "bg-blue-100 text-blue-800",
  "bg-indigo-100 text-indigo-800", "bg-violet-100 text-violet-800", "bg-purple-100 text-purple-800",
  "bg-fuchsia-100 text-fuchsia-800", "bg-pink-100 text-pink-800", "bg-rose-100 text-rose-800"
];

const STEP_LABELS = ['Location & Identity', 'Patient Details', 'Status & Plan'];

const AddPatientModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialData }) => {
  const { wards, unitOptions } = useConfig();
  const { user } = useAuth();
  const activeWards = wards.filter(w => w.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const defaultWard = activeWards[0]?.name ?? 'Ward 1';

  // Non-admins are locked to their own unit; admins can assign any unit
  const isAdmin = user?.role === 'admin';
  const defaultUnit = user?.unit ?? '';

  // ── Wizard step ──
  // STEP_KEY sessionStorage stores { step, formData } to survive screen rotation
  const STEP_KEY = 'mediward_admit_step';

  const [formData, setFormData] = useState(() => {
    if (initialData) {
      return {
        bed: initialData.bed,
        ward: (initialData.ward || defaultWard) as Ward,
        unit: initialData.unit ?? defaultUnit,
        ipNo: initialData.ipNo,
        abhaId: initialData.abhaId ?? '',
        name: initialData.name,
        age: initialData.age.toString(),
        gender: initialData.gender,
        mobile: initialData.mobile,
        diagnosis: initialData.diagnosis,
        doa: initialData.doa,
        procedure: initialData.procedure || '',
        dos: initialData.dos || '',
        pacStatus: initialData.pacStatus,
        patientStatus: initialData.patientStatus,
      };
    }
    // Try restoring from sessionStorage (new patient draft)
    try {
      const saved = sessionStorage.getItem(STEP_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.formData) return parsed.formData;
      }
    } catch { /* ignore */ }
    return {
      bed: '',
      ward: defaultWard as Ward,
      unit: defaultUnit,
      ipNo: '',
      abhaId: '',
      name: '',
      age: '',
      gender: Gender.Male,
      mobile: '',
      diagnosis: '',
      doa: new Date().toISOString().split('T')[0],
      procedure: '',
      dos: '',
      pacStatus: PacStatus.Pending,
      patientStatus: 'Admitted',
    };
  });

  const [step, setStepRaw] = useState<number>(() => {
    if (initialData) return 1;
    try {
      const saved = sessionStorage.getItem(STEP_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const n = parsed.step ? parseInt(String(parsed.step), 10) : 1;
        return n >= 1 && n <= 3 ? n : 1;
      }
    } catch { /* ignore */ }
    return 1;
  });

  const setStep = (s: number) => {
    try {
      sessionStorage.setItem(STEP_KEY, JSON.stringify({ step: s, formData }));
    } catch { /* ignore */ }
    setStepRaw(s);
  };

  // Keep sessionStorage in sync whenever formData changes
  useEffect(() => {
    if (!initialData) {
      try {
        sessionStorage.setItem(STEP_KEY, JSON.stringify({ step, formData }));
      } catch { /* ignore */ }
    }
  }, [formData, step, initialData]);

  const [stepError, setStepError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConsent, setShowConsent] = useState(false);

  const validateStep = (s: number): string | null => {
    if (s === 1) {
      if (!formData.ipNo.trim()) return 'IP Number is required.';
      if (!formData.ward) return 'Ward is required.';
      if (formData.abhaId && !/^\d{14}$|^\d{2}-\d{4}-\d{4}-\d{4}$/.test(formData.abhaId.trim())) {
        return 'ABHA ID must be 14 digits (e.g. 12345678901234 or 12-3456-7890-1234).';
      }
      if (formData.mobile && !/^[6-9]\d{9}$/.test(formData.mobile.replace(/\s/g, ''))) {
        return 'Mobile number must be a valid 10-digit Indian number.';
      }
    }
    if (s === 2) {
      if (!formData.name.trim()) return 'Patient name is required.';
      if (!formData.diagnosis.trim()) return 'Diagnosis is required.';
    }
    return null;
  };

  // ── FHIR import ──
  const [showFhirImport, setShowFhirImport] = useState(false);
  const [fhirJson, setFhirJson] = useState('');
  const [fhirImportError, setFhirImportError] = useState<string | null>(null);

  const handleFhirImport = () => {
    setFhirImportError(null);
    if (fhirJson.length > 50_000) {
      setFhirImportError('JSON too large (max 50 KB). Paste only the Patient resource.');
      return;
    }
    try {
      const partial = parseFhirPatient(fhirJson);
      setFormData(prev => ({
        ...prev,
        ...(partial.name    ? { name: partial.name }                           : {}),
        ...(partial.age     ? { age: String(partial.age) }                     : {}),
        ...(partial.gender  ? { gender: partial.gender }                       : {}),
        ...(partial.mobile  ? { mobile: partial.mobile }                       : {}),
        ...(partial.ipNo    ? { ipNo: partial.ipNo }                           : {}),
        ...(partial.abhaId  ? { abhaId: partial.abhaId }                       : {}),
      }));
      setFhirJson('');
      setShowFhirImport(false);
    } catch (err: any) {
      setFhirImportError(err.message ?? 'Failed to parse FHIR JSON');
    }
  };

  const [selectedComorbidities, setSelectedComorbidities] = useState<string[]>([]);
  const [customComorbidity, setCustomComorbidity] = useState('');

  // ── Focus trap ──
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    dialogRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const el = dialogRef.current;
      if (!el) return;
      const focusable = el.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) { e.preventDefault(); return; }
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // ── iOS keyboard: scroll first input into view when step changes ──
  useEffect(() => {
    const first = dialogRef.current?.querySelector<HTMLElement>('input, select, textarea');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [step]);


  // Effect to populate form when editing
  useEffect(() => {
    if (isOpen && initialData) {
      setFormData({
        bed: initialData.bed,
        ward: initialData.ward || defaultWard,
        unit: initialData.unit ?? defaultUnit,
        ipNo: initialData.ipNo,
        abhaId: initialData.abhaId ?? '',
        name: initialData.name,
        age: initialData.age.toString(),
        gender: initialData.gender,
        mobile: initialData.mobile,
        diagnosis: initialData.diagnosis,
        doa: initialData.doa,
        procedure: initialData.procedure || '',
        dos: initialData.dos || '',
        pacStatus: initialData.pacStatus,
        patientStatus: initialData.patientStatus
      });
      setSelectedComorbidities(initialData.comorbidities || []);
    } else if (isOpen && !initialData) {
      // Reset for new patient
      setFormData({
        bed: '',
        ward: defaultWard,
        unit: defaultUnit,
        ipNo: '',
        abhaId: '',
        name: '',
        age: '',
        gender: Gender.Male,
        mobile: '',
        diagnosis: '',
        doa: new Date().toISOString().split('T')[0],
        procedure: '',
        dos: '',
        pacStatus: PacStatus.Pending,
        patientStatus: 'Admitted'
      });
      setSelectedComorbidities([]);
    }
    // Always start at step 1 when modal opens
    setStepRaw(1);
    setStepError(null);
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const toggleComorbidity = (item: string) => {
    if (selectedComorbidities.includes(item)) {
      setSelectedComorbidities(prev => prev.filter(i => i !== item));
    } else {
      setSelectedComorbidities(prev => [...prev, item]);
    }
  };

  const addCustomComorbidity = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && customComorbidity.trim()) {
      e.preventDefault();
      if (!selectedComorbidities.includes(customComorbidity.trim())) {
        setSelectedComorbidities([...selectedComorbidities, customComorbidity.trim()]);
      }
      setCustomComorbidity('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    // New patient: show DPDP consent modal before saving
    if (!initialData && !showConsent) {
      setShowConsent(true);
      return;
    }
    setIsSubmitting(true);
    const patientData: Patient = {
      // Preserve IDs and existing arrays if editing, otherwise create new
      ...((initialData || {}) as any),
      bed: formData.bed,
      ward: formData.ward,
      unit: formData.unit || undefined,
      ipNo: formData.ipNo,
      abhaId: formData.abhaId.trim() || undefined,
      name: formData.name,
      age: parseInt(formData.age) || 0,
      gender: formData.gender,
      mobile: formData.mobile,
      diagnosis: formData.diagnosis,
      comorbidities: selectedComorbidities,
      doa: formData.doa,
      procedure: formData.procedure,
      dos: formData.dos || undefined,
      pacStatus: formData.pacStatus as PacStatus,
      patientStatus: formData.patientStatus,
      investigations: initialData?.investigations || [],
      labResults: initialData?.labResults || [],
      todos: initialData?.todos || [],
      // Stamp consent on new patient records (DPDP Act 2023)
      ...(!initialData ? {
        consentGivenAt: new Date().toISOString(),
        consentVersion: CONSENT_VERSION,
      } : {}),
    };

    sessionStorage.removeItem(STEP_KEY);
    onSave(patientData);
    onClose();
  };

  const handleConsentAccepted = () => {
    setShowConsent(false);
    // Re-trigger save now that consent is obtained
    setIsSubmitting(true);
    const patientData: Patient = {
      ...({} as any),
      bed: formData.bed,
      ward: formData.ward,
      unit: formData.unit || undefined,
      ipNo: formData.ipNo,
      abhaId: formData.abhaId.trim() || undefined,
      name: formData.name,
      age: parseInt(formData.age) || 0,
      gender: formData.gender,
      mobile: formData.mobile,
      diagnosis: formData.diagnosis,
      comorbidities: selectedComorbidities,
      doa: formData.doa,
      procedure: formData.procedure,
      dos: formData.dos || undefined,
      pacStatus: formData.pacStatus as PacStatus,
      patientStatus: formData.patientStatus,
      investigations: [],
      labResults: [],
      todos: [],
      consentGivenAt: new Date().toISOString(),
      consentVersion: CONSENT_VERSION,
    };
    sessionStorage.removeItem(STEP_KEY);
    onSave(patientData);
    onClose();
  };

  // Helper to get a consistent color for a tag
  const getTagColor = (tag: string) => {
    const index = tag.length % COLORS.length;
    return COLORS[index];
  };

  return (
    <>
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={initialData ? 'Edit Patient Details' : 'Admit New Patient'}
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90svh] overflow-y-auto flex flex-col outline-none"
      >

        {/* ── Sticky header with progress bar ── */}
        <div className="sticky top-0 z-10 bg-slate-50 rounded-t-lg border-b border-slate-200">
          <div className="p-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              {initialData ? <Pencil className="w-5 h-5 text-blue-600" /> : <UserPlus className="w-5 h-5 text-blue-600" />}
              <h3 className="font-bold text-slate-800">{initialData ? 'Edit Patient Details' : 'Admit New Patient'}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="px-4 pb-1">
            <div className="flex gap-1 mt-2">
              {[1, 2, 3].map(s => (
                <div
                  key={s}
                  className={`flex-1 h-1.5 rounded-full transition-colors duration-200 ${
                    s < step ? 'bg-blue-600' : s === step ? 'bg-blue-400' : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>

            {/* Step labels — clickable breadcrumbs in edit mode, static otherwise */}
            <div className="flex justify-between px-1 mt-0.5 pb-2">
              {STEP_LABELS.map((label, i) => (
                initialData ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setStepError(null); setStepRaw(i + 1); }}
                    className={`text-[10px] font-medium transition-colors ${
                      step === i + 1 ? 'text-blue-600' : 'text-slate-400 hover:text-blue-400'
                    }`}
                  >
                    {label}
                  </button>
                ) : (
                  <span
                    key={i}
                    className={`text-[10px] font-medium ${step === i + 1 ? 'text-blue-600' : 'text-slate-400'}`}
                  >
                    {label}
                  </span>
                )
              ))}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="p-4 sm:p-6 space-y-4 sm:space-y-5">


          {/* ── Step 1: Location & Identity ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ward</label>
                  <select
                    className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    value={formData.ward}
                    onChange={e => {
                      const selectedWard = activeWards.find(w => w.name === e.target.value);
                      setFormData(prev => ({
                        ...prev,
                        ward: e.target.value as Ward,
                        unit: isAdmin
                          ? (selectedWard?.unit?.length === 1 ? selectedWard.unit[0] : prev.unit)
                          : prev.unit,
                      }));
                    }}
                  >
                    {activeWards.map(w => <option key={w.name} value={w.name}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Unit{!isAdmin && <span className="ml-1 text-slate-400 normal-case font-normal">(your unit)</span>}
                  </label>
                  {isAdmin ? (
                    <select
                      className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                      value={formData.unit}
                      onChange={e => setFormData({...formData, unit: e.target.value})}
                    >
                      <option value="">— Unassigned —</option>
                      {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  ) : (
                    <input type="text" readOnly className="w-full p-2 border border-slate-200 rounded text-sm bg-slate-50 text-slate-600 cursor-not-allowed" value={formData.unit || '—'} />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bed No.</label>
                  <input type="text" className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={formData.bed} onChange={e => setFormData({...formData, bed: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">IP Number</label>
                  <input type="text" className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={formData.ipNo} disabled={!!initialData} onChange={e => setFormData({...formData, ipNo: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mobile Number</label>
                  <input type="tel" className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  ABHA ID <span className="normal-case font-normal text-slate-400">(Ayushman Bharat — optional)</span>
                </label>
                <input type="text" placeholder="14-digit ABHA number" maxLength={17} className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none font-mono tracking-wider" value={formData.abhaId} onChange={e => setFormData({...formData, abhaId: e.target.value})} />
              </div>

              {/* FHIR Import */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <button type="button" onClick={() => { setShowFhirImport(v => !v); setFhirImportError(null); }}
                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-xs font-semibold text-slate-600">
                  <span className="flex items-center gap-1.5"><FileJson className="w-3.5 h-3.5 text-teal-600" />Import from FHIR JSON</span>
                  {showFhirImport ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {showFhirImport && (
                  <div className="p-3 space-y-2 border-t border-slate-200">
                    <p className="text-[11px] text-slate-500">Paste a FHIR R4 Patient resource or Document Bundle. Matched fields will pre-fill this form.</p>
                    <textarea rows={4} placeholder='{"resourceType":"Patient", ...}' className="w-full p-2 border border-slate-300 rounded text-xs font-mono focus:ring-2 focus:ring-teal-500 outline-none resize-none" value={fhirJson} onChange={e => setFhirJson(e.target.value)} />
                    {fhirImportError && <p className="text-xs text-red-600 flex items-center gap-1"><X className="w-3.5 h-3.5 shrink-0" /> {fhirImportError}</p>}
                    <button type="button" onClick={handleFhirImport} disabled={!fhirJson.trim()} className="w-full py-1.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white text-xs font-semibold rounded transition-colors">Parse &amp; Fill Form</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Patient Details ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Patient Name</label>
                  <input required type="text" className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Age</label>
                    <input required type="number" className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Gender</label>
                    <select className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value as Gender})}>
                      <option value={Gender.Male}>Male</option>
                      <option value={Gender.Female}>Female</option>
                      <option value={Gender.Other}>Other</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Diagnosis</label>
                <textarea required rows={2} className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={formData.diagnosis} onChange={e => setFormData({...formData, diagnosis: e.target.value})} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Comorbidities</label>
                <input type="text" placeholder="Type custom comorbidity and press Enter…" className="w-full text-sm p-2 border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none mb-3" value={customComorbidity} onChange={e => setCustomComorbidity(e.target.value)} onKeyDown={addCustomComorbidity} />
                {selectedComorbidities.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                    {selectedComorbidities.map(c => (
                      <span key={c} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${getTagColor(c)} shadow-sm`}>
                        {c}
                        <button type="button" onClick={() => toggleComorbidity(c)} aria-label={`Remove ${c}`} className="hover:bg-black/10 rounded-full p-1"><X className="w-3.5 h-3.5" /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                  {COMORBIDITY_OPTIONS.filter(opt => !selectedComorbidities.includes(opt)).map(opt => (
                    <button key={opt} type="button" onClick={() => toggleComorbidity(opt)} className="px-2 py-1 rounded-md text-xs border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all">+ {opt}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Status & Plan ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">PAC Status</label>
                  <select className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" value={formData.pacStatus} onChange={e => setFormData({...formData, pacStatus: e.target.value as PacStatus})}>
                    {Object.values(PacStatus).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Patient Status</label>
                  <input type="text" className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={formData.patientStatus} placeholder="e.g. Fit, Review, Critical" onChange={e => setFormData({...formData, patientStatus: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date of Admission</label>
                  <input type="date" className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={formData.doa} onChange={e => setFormData({...formData, doa: e.target.value})} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Procedure</label>
                  <input type="text" placeholder="Planned or Completed Procedure" className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={formData.procedure} onChange={e => setFormData({...formData, procedure: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date of Surgery (If completed)</label>
                <input type="date" max={new Date().toISOString().split('T')[0]} className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none" value={formData.dos} onChange={e => setFormData({...formData, dos: e.target.value})} />
                <p className="text-[10px] text-slate-400 mt-1">Leave blank if surgery is pending.</p>
              </div>
            </div>
          )}

          {/* ── Navigation footer ── */}
          <div className="pt-2 space-y-1">
            <div className="flex gap-3">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => { setStepError(null); setStep(step - 1); }}
                  className="flex-1 min-h-[44px] px-4 py-2.5 border border-slate-300 rounded text-slate-600 hover:bg-slate-50 font-medium"
                >
                  ← Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { sessionStorage.removeItem(STEP_KEY); onClose(); }}
                  className="flex-1 min-h-[44px] px-4 py-2.5 border border-slate-300 rounded text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
              )}
              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => {
                    const err = validateStep(step);
                    if (err) { setStepError(err); return; }
                    setStepError(null);
                    setStep(step + 1);
                  }}
                  className="flex-1 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded transition-colors"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 min-h-[44px] bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-2.5 rounded flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {initialData ? 'Update Patient' : 'Admit Patient'}
                </button>
              )}
            </div>
            {/* Inline step validation error */}
            {stepError && (
              <p className="text-xs text-red-600 mt-1">{stepError}</p>
            )}
          </div>
        </form>
      </div>
    </div>

    {/* DPDP Act 2023 consent gate — shown above the main modal (z-[400]) */}
    {showConsent && (
      <PatientConsentModal
        patientName={formData.name}
        onAccept={handleConsentAccepted}
        onCancel={() => { setShowConsent(false); setIsSubmitting(false); }}
      />
    )}
    </>
  );
};

export default AddPatientModal;
