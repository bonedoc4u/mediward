import React, { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { KeyboardAwareView } from './ui/KeyboardAwareView';
import { Patient, Gender, PacStatus, PatientStatus, Ward } from '../types';
import { useConfig, useAuth } from '../contexts/AppContext';
import { X, Save, UserPlus, Pencil, Loader2, ScanLine, Settings2, AlertTriangle } from 'lucide-react';
import BottomSheetPicker from './ui/BottomSheetPicker';
import { supabase } from '../lib/supabase';
import PatientConsentModal, { CONSENT_VERSION } from './PatientConsentModal';
import { useComorbidityPresets } from '../hooks/useComorbidityPresets';
import PresetEditor from './admission/PresetEditor';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (patient: Patient) => void;
  initialData?: Patient | null;
}

// ─── OCR result shape returned by parse-admission-slip Edge Function ──────────
interface OCRResult {
  patient_name: string;
  age: string;
  gender: string;
  ip_number: string;
  date_of_admission: string; // DD/MM/YYYY
  mobile_number: string;
  mobile_conflict: string;
  diagnosis: string;
  mode_of_injury: string;
  comorbidities: string[];
}

const MODE_OF_INJURY_OPTIONS = [
  'RTA', 'Slip and Fall', 'Fall from Height', 'Trivial Fall',
  'Direct Blow', 'Sports Injury', 'Assault', 'Pathological', 'Other',
];

const COLORS = [
  'bg-red-100 text-red-800', 'bg-orange-100 text-orange-800', 'bg-amber-100 text-amber-800',
  'bg-green-100 text-green-800', 'bg-emerald-100 text-emerald-800', 'bg-teal-100 text-teal-800',
  'bg-cyan-100 text-cyan-800', 'bg-sky-100 text-sky-800', 'bg-blue-100 text-blue-800',
  'bg-indigo-100 text-indigo-800', 'bg-violet-100 text-violet-800', 'bg-purple-100 text-purple-800',
  'bg-fuchsia-100 text-fuchsia-800', 'bg-pink-100 text-pink-800', 'bg-rose-100 text-rose-800',
];

const STEP_LABELS = ['Location & Identity', 'Patient Details', 'Status & Plan'];

interface AdmitFormState {
  bed: string; ward: Ward; unit: string; ipNo: string;
  name: string; age: string; gender: Gender; mobile: string;
  diagnosis: string; modeOfInjury: string; doa: string; procedure: string; dos: string;
  pacStatus: PacStatus; patientStatus: PatientStatus;
}

// Parse DD/MM/YYYY → YYYY-MM-DD for the date input
function parseDDMMYYYY(s: string): string | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

const AddPatientModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialData }) => {
  const { wards, unitOptions } = useConfig();
  const { user } = useAuth();
  const { presets, savePresets } = useComorbidityPresets();

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const activeWards = wards
    .filter(w => w.active)
    .filter(w => {
      if (!user?.unit) return true;
      return !w.unit?.length || w.unit.includes(user.unit) || w.isIcu;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const defaultWard = activeWards[0]?.name ?? '';
  const defaultUnit = user?.unit ?? '';

  useEffect(() => {
    setFormData(prev => {
      const wardStillValid = activeWards.some(w => w.name === prev.ward);
      const firstWard = activeWards[0]?.name ?? '';
      const correctUnit = isAdmin ? prev.unit : (user?.unit ?? prev.unit ?? '');
      return {
        ...prev,
        ward: wardStillValid ? prev.ward : (firstWard as Ward) || prev.ward,
        unit: correctUnit,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWards.map(w => w.name).join(','), user?.unit]);

  const STEP_KEY = 'mediward_admit_step';

  const [formData, setFormData] = useState<AdmitFormState>(() => {
    if (initialData) {
      return {
        bed: initialData.bed,
        ward: (initialData.ward || defaultWard) as Ward,
        unit: initialData.unit ?? defaultUnit,
        ipNo: initialData.ipNo,
        name: initialData.name,
        age: initialData.age.toString(),
        gender: initialData.gender,
        mobile: initialData.mobile,
        diagnosis: initialData.diagnosis,
        modeOfInjury: initialData.modeOfInjury ?? '',
        doa: initialData.doa,
        procedure: initialData.procedure || '',
        dos: initialData.dos || '',
        pacStatus: initialData.pacStatus,
        patientStatus: initialData.patientStatus,
      };
    }
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
      name: '',
      age: '',
      gender: Gender.Male,
      mobile: '',
      diagnosis: '',
      modeOfInjury: '',
      doa: new Date().toISOString().split('T')[0],
      procedure: '',
      dos: '',
      pacStatus: PacStatus.Pending,
      patientStatus: PatientStatus.Review,
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

  const [stepError, setStepError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [showComorbidityPicker, setShowComorbidityPicker] = useState(false);
  const [showPresetEditor, setShowPresetEditor] = useState(false);
  const [presetEditorPrefill, setPresetEditorPrefill] = useState('');

  const validateStep = (s: number): string | null => {
    if (s === 1) {
      if (!formData.ipNo.trim()) return 'IP Number is required.';
      if (!formData.ward) return 'Ward is required.';
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

  const [selectedComorbidities, setSelectedComorbidities] = useState<string[]>(() => {
    if (initialData?.comorbidities) return initialData.comorbidities;
    try {
      const saved = sessionStorage.getItem(STEP_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.selectedComorbidities) return parsed.selectedComorbidities;
      }
    } catch { /* ignore */ }
    return [];
  });
  const [customComorbidity, setCustomComorbidity] = useState('');

  const [drugAllergies, setDrugAllergies] = useState<string[]>(() => {
    if (initialData?.drugAllergies) return initialData.drugAllergies;
    try {
      const saved = sessionStorage.getItem(STEP_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.drugAllergies) return parsed.drugAllergies;
      }
    } catch { /* ignore */ }
    return [];
  });
  const [customAllergyInput, setCustomAllergyInput] = useState('');

  useEffect(() => {
    if (!initialData) {
      const timer = setTimeout(() => {
        try {
          sessionStorage.setItem(STEP_KEY, JSON.stringify({
            step, formData, selectedComorbidities, drugAllergies,
          }));
        } catch { /* ignore */ }
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [formData, step, selectedComorbidities, drugAllergies, initialData]);

  // ── Scan Slip (OCR) ──────────────────────────────────────────────────────────
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  // ocrValues tracks what OCR set for each field: badge shows while value matches
  const [ocrValues, setOcrValues] = useState<Record<string, string>>({});
  const [ocrComorbidities, setOcrComorbidities] = useState<string[]>([]);
  const [ocrMobileConflict, setOcrMobileConflict] = useState<string | null>(null);
  const [ocrUnrecognised, setOcrUnrecognised] = useState<string[]>([]);
  const [showOcrBanner, setShowOcrBanner] = useState(false);
  const [ocrFilledCount, setOcrFilledCount] = useState(0);

  const today = new Date().toISOString().split('T')[0];

  const processOcrResult = (r: OCRResult, prevForm: AdmitFormState, prevComorbs: string[]) => {
    const updates: Partial<AdmitFormState> = {};
    const filled: Record<string, string> = {};

    if (r.ip_number && !prevForm.ipNo) {
      updates.ipNo = r.ip_number; filled.ipNo = r.ip_number;
    }
    if (r.date_of_admission) {
      const parsed = parseDDMMYYYY(r.date_of_admission);
      if (parsed && (!prevForm.doa || prevForm.doa === today)) {
        updates.doa = parsed; filled.doa = parsed;
      }
    }
    if (r.mobile_number && !prevForm.mobile) {
      updates.mobile = r.mobile_number; filled.mobile = r.mobile_number;
    }
    if (r.patient_name && !prevForm.name) {
      updates.name = r.patient_name; filled.name = r.patient_name;
    }
    if (r.age && !prevForm.age) {
      updates.age = r.age; filled.age = r.age;
    }
    if (r.gender) {
      const g = r.gender === 'Female' ? Gender.Female : r.gender === 'Male' ? Gender.Male : null;
      if (g) { updates.gender = g; filled.gender = g; }
    }
    if (r.diagnosis && !prevForm.diagnosis) {
      updates.diagnosis = r.diagnosis; filled.diagnosis = r.diagnosis;
    }
    if (r.mode_of_injury && !prevForm.modeOfInjury) {
      updates.modeOfInjury = r.mode_of_injury; filled.modeOfInjury = r.mode_of_injury;
    }

    // Comorbidities — merge only new ones
    const newComorbs = (r.comorbidities ?? []).filter(c => c && !prevComorbs.includes(c));
    const unrecog = (r.comorbidities ?? []).filter(c => c && !presets.includes(c));

    return { updates, filled, newComorbs, unrecog, mobileConflict: r.mobile_conflict || null };
  };

  const handleScanBase64 = async (base64: string, mimeType: string) => {
    setScanError(null);
    setScanLoading(true);
    setOcrValues({});
    setOcrComorbidities([]);
    setOcrMobileConflict(null);
    setOcrUnrecognised([]);
    setShowOcrBanner(false);

    try {
      const { data, error } = await supabase.functions.invoke('parse-admission-slip', {
        body: { image: base64, mimeType, presets },
      });
      if (error) throw new Error(error.message ?? 'OCR failed');

      const r = data as OCRResult;
      let filledRecord: Record<string, string> = {};
      let newCombsResult: string[] = [];

      setFormData(prev => {
        const { updates, filled, newComorbs } = processOcrResult(r, prev, selectedComorbidities);
        filledRecord = filled;
        newCombsResult = newComorbs;
        return { ...prev, ...updates };
      });

      // Merge new comorbidities — run after setFormData settles
      setTimeout(() => {
        if (newCombsResult.length > 0) {
          setSelectedComorbidities(prev => [...prev, ...newCombsResult.filter(c => !prev.includes(c))]);
        }
      }, 0);

      const { unrecog, mobileConflict } = processOcrResult(r, formData, selectedComorbidities);
      setOcrValues(filledRecord);
      setOcrComorbidities(r.comorbidities ?? []);
      setOcrUnrecognised(unrecog);
      setOcrMobileConflict(mobileConflict);

      const count = Object.keys(filledRecord).length + (r.comorbidities?.length ?? 0);
      setOcrFilledCount(count);
      if (count > 0) setShowOcrBanner(true);

      setStepRaw(1); // go to step 1 so user can verify
    } catch (err: unknown) {
      setScanError(
        err instanceof Error ? err.message : 'Could not read case sheet — please enter details manually.'
      );
    } finally {
      setScanLoading(false);
      if (scanInputRef.current) scanInputRef.current.value = '';
    }
  };

  const handleScanFile = async (file: File) => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1] ?? (reader.result as string));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
    await handleScanBase64(base64, file.type || 'image/jpeg');
  };

  const triggerScan = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
        const photo = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Camera,
        });
        if (photo.base64String) {
          await handleScanBase64(photo.base64String, `image/${photo.format ?? 'jpeg'}`);
        }
        return;
      } catch {
        // User cancelled or camera unavailable — fall through to file input
      }
    }
    scanInputRef.current?.click();
  };

  // OCR badge: shows when current field value still matches what OCR set
  const ScanBadge: React.FC<{ field: string; value: string }> = ({ field, value }) => {
    if (!ocrValues[field] || ocrValues[field] !== value) return null;
    return (
      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold bg-blue-100 text-blue-700 rounded uppercase tracking-wide leading-none">
        FROM SCAN
      </span>
    );
  };

  // ── Focus trap ───────────────────────────────────────────────────────────────
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

  useEffect(() => {
    const first = dialogRef.current?.querySelector<HTMLElement>('input, select, textarea');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [step]);

  useEffect(() => {
    setIsSubmitting(false);
    setStepError(null);
    setShowConsent(false);
    setShowComorbidityPicker(false);
    setScanError(null);
    setScanLoading(false);
    setOcrValues({});
    setOcrComorbidities([]);
    setOcrMobileConflict(null);
    setOcrUnrecognised([]);
    setShowOcrBanner(false);

    if (isOpen && initialData) {
      setFormData({
        bed: initialData.bed,
        ward: initialData.ward || defaultWard,
        unit: initialData.unit ?? defaultUnit,
        ipNo: initialData.ipNo,
        name: initialData.name,
        age: initialData.age.toString(),
        gender: initialData.gender,
        mobile: initialData.mobile,
        diagnosis: initialData.diagnosis,
        modeOfInjury: initialData.modeOfInjury ?? '',
        doa: initialData.doa,
        procedure: initialData.procedure || '',
        dos: initialData.dos || '',
        pacStatus: initialData.pacStatus,
        patientStatus: initialData.patientStatus,
      });
      setSelectedComorbidities(initialData.comorbidities || []);
      setDrugAllergies(initialData.drugAllergies ?? []);
    } else if (isOpen && !initialData) {
      try {
        const saved = sessionStorage.getItem(STEP_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.formData) {
            const restoredForm = {
              ...parsed.formData,
              unit: !isAdmin && user?.unit ? user.unit : parsed.formData.unit,
            };
            setFormData(restoredForm);
            if (parsed.selectedComorbidities) setSelectedComorbidities(parsed.selectedComorbidities);
            if (parsed.drugAllergies) setDrugAllergies(parsed.drugAllergies);
            const n = parsed.step ? parseInt(String(parsed.step), 10) : 1;
            setStepRaw(n >= 1 && n <= 3 ? n : 1);
            return;
          }
        }
      } catch { /* ignore */ }
      setFormData({
        bed: '',
        ward: defaultWard,
        unit: defaultUnit,
        ipNo: '',
        name: '',
        age: '',
        gender: Gender.Male,
        mobile: '',
        diagnosis: '',
        modeOfInjury: '',
        doa: new Date().toISOString().split('T')[0],
        procedure: '',
        dos: '',
        pacStatus: PacStatus.Pending,
        patientStatus: PatientStatus.Review,
      });
      setSelectedComorbidities([]);
      setDrugAllergies([]);
    }
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

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!initialData && !showConsent) {
      setShowConsent(true);
      return;
    }
    setIsSubmitting(true);
    const patientData: Patient = {
      ...((initialData || {}) as any),
      bed: formData.bed,
      ward: formData.ward,
      unit: (!isAdmin && user?.unit) ? user.unit : (formData.unit || undefined),
      ipNo: formData.ipNo,
      name: formData.name,
      age: parseInt(formData.age) || 0,
      gender: formData.gender,
      mobile: formData.mobile,
      diagnosis: formData.diagnosis,
      modeOfInjury: formData.modeOfInjury || undefined,
      comorbidities: selectedComorbidities,
      drugAllergies,
      doa: formData.doa,
      procedure: formData.procedure,
      dos: formData.dos || undefined,
      pacStatus: formData.pacStatus as PacStatus,
      patientStatus: formData.patientStatus,
      dailyRounds: initialData?.dailyRounds || [],
      investigations: initialData?.investigations || [],
      labResults: initialData?.labResults || [],
      todos: initialData?.todos || [],
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
    setIsSubmitting(true);
    const patientData: Patient = {
      ...({} as any),
      bed: formData.bed,
      ward: formData.ward,
      unit: (!isAdmin && user?.unit) ? user.unit : (formData.unit || undefined),
      ipNo: formData.ipNo,
      name: formData.name,
      age: parseInt(formData.age) || 0,
      gender: formData.gender,
      mobile: formData.mobile,
      diagnosis: formData.diagnosis,
      modeOfInjury: formData.modeOfInjury || undefined,
      comorbidities: selectedComorbidities,
      drugAllergies,
      doa: formData.doa,
      procedure: formData.procedure,
      dos: formData.dos || undefined,
      pacStatus: formData.pacStatus as PacStatus,
      patientStatus: formData.patientStatus,
      dailyRounds: [],
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

  const getTagColor = (tag: string) => COLORS[tag.length % COLORS.length];

  return (
    <>
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={initialData ? 'Edit Patient Details' : 'Admit New Patient'}
        data-modal="add-patient"
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90svh] overflow-y-auto flex flex-col outline-none"
      >

        {/* ── Sticky header with progress bar ── */}
        <div className="sticky top-0 z-10 bg-slate-50 rounded-t-lg border-b border-slate-200">
          <div className="p-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              {initialData ? <Pencil className="w-5 h-5 text-teal-600" /> : <UserPlus className="w-5 h-5 text-teal-600" />}
              <h3 className="font-bold text-slate-800">{initialData ? 'Edit Patient Details' : 'Admit New Patient'}</h3>
            </div>
            <div className="flex items-center gap-2">
              {/* Hidden file input for web/desktop */}
              <input
                ref={scanInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleScanFile(f); }}
              />
              <button
                type="button"
                title="Scan admission slip"
                onClick={triggerScan}
                disabled={scanLoading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {scanLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <ScanLine className="w-3.5 h-3.5" />}
                {scanLoading ? 'Scanning…' : 'Scan Slip'}
              </button>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close modal">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="px-4 pb-1">
            <div className="flex gap-1 mt-2">
              {[1, 2, 3].map(s => (
                <div
                  key={s}
                  className={`flex-1 h-1.5 rounded-full transition-colors duration-200 ${
                    s < step ? 'bg-teal-600' : s === step ? 'bg-blue-400' : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>

            {/* Scan error banner */}
            {scanError && (
              <p className="mt-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{scanError}</p>
            )}

            {/* Step labels */}
            <div className="flex justify-between px-1 mt-0.5 pb-2">
              {STEP_LABELS.map((label, i) => (
                initialData ? (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setStepError(null); setStepRaw(i + 1); }}
                    className={`text-[10px] font-medium transition-colors ${
                      step === i + 1 ? 'text-teal-600' : 'text-slate-400 hover:text-blue-400'
                    }`}
                  >
                    {label}
                  </button>
                ) : (
                  <span
                    key={i}
                    className={`text-[10px] font-medium ${step === i + 1 ? 'text-teal-600' : 'text-slate-400'}`}
                  >
                    {label}
                  </span>
                )
              ))}
            </div>
          </div>
        </div>

        {/* ── Scanning overlay ── */}
        {scanLoading && (
          <div className="absolute inset-0 z-20 bg-white/80 flex flex-col items-center justify-center gap-3 rounded-lg">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-sm font-semibold text-slate-700">Reading case sheet…</p>
          </div>
        )}

        <KeyboardAwareView>
        <form onSubmit={handleSubmit} autoComplete="off" className="p-4 sm:p-6 space-y-4 sm:space-y-5">

          {/* ── OCR success banner (dismissable) ── */}
          {showOcrBanner && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
              <span>✓ {ocrFilledCount} field{ocrFilledCount !== 1 ? 's' : ''} extracted from scan — highlighted below</span>
              <button
                type="button"
                onClick={() => setShowOcrBanner(false)}
                className="text-blue-400 hover:text-blue-600 shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* ── Step 1: Location & Identity ── */}
          {step === 1 && (
            <div className="space-y-4">
              {activeWards.length === 0 && (
                <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  <span className="text-amber-500 shrink-0">⚠️</span>
                  <span>No wards configured yet. Go to <strong>Admin Settings → Wards</strong> and add your wards first.</span>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ward</label>
                  <BottomSheetPicker
                    title="Select Ward"
                    value={formData.ward}
                    disabled={activeWards.length === 0}
                    placeholder="— No wards configured —"
                    options={activeWards.map(w => ({ value: w.name, label: w.name }))}
                    onChange={val => {
                      const selectedWard = activeWards.find(w => w.name === val);
                      setFormData(prev => ({
                        ...prev,
                        ward: val as Ward,
                        unit: isAdmin
                          ? (selectedWard?.unit?.length === 1 ? selectedWard.unit[0] : prev.unit)
                          : prev.unit,
                      }));
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Unit{!isAdmin && <span className="ml-1 text-slate-500 normal-case font-normal">(your unit)</span>}
                  </label>
                  {isAdmin ? (
                    <BottomSheetPicker
                      title="Select Unit"
                      value={formData.unit ?? ''}
                      placeholder="— Unassigned —"
                      options={[{ value: '', label: '— Unassigned —' }, ...unitOptions.map(u => ({ value: u, label: u }))]}
                      onChange={val => setFormData({ ...formData, unit: val })}
                    />
                  ) : (
                    <input type="text" readOnly className="w-full p-2 border border-slate-200 rounded text-sm bg-slate-50 text-slate-600 cursor-not-allowed" value={formData.unit || '—'} />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bed No.</label>
                  <input type="text" className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none" value={formData.bed} onChange={e => setFormData({...formData, bed: e.target.value})} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    IP Number
                    <ScanBadge field="ipNo" value={formData.ipNo} />
                  </label>
                  <input
                    type="text"
                    className={`w-full p-2 border rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none ${ocrValues.ipNo && ocrValues.ipNo === formData.ipNo ? 'border-blue-300 bg-blue-50/40' : 'border-slate-300'}`}
                    value={formData.ipNo}
                    disabled={!!initialData}
                    onChange={e => setFormData({...formData, ipNo: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Date of Admission
                    <ScanBadge field="doa" value={formData.doa} />
                  </label>
                  <input
                    type="date"
                    max={new Date().toISOString().split('T')[0]}
                    className={`w-full p-2 min-h-[44px] border rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none ${ocrValues.doa && ocrValues.doa === formData.doa ? 'border-blue-300 bg-blue-50/40' : 'border-slate-300'}`}
                    value={formData.doa}
                    onChange={e => setFormData({...formData, doa: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Mobile Number
                    <ScanBadge field="mobile" value={formData.mobile} />
                  </label>
                  <input
                    type="tel"
                    className={`w-full p-2 border rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none ${ocrValues.mobile && ocrValues.mobile === formData.mobile ? 'border-blue-300 bg-blue-50/40' : 'border-slate-300'}`}
                    value={formData.mobile}
                    onChange={e => setFormData({...formData, mobile: e.target.value})}
                  />
                  {/* Phone conflict warning */}
                  {ocrMobileConflict && (
                    <p className="mt-1 flex items-start gap-1 text-xs text-amber-700">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      Sticker had a different number: {ocrMobileConflict} — verify which is current
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Patient Details ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    Patient Name
                    <ScanBadge field="name" value={formData.name} />
                  </label>
                  <input
                    required
                    type="text"
                    className={`w-full p-2 border rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none ${ocrValues.name && ocrValues.name === formData.name ? 'border-blue-300 bg-blue-50/40' : 'border-slate-300'}`}
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                      Age
                      <ScanBadge field="age" value={formData.age} />
                    </label>
                    <input
                      required
                      type="number"
                      className={`w-full p-2 border rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none ${ocrValues.age && ocrValues.age === formData.age ? 'border-blue-300 bg-blue-50/40' : 'border-slate-300'}`}
                      value={formData.age}
                      onChange={e => setFormData({...formData, age: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                      Gender
                      <ScanBadge field="gender" value={formData.gender} />
                    </label>
                    <BottomSheetPicker
                      title="Select Gender"
                      value={formData.gender}
                      options={Object.values(Gender).map(g => ({ value: g, label: g }))}
                      onChange={val => setFormData({ ...formData, gender: val as Gender })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Diagnosis
                  <ScanBadge field="diagnosis" value={formData.diagnosis} />
                </label>
                <textarea
                  required
                  rows={2}
                  className={`w-full p-2 border rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none ${ocrValues.diagnosis && ocrValues.diagnosis === formData.diagnosis ? 'border-blue-300 bg-blue-50/40' : 'border-slate-300'}`}
                  value={formData.diagnosis}
                  onChange={e => setFormData({...formData, diagnosis: e.target.value})}
                />
              </div>

              {/* Mode of Injury */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Mode of Injury
                  <ScanBadge field="modeOfInjury" value={formData.modeOfInjury} />
                </label>
                <BottomSheetPicker
                  title="Select Mode of Injury"
                  value={formData.modeOfInjury}
                  placeholder="— Not specified —"
                  options={[{ value: '', label: '— Not specified —' }, ...MODE_OF_INJURY_OPTIONS.map(m => ({ value: m, label: m }))]}
                  onChange={val => setFormData({ ...formData, modeOfInjury: val })}
                />
              </div>

              {/* Comorbidities */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                    Comorbidities
                    <button
                      type="button"
                      onClick={() => { setPresetEditorPrefill(''); setShowPresetEditor(true); }}
                      title="Edit comorbidity presets"
                      className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
                      aria-label="Edit comorbidity presets"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowComorbidityPicker(v => !v)}
                    className="text-xs text-teal-600 hover:text-blue-800 font-medium"
                  >
                    {showComorbidityPicker ? 'Hide list' : '+ Add'}
                  </button>
                </div>
                {selectedComorbidities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
                    {selectedComorbidities.map(c => (
                      <span
                        key={c}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold shadow-sm ${getTagColor(c)} ${ocrComorbidities.includes(c) ? 'ring-1 ring-blue-400' : ''}`}
                      >
                        {c}
                        {ocrComorbidities.includes(c) && (
                          <span className="text-[8px] font-bold text-blue-600 leading-none">✦</span>
                        )}
                        <button type="button" onClick={() => toggleComorbidity(c)} aria-label={`Remove ${c}`} className="hover:bg-black/10 rounded-full p-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {selectedComorbidities.length === 0 && !showComorbidityPicker && (
                  <p className="text-xs text-slate-500 py-1">None recorded.</p>
                )}
                {showComorbidityPicker && (
                  <div className="border border-slate-200 rounded-lg p-2 bg-white">
                    <input
                      type="text"
                      placeholder="Type custom and press Enter…"
                      className="w-full text-sm p-2 border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500 outline-none mb-2"
                      value={customComorbidity}
                      onChange={e => setCustomComorbidity(e.target.value)}
                      onKeyDown={addCustomComorbidity}
                    />
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-0.5">
                      {presets.filter(opt => !selectedComorbidities.includes(opt)).map(opt => (
                        <button key={opt} type="button" onClick={() => toggleComorbidity(opt)} className="px-2 py-1 rounded-md text-xs border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-teal-600 hover:bg-blue-50 transition-all">
                          + {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Unrecognised comorbidity warning */}
                {ocrUnrecognised.length > 0 && (
                  <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      OCR found unrecognised: <strong>{ocrUnrecognised.join(', ')}</strong>
                      {' — '}
                      <button
                        type="button"
                        className="underline font-semibold"
                        onClick={() => {
                          setPresetEditorPrefill(ocrUnrecognised[0]);
                          setShowPresetEditor(true);
                        }}
                      >
                        Add to presets →
                      </button>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Status & Plan ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                  Drug Allergies <span className="normal-case font-normal text-red-500 ml-1">⚠ Safety critical</span>
                </label>
                <input
                  type="text"
                  placeholder="Type allergy and press Enter (e.g. Penicillin, NSAIDs)…"
                  className="w-full text-sm p-2 border border-red-200 rounded-md bg-red-50 focus:bg-white focus:ring-2 focus:ring-red-400 outline-none mb-2"
                  value={customAllergyInput}
                  onChange={e => setCustomAllergyInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && customAllergyInput.trim()) {
                      e.preventDefault();
                      const val = customAllergyInput.trim();
                      if (!drugAllergies.includes(val)) setDrugAllergies(prev => [...prev, val]);
                      setCustomAllergyInput('');
                    }
                  }}
                />
                {drugAllergies.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {drugAllergies.map(a => (
                      <span key={a} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 shadow-sm">
                        {a}
                        <button type="button" onClick={() => setDrugAllergies(prev => prev.filter(x => x !== a))} aria-label={`Remove ${a}`} className="hover:bg-red-200 rounded-full p-0.5"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No known drug allergies recorded.</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">PAC Status</label>
                  <BottomSheetPicker
                    title="PAC Status"
                    value={formData.pacStatus}
                    options={Object.values(PacStatus).map(s => ({ value: s, label: s }))}
                    onChange={val => setFormData({ ...formData, pacStatus: val as PacStatus })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Patient Status</label>
                  <BottomSheetPicker
                    title="Patient Status"
                    value={formData.patientStatus}
                    options={Object.values(PatientStatus).map(s => ({ value: s, label: s }))}
                    onChange={val => setFormData({ ...formData, patientStatus: val as PatientStatus })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date of Admission</label>
                  <input type="date" className="w-full p-2 min-h-[44px] border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none" value={formData.doa} onChange={e => setFormData({...formData, doa: e.target.value})} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Procedure</label>
                  <input type="text" placeholder="Planned or Completed Procedure" className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none" value={formData.procedure} onChange={e => setFormData({...formData, procedure: e.target.value})} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date of Surgery (If completed)</label>
                <input type="date" max={new Date().toISOString().split('T')[0]} className="w-full p-2 min-h-[44px] border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none" value={formData.dos} onChange={e => setFormData({...formData, dos: e.target.value})} />
                <p className="text-[10px] text-slate-500 mt-1">Leave blank if surgery is pending.</p>
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
                  className="flex-1 min-h-[44px] bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded transition-colors"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 min-h-[44px] bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-bold py-2.5 rounded flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {initialData ? 'Update Patient' : 'Admit Patient'}
                </button>
              )}
            </div>
            {stepError && (
              <p className="text-xs text-red-600 mt-1">{stepError}</p>
            )}
          </div>
        </form>
        </KeyboardAwareView>
      </div>
    </div>

    {/* DPDP consent gate */}
    {showConsent && (
      <PatientConsentModal
        patientName={formData.name}
        onAccept={handleConsentAccepted}
        onCancel={() => { setShowConsent(false); setIsSubmitting(false); }}
      />
    )}

    {/* Comorbidity preset editor */}
    {showPresetEditor && (
      <PresetEditor
        presets={presets}
        prefill={presetEditorPrefill}
        onSave={savePresets}
        onClose={() => { setShowPresetEditor(false); setPresetEditorPrefill(''); }}
      />
    )}
    </>
  );
};

export default AddPatientModal;
