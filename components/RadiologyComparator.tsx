import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Patient, Investigation } from '../types';
import { useAuth } from '../contexts/AppContext';
import {
  ImageIcon, Camera, X,
  CloudUpload, FileDown, Loader2, Search, ChevronDown, ChevronRight, Leaf,
  Crop as CropIcon,
} from 'lucide-react';
import ImageEditor from './radiology/ImageEditor';
import { uploadInvestigationImage, deleteInvestigationImage, validateImageFile, isPdfPath } from '../services/storageService';
import { useSignedUrl } from '../hooks/useSignedUrl';
import { getModality } from './radiology/modality';
import Lightbox from './radiology/Lightbox';
import { generateId } from '../utils/sanitize';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { exportRadiologyPDF } from '../utils/exportRadiologyPDF';
import { compressImage } from '../utils/imageUtils';
import BottomSheetPicker from './ui/BottomSheetPicker';
import { todayYmd } from '../utils/dates';
import { getAdmissionDayCohort } from '../utils/calculations';

type RadPhase = 'preop' | 'postop';

interface Props {
  patients: Patient[];
  onAddInvestigation: (patientId: string, investigation: Investigation) => void;
  onDeleteInvestigation?: (patientId: string, investigationId: string) => void;
  initialPatientId?: string;
}

// ─── ImageCard ────────────────────────────────────────────────────────────────
const ImageCard: React.FC<{
  inv: Investigation;
  onDelete?: () => void;
  onClick?: () => void;
}> = ({ inv, onDelete, onClick }) => {
  const cfg      = getModality(inv.type);
  const Icon     = cfg.Icon;
  const signedUrl = useSignedUrl(inv.imageUrl);
  const fmtDate = new Date(inv.date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: '2-digit',
  });

  return (
    <div
      className="group rounded-xl border border-slate-200 overflow-hidden cursor-pointer
                  hover:border-teal-300 hover:-translate-y-0.5 hover:shadow-sm
                  transition-all active:scale-[0.98]"
      onClick={onClick}
    >
      <div className={`h-[72px] flex items-center justify-center relative ${cfg.bg}`}>
        {inv.imageUrl
          ? (isPdfPath(inv.imageUrl)
              ? <Icon className="w-7 h-7 text-white/60" />
              : (signedUrl
                  ? <img src={signedUrl} alt={inv.type} className="w-full h-full object-cover" />
                  : <Loader2 className="w-5 h-5 text-white/30 animate-spin" />))
          : <Icon className="w-7 h-7 text-white/25" />
        }
        {onDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="absolute top-1 right-1 bg-red-600/80 hover:bg-red-600 text-white
                       p-1 rounded-full opacity-0 group-hover:opacity-100
                       [@media(hover:none)]:opacity-100 transition-opacity"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="p-2 bg-white">
        <span className={`text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.badge}`}>
          {inv.type}
        </span>
        <p className="text-[11px] font-semibold text-slate-700 mt-1 leading-tight truncate">
          {inv.findings || inv.type}
        </p>
        <p className="text-[10px] text-slate-400">{fmtDate}</p>
      </div>
    </div>
  );
};

// ─── UploadCard ───────────────────────────────────────────────────────────────
const UploadCard: React.FC<{
  phase: RadPhase;
  onClick: () => void;
}> = ({ phase, onClick }) => (
  <button
    onClick={onClick}
    className={`rounded-xl border-2 border-dashed min-h-[116px] w-full
                flex flex-col items-center justify-center gap-1.5
                cursor-pointer transition-all ${
      phase === 'preop'
        ? 'border-blue-200 bg-blue-50/30 hover:border-blue-400 hover:bg-blue-50'
        : 'border-teal-200 bg-teal-50/30 hover:border-teal-400 hover:bg-teal-50'
    }`}
  >
    <CloudUpload className={`w-5 h-5 ${phase === 'preop' ? 'text-blue-400' : 'text-teal-400'}`} />
    <span className="text-[10px] font-semibold text-slate-500">
      Add {phase === 'preop' ? 'pre-op' : 'post-op'}
    </span>
    <span className="text-[9px] text-slate-400">JPEG · PNG · PDF</span>
  </button>
);

// ─── Section Header ───────────────────────────────────────────────────────────
const SectionHeader: React.FC<{
  phase: RadPhase;
  count: number;
  patient: Patient;
  scans: Investigation[];
}> = ({ phase, count, patient, scans }) => {
  const [progress, setProgress] = useState<number | null>(null);
  const isPreOp = phase === 'preop';
  const label   = isPreOp ? 'PRE-OP' : 'POST-OP';

  const handleExport = async () => {
    setProgress(0);
    try {
      await exportRadiologyPDF(
        {
          name: patient.name,
          age: patient.age,
          gender: patient.gender,
          ipNo: patient.ipNo,
          ward: patient.ward,
          diagnosis: patient.diagnosis,
          dos: patient.dos,
        },
        // PDF attachments (e.g. Culture Reports) can't be embedded as images in
        // this X-ray comparison export — exclude them rather than showing a
        // misleading "Image unavailable" page for a report that does exist.
        scans.filter(s => !isPdfPath(s.imageUrl)).map(s => ({
          type: s.type,
          region: s.findings,
          date: s.date,
          imageUrl: s.imageUrl,
        })),
        isPreOp ? 'PreOp' : 'PostOp',
        setProgress,
      );
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={`text-[9px] font-bold px-2 py-1 rounded-full ${
        isPreOp
          ? 'bg-blue-100 text-blue-700 border border-blue-200'
          : 'bg-teal-100 text-teal-700 border border-teal-200'
      }`}>
        {label}
      </span>
      <span className="text-sm font-bold text-slate-700">Investigations</span>
      <span className="text-xs text-slate-400">({count})</span>
      <div className="flex-1" />
      <button
        onClick={handleExport}
        disabled={count === 0 || progress !== null}
        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg
                    border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
          isPreOp
            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-600 hover:text-white hover:border-blue-600'
            : 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-600 hover:text-white hover:border-teal-600'
        }`}
      >
        {progress !== null ? (
          <><Loader2 className="w-3.5 h-3.5 animate-spin" />{progress}%</>
        ) : (
          <><FileDown className="w-3.5 h-3.5" />Export PDF</>
        )}
      </button>
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
      p.ipNo.includes(search) || p.bed.includes(search),
    ), [patients, search]);

  const selected = patients.find(p => p.ipNo === selectedId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 bg-white border border-slate-200 rounded-xl
                   px-4 py-3 text-left hover:border-teal-400 transition-colors"
      >
        {selected ? (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{selected.name}</p>
            <p className="text-[11px] text-slate-400">Bed {selected.bed} · IP: {selected.ipNo}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <Search className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-400">Search patient…</span>
          </div>
        )}
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-200
                        rounded-xl shadow-xl z-30 max-h-64 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-100">
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Name, bed or IP no."
                className="flex-1 text-sm bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-6">No patients found</p>
            ) : filtered.map(p => (
              <button
                key={p.ipNo}
                onClick={() => { onSelect(p.ipNo); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left
                            hover:bg-teal-50 transition-colors ${p.ipNo === selectedId ? 'bg-teal-50' : ''}`}
              >
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-slate-500">{p.bed}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                  <p className="text-[10px] text-slate-400">IP: {p.ipNo} · {p.ward}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Upload Bottom Sheet ──────────────────────────────────────────────────────
const UploadSheet: React.FC<{
  isOpen: boolean;
  files: File[];
  previewUrls: string[];
  patient: Patient;
  isUploading: boolean;
  uploadError: string | null;
  onPhaseChange: (p: RadPhase) => void;
  onTypeChange: (t: string) => void;
  phase: RadPhase;
  invType: string;
  allowPostOp: boolean;
  onSave: () => void;
  onCancel: () => void;
  onRemoveFile: (index: number) => void;
  /** Opens the crop/rotate editor — only offered for a single image, not PDFs or batches. */
  onEdit?: () => void;
}> = ({ isOpen, files, previewUrls, patient, isUploading, uploadError,
        onPhaseChange, onTypeChange, phase, invType, allowPostOp, onSave, onCancel, onRemoveFile, onEdit }) => {
  if (!isOpen) return null;
  const isSingleImage = files.length === 1 && files[0].type.startsWith('image/');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl
                      animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Preview — single image gets a large preview; a batch gets a thumbnail strip
            so each file can be reviewed/removed before the shared modality+phase is saved. */}
        {isSingleImage ? (
          <div className="relative bg-black h-48 mx-4 rounded-xl overflow-hidden mb-4">
            <img src={previewUrls[0]} alt="Preview" className="w-full h-full object-contain" />
            {!isUploading && (
              <button
                onClick={onCancel}
                aria-label="Discard image"
                className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {!isUploading && onEdit && (
              <button
                onClick={onEdit}
                className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white text-xs font-semibold px-3 py-2 rounded-full"
              >
                <CropIcon className="w-3.5 h-3.5" /> Crop / Rotate
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto px-4 mb-4 pb-1">
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="relative shrink-0 w-20 h-20 bg-slate-900 rounded-lg overflow-hidden">
                {f.type.startsWith('image/')
                  ? <img src={previewUrls[i]} alt={f.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-slate-400 text-[9px] font-semibold px-1 text-center break-all">{f.name}</div>}
                {!isUploading && (
                  <button
                    onClick={() => onRemoveFile(i)}
                    aria-label={`Remove ${f.name}`}
                    className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-full"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="px-5 pb-8 space-y-4">
          <h3 className="text-base font-semibold text-slate-900">
            Upload {files.length > 1 ? `${files.length} investigations` : 'investigation'}
          </h3>
          <p className="text-xs text-slate-400">{patient.name} · Bed {patient.bed}</p>

          {/* Phase toggle — hidden for conservative patients (post-op not applicable) */}
          {allowPostOp && (
            <div className="space-y-1">
              <label className="text-[10px] font-medium tracking-widest uppercase text-slate-500">
                Investigation type
              </label>
              <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                <button
                  onClick={() => onPhaseChange('preop')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                    phase === 'preop'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Pre-Op
                </button>
                <button
                  onClick={() => onPhaseChange('postop')}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                    phase === 'postop'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Post-Op
                </button>
              </div>
            </div>
          )}

          {/* Modality */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium tracking-widest uppercase text-slate-500">
              Modality
            </label>
            <BottomSheetPicker
              title="Modality"
              value={invType}
              options={[
                { value: 'X-Ray',          label: 'X-Ray' },
                { value: 'CT',             label: 'CT Scan' },
                { value: 'MRI',            label: 'MRI' },
                { value: 'USG',            label: 'Ultrasound (USG)' },
                { value: 'Culture Report', label: 'Culture Report' },
                { value: 'Report',         label: 'Report / Document' },
              ]}
              onChange={onTypeChange}
              disabled={isUploading}
            />
          </div>

          {uploadError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
              {uploadError}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={isUploading}
              className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-semibold
                         text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={isUploading || files.length === 0}
              className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-60
                         text-white font-semibold rounded-xl transition-colors
                         flex items-center justify-center gap-2"
            >
              {isUploading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                : files.length > 1 ? `Save ${files.length}` : 'Save'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const RadiologyComparator: React.FC<Props> = ({
  patients, onAddInvestigation, onDeleteInvestigation, initialPatientId,
}) => {
  const { user } = useAuth();

  const [selectedPatientId, setSelectedPatientId] = useState(initialPatientId || '');

  // Upload state — a batch of files sharing one modality + phase (ward-round friendly:
  // e.g. 3 X-ray views taken together don't need 3 separate prompts).
  const [selectedFiles, setSelectedFiles]   = useState<File[]>([]);
  const [previewUrls, setPreviewUrls]       = useState<string[]>([]);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [invType, setInvType]             = useState('X-Ray');
  const [uploadPhase, setUploadPhase]     = useState<RadPhase>('preop');
  const [isUploading, setIsUploading]     = useState(false);
  const [uploadError, setUploadError]     = useState<string | null>(null);
  // Next/Previous in the Lightbox browses within whichever section (pre-op or
  // post-op) the clicked thumbnail belongs to, not the patient's full list —
  // matches the visual grouping the user clicked from.
  const [lightboxSource, setLightboxSource] = useState<{ scans: Investigation[]; index: number } | null>(null);
  const [showEditor, setShowEditor]       = useState(false);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const isNativePlatform = Capacitor.isNativePlatform();

  useEffect(() => {
    if (initialPatientId) setSelectedPatientId(initialPatientId);
  }, [initialPatientId]);

  useEffect(() => {
    return () => {
      previewUrls.forEach(url => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); });
    };
  }, [previewUrls]);

  const selectedPatient = patients.find(p => p.ipNo === selectedPatientId);
  const investigations  = selectedPatient?.investigations ?? [];

  // Fills the empty state before a patient is picked — same day-cohort logic
  // Admission List uses, so a freshly admitted patient is one tap away
  // instead of typing their name into search.
  const todaysAdmissions = useMemo(
    () => getAdmissionDayCohort(patients, todayYmd(), user?.unit),
    [patients, user?.unit],
  );

  // Split into pre/post — legacy scans without phase: compare date to DOS
  const { preOpScans, postOpScans } = useMemo(() => {
    const dos = selectedPatient?.dos;
    const preOpScans:  Investigation[] = [];
    const postOpScans: Investigation[] = [];
    for (const inv of investigations) {
      const phase = inv.phase ?? (dos && inv.date >= dos ? 'postop' : 'preop');
      if (phase === 'postop') postOpScans.push(inv);
      else preOpScans.push(inv);
    }
    return { preOpScans, postOpScans };
  }, [investigations, selectedPatient]);

  // Conservatively-managed patients aren't operated, so a post-op X-ray isn't
  // expected. Hide the post-op section for them — but never hide scans that
  // already exist (e.g. plan changed after imaging), and always keep pre-op.
  const isConservative = selectedPatient?.management === 'conservative';
  const showPostOp = !isConservative || postOpScans.length > 0;

  const handleCameraClick = async () => {
    try {
      const photo = await CapCamera.getPhoto({
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        quality: 80,
        allowEditing: false,
        saveToGallery: false,
      });
      if (!photo.webPath) return;
      const res  = await fetch(photo.webPath);
      const blob = await res.blob();
      const file = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setSelectedFiles(prev => [...prev, file]);
      setPreviewUrls(prev => [...prev, URL.createObjectURL(file)]);
      setShowUploadForm(true);
      setUploadError(null);
    } catch (err) {
      if (err instanceof Error && err.message !== 'User cancelled photos app') {
        setUploadError('Camera unavailable. Check camera permissions in device Settings.');
      }
    }
  };

  const openUpload = (phase: RadPhase) => {
    setUploadPhase(phase);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const validFiles: File[] = [];
    let firstError: string | null = null;
    for (const file of files) {
      try { validateImageFile(file); validFiles.push(file); }
      catch (err) { firstError ??= err instanceof Error ? err.message : 'Invalid file'; }
    }

    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);
      setPreviewUrls(prev => [...prev, ...validFiles.map(f => URL.createObjectURL(f))]);
      setShowUploadForm(true);
    }
    setUploadError(firstError);
    e.target.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => {
      if (prev[index]?.startsWith('blob:')) URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSave = async () => {
    if (!selectedPatientId || selectedFiles.length === 0) return;
    if (!user?.hospitalId) {
      setUploadError('Session error — please log out and log in again.');
      return;
    }
    setIsUploading(true);
    setUploadError(null);

    const failed: { file: File; message: string }[] = [];
    for (const file of selectedFiles) {
      try {
        const fileToUpload = await compressImage(file);
        const imageUrl = await uploadInvestigationImage(fileToUpload, user.hospitalId, selectedPatientId);
        const newInv: Investigation = {
          id: generateId(),
          date: todayYmd(),
          type: invType,
          findings: '',
          imageUrl,
          // Conservative patients can't file post-op — guard against stale phase state
          phase: showPostOp ? uploadPhase : 'preop',
        };
        onAddInvestigation(selectedPatientId, newInv);
      } catch (err) {
        failed.push({ file, message: err instanceof Error ? err.message : 'Upload failed' });
      }
    }

    if (failed.length === 0) {
      handleCancelUpload();
    } else {
      // Keep only the failed files in the sheet so the user can see what didn't
      // make it and retry, instead of silently losing uploads on a partial failure.
      const failedFiles = failed.map(f => f.file);
      const keptIndexes  = selectedFiles.map((f, i) => failedFiles.includes(f) ? i : -1).filter(i => i !== -1);
      previewUrls.forEach((url, i) => { if (!keptIndexes.includes(i) && url.startsWith('blob:')) URL.revokeObjectURL(url); });
      setSelectedFiles(keptIndexes.map(i => selectedFiles[i]));
      setPreviewUrls(keptIndexes.map(i => previewUrls[i]));

      const successCount = selectedFiles.length - failed.length;
      setUploadError(
        `${successCount} of ${selectedFiles.length} uploaded. Failed: ${failed.map(f => f.file.name).join(', ')} (${failed[0].message})`,
      );
    }
    setIsUploading(false);
  };

  const handleCancelUpload = () => {
    previewUrls.forEach(url => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); });
    setSelectedFiles([]);
    setPreviewUrls([]);
    setShowUploadForm(false);
    setShowEditor(false);
    setUploadError(null);
    if (fileInputRef.current)  fileInputRef.current.value  = '';
  };

  const handleDelete = (invId: string, imageUrl: string) => {
    if (!onDeleteInvestigation) return;
    if (!confirm('Delete this image?')) return;
    onDeleteInvestigation(selectedPatientId, invId);
    deleteInvestigationImage(imageUrl).catch(console.error);
  };

  const onPatientSelect = (id: string) => {
    setSelectedPatientId(id);
    handleCancelUpload();
  };

  const sortedPatients = useMemo(() =>
    [...patients].sort((a, b) => (parseInt(a.bed) || 0) - (parseInt(b.bed) || 0)),
    [patients],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Hidden file input for gallery / file picker — multiple lets a batch of
          views (e.g. 3 X-ray angles) be picked in one go */}
      <input type="file" accept="image/*,.pdf" multiple className="hidden" ref={fileInputRef} onChange={handleFileChange} />

      {/* Patient picker */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
          Select Patient
        </p>
        <PatientPicker patients={sortedPatients} selectedId={selectedPatientId} onSelect={onPatientSelect} />
      </div>

      {!selectedPatient ? (
        todaysAdmissions.length > 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Today's Admissions</p>
            </div>
            <div className="divide-y divide-slate-100">
              {todaysAdmissions.map(p => (
                <button
                  key={p.ipNo}
                  type="button"
                  onClick={() => onPatientSelect(p.ipNo)}
                  className="w-full flex items-center gap-3 px-4 py-3 min-h-11 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold font-mono text-slate-500">{p.bed}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
                    <p className="text-[11px] text-slate-400">
                      IP: {p.ipNo} · {p.investigations.length > 0 ? `${p.investigations.length} scan${p.investigations.length !== 1 ? 's' : ''}` : 'No scans yet'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-50
                          rounded-xl border-2 border-dashed border-slate-200 p-16 text-center">
            <ImageIcon className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm font-semibold text-slate-500">Select a patient above</p>
            <p className="text-xs text-slate-400 mt-1">X-Rays, CT, MRI and reports will appear here</p>
          </div>
        )
      ) : (
        <>
          {/* Patient header */}
          <div className="bg-slate-900 rounded-xl p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{selectedPatient.name}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {selectedPatient.diagnosis} · Bed {selectedPatient.bed}
              </p>
            </div>
            {selectedPatient.dos && (
              <div className="shrink-0 text-right">
                <p className="text-[9px] text-slate-500 uppercase tracking-wide">DOS</p>
                <p className="text-xs font-semibold text-teal-400">
                  {new Date(selectedPatient.dos).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </p>
              </div>
            )}
            {isNativePlatform && (
              <button
                onClick={handleCameraClick}
                className="shrink-0 flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700
                           text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
              >
                <Camera className="w-3.5 h-3.5" /> Camera
              </button>
            )}
          </div>

          {/* ── PRE-OP ──────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-blue-100 p-4">
            <SectionHeader phase="preop" count={preOpScans.length} patient={selectedPatient} scans={preOpScans} />
            <div className="grid grid-cols-3 gap-2">
              {preOpScans.map((inv, i) => (
                <ImageCard
                  key={inv.id}
                  inv={inv}
                  onClick={() => setLightboxSource({ scans: preOpScans, index: i })}
                  onDelete={onDeleteInvestigation ? () => handleDelete(inv.id, inv.imageUrl) : undefined}
                />
              ))}
              <UploadCard phase="preop" onClick={() => openUpload('preop')} />
            </div>
          </div>

          {/* ── POST-OP ─────────────────────────────────────────────── */}
          {showPostOp ? (
            <div className="bg-white rounded-xl border border-teal-100 p-4">
              <SectionHeader phase="postop" count={postOpScans.length} patient={selectedPatient} scans={postOpScans} />
              <div className="grid grid-cols-3 gap-2">
                {postOpScans.map((inv, i) => (
                  <ImageCard
                    key={inv.id}
                    inv={inv}
                    onClick={() => setLightboxSource({ scans: postOpScans, index: i })}
                    onDelete={onDeleteInvestigation ? () => handleDelete(inv.id, inv.imageUrl) : undefined}
                  />
                ))}
                <UploadCard phase="postop" onClick={() => openUpload('postop')} />
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50/40 rounded-xl border border-emerald-100 p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <Leaf className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-700">Post-op imaging not required</p>
                <p className="text-xs text-slate-400">Planned conservative management — no post-operative X-ray expected.</p>
              </div>
            </div>
          )}

          {/* ── WhatsApp Share Bar ───────────────────────────────────── */}
          {(preOpScans.length + postOpScans.length) > 0 && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                   style={{ backgroundColor: '#25D366' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  <path d="M11.997 2C6.477 2 2 6.484 2 12.017c0 1.99.52 3.85 1.43 5.456L2 22l4.616-1.43A9.96 9.96 0 0011.997 22C17.52 22 17.516 22 22 12.017 22 6.484 17.52 2 11.997 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-green-800">Share via WhatsApp</p>
                <p className="text-[10px] text-green-600 truncate font-mono">
                  {selectedPatient.name.replace(/\s+/g, '_')}_PreOp.pdf
                  {postOpScans.length > 0 && ` · ${selectedPatient.name.replace(/\s+/g, '_')}_PostOp.pdf`}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Upload bottom sheet */}
      <UploadSheet
        isOpen={showUploadForm}
        files={selectedFiles}
        previewUrls={previewUrls}
        patient={selectedPatient!}
        isUploading={isUploading}
        uploadError={uploadError}
        phase={uploadPhase}
        invType={invType}
        allowPostOp={showPostOp}
        onPhaseChange={setUploadPhase}
        onTypeChange={setInvType}
        onSave={handleSave}
        onCancel={handleCancelUpload}
        onRemoveFile={handleRemoveFile}
        // Crop/rotate only makes sense for a single image at a time
        onEdit={selectedFiles.length === 1 && selectedFiles[0].type.startsWith('image/') ? () => setShowEditor(true) : undefined}
      />

      {/* Crop / rotate / straighten editor — only reachable when exactly one file is queued */}
      {showEditor && previewUrls[0] && (
        <ImageEditor
          src={previewUrls[0]}
          onClose={() => setShowEditor(false)}
          onApply={(edited) => {
            if (previewUrls[0]?.startsWith('blob:')) URL.revokeObjectURL(previewUrls[0]);
            setSelectedFiles([edited]);
            setPreviewUrls([URL.createObjectURL(edited)]);
            setShowEditor(false);
          }}
        />
      )}

      {/* Fullscreen lightbox */}
      {lightboxSource && (
        <Lightbox
          investigations={lightboxSource.scans}
          initialIndex={lightboxSource.index}
          onClose={() => setLightboxSource(null)}
        />
      )}
    </div>
  );
};

export default RadiologyComparator;
