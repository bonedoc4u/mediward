import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Patient, Investigation } from '../types';
import { useAuth } from '../contexts/AppContext';
import {
  ImageIcon, Camera, X,
  CloudUpload, FileDown, Loader2, Search, ChevronDown, ChevronRight, Leaf,
} from 'lucide-react';
import ImageEditor from './radiology/ImageEditor';
import UploadSheet from './radiology/UploadSheet';
import { uploadInvestigationImage, deleteInvestigationImage, validateImageFile, isPdfPath } from '../services/storageService';
import { useSignedUrl } from '../hooks/useSignedUrl';
import { getModality } from './radiology/modality';
import Lightbox from './radiology/Lightbox';
import { generateId } from '../utils/sanitize';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { exportRadiologyPDF } from '../utils/exportRadiologyPDF';
import { compressImage } from '../utils/imageUtils';
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
      className="group rounded-xl border border-line overflow-hidden cursor-pointer
                  hover:border-accent hover:-translate-y-0.5 hover:shadow-sm
                  transition-all active:scale-[0.98]"
      onClick={onClick}
    >
      {/* cfg.bg is the modality viewer background from modality.ts — deliberately
          always-dark regardless of app theme (see modality.ts header comment), so
          the icon/loader colors overlaid on it (text-white/*) must also stay fixed
          rather than switching to theme-reactive ink tokens, or they'd disappear
          against the dark well in light mode. */}
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
            className="absolute top-1 right-1 bg-vital-critical/80 hover:bg-vital-critical text-white
                       p-1 rounded-full opacity-0 group-hover:opacity-100
                       [@media(hover:none)]:opacity-100 transition-opacity"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="p-2 bg-surface-card">
        <span className={`text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.badge}`}>
          {inv.type}
        </span>
        <p className="text-[11px] font-semibold text-ink mt-1 leading-tight truncate">
          {inv.findings || inv.type}
        </p>
        <p className="text-[10px] text-ink-muted">{fmtDate}</p>
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
    // JUDGMENT CALL: pre-op/post-op is a categorical (non-clinical) distinction that
    // needs two visually distinct hues to stay tellable apart at a glance. Post-op's
    // teal maps to the accent token below, but pre-op's blue is deliberately left
    // hardcoded — mapping it to vital-low would misrepresent it as an "abnormal-low
    // lab value" (blue is reserved for that per docs/UI-UX-CURRENT-STATE.md §2.1),
    // and mapping it to accent would make it visually identical to post-op, erasing
    // the distinction. No second categorical token exists yet; see task-6-report.md.
    className={`rounded-xl border-2 border-dashed min-h-[116px] w-full
                flex flex-col items-center justify-center gap-1.5
                cursor-pointer transition-all ${
      phase === 'preop'
        ? 'border-blue-200 bg-blue-50/30 hover:border-blue-400 hover:bg-blue-50'
        : 'border-accent/30 bg-accent-soft/40 hover:border-accent hover:bg-accent-soft'
    }`}
  >
    <CloudUpload className={`w-5 h-5 ${phase === 'preop' ? 'text-blue-400' : 'text-accent'}`} />
    <span className="text-[10px] font-semibold text-ink-muted">
      Add {phase === 'preop' ? 'pre-op' : 'post-op'}
    </span>
    <span className="text-[9px] text-ink-muted">JPEG · PNG · PDF</span>
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
      {/* Same pre-op(blue)/post-op(teal) categorical judgment call as UploadCard
          above — blue stays hardcoded, teal maps to the accent family. */}
      <span className={`text-[9px] font-bold px-2 py-1 rounded-full ${
        isPreOp
          ? 'bg-blue-100 text-blue-700 border border-blue-200'
          : 'bg-accent-soft text-accent-fg border border-accent'
      }`}>
        {label}
      </span>
      <span className="text-sm font-bold text-ink">Investigations</span>
      <span className="text-xs text-ink-muted">({count})</span>
      <div className="flex-1" />
      <button
        onClick={handleExport}
        disabled={count === 0 || progress !== null}
        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg
                    border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
          isPreOp
            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-600 hover:text-white hover:border-blue-600'
            : 'bg-accent-soft text-accent-fg border-accent hover:bg-accent hover:text-white hover:border-accent'
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
        className="w-full flex items-center gap-3 bg-surface-card border border-line rounded-xl
                   px-4 py-3 text-left hover:border-accent transition-colors"
      >
        {selected ? (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink truncate">{selected.name}</p>
            <p className="text-[11px] text-ink-muted">Bed {selected.bed} · IP: {selected.ipNo}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <Search className="w-4 h-4 text-ink-muted" />
            <span className="text-sm text-ink-muted">Search patient…</span>
          </div>
        )}
        <ChevronDown className={`w-4 h-4 text-ink-muted transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-surface-card border border-line
                        rounded-xl shadow-xl z-30 max-h-64 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-line">
            <div className="flex items-center gap-2 bg-surface-sunken rounded-lg px-3 py-2">
              <Search className="w-3.5 h-3.5 text-ink-muted shrink-0" />
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
              <p className="text-center text-xs text-ink-muted py-6">No patients found</p>
            ) : filtered.map(p => (
              <button
                key={p.ipNo}
                onClick={() => { onSelect(p.ipNo); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left
                            hover:bg-accent-soft transition-colors ${p.ipNo === selectedId ? 'bg-accent-soft' : ''}`}
              >
                <div className="w-8 h-8 rounded-lg bg-surface-sunken flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-ink-muted">{p.bed}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{p.name}</p>
                  <p className="text-[10px] text-ink-muted">IP: {p.ipNo} · {p.ward}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
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
  // Index into selectedFiles/previewUrls currently open in the crop editor;
  // null means the editor is closed. Works for both the single-image case
  // (always index 0) and any image in a multi-select batch.
  const [editingIndex, setEditingIndex]   = useState<number | null>(null);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const isNativePlatform = Capacitor.isNativePlatform();

  useEffect(() => {
    if (initialPatientId) setSelectedPatientId(initialPatientId);
  }, [initialPatientId]);

  // Revoke on unmount only, not on every previewUrls change — every place that
  // drops or replaces an individual URL (handleRemoveFile, handleCancelUpload,
  // the partial-failure branch in handleSave, and the crop editor's onApply)
  // already revokes exactly the URL it's dropping. A [previewUrls]-keyed
  // cleanup would ALSO revoke URLs carried forward unchanged into the new
  // array, killing previews that are still in use (this is what made cropping
  // a second image in a batch open a blank editor).
  const previewUrlsRef = useRef<string[]>(previewUrls);
  useEffect(() => { previewUrlsRef.current = previewUrls; }, [previewUrls]);
  useEffect(() => () => {
    previewUrlsRef.current.forEach(url => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); });
  }, []);

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
    setEditingIndex(null);
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
    setEditingIndex(null);
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
      <div className="bg-surface-card rounded-xl border border-line p-4 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted mb-2">
          Select Patient
        </p>
        <PatientPicker patients={sortedPatients} selectedId={selectedPatientId} onSelect={onPatientSelect} />
      </div>

      {!selectedPatient ? (
        todaysAdmissions.length > 0 ? (
          <div className="bg-surface-card rounded-xl border border-line shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-line bg-surface-sunken">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">Today's Admissions</p>
            </div>
            <div className="divide-y divide-line">
              {todaysAdmissions.map(p => (
                <button
                  key={p.ipNo}
                  type="button"
                  onClick={() => onPatientSelect(p.ipNo)}
                  className="w-full flex items-center gap-3 px-4 py-3 min-h-11 text-left hover:bg-surface-sunken transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-surface-sunken flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold font-mono text-ink-muted">{p.bed}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{p.name}</p>
                    <p className="text-[11px] text-ink-muted">
                      IP: {p.ipNo} · {p.investigations.length > 0 ? `${p.investigations.length} scan${p.investigations.length !== 1 ? 's' : ''}` : 'No scans yet'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-surface-sunken
                          rounded-xl border-2 border-dashed border-line p-16 text-center">
            {/* text-slate-200/300 (very light, decorative-only) collapsed to
                ink-faint here — lighter than the ink-muted used for body/caption
                text elsewhere; not a literal mapping-table row, extrapolated for
                consistency (see task-6-report.md). */}
            <ImageIcon className="w-10 h-10 text-ink-faint mb-3" />
            <p className="text-sm font-semibold text-ink-muted">Select a patient above</p>
            <p className="text-xs text-ink-muted mt-1">X-Rays, CT, MRI and reports will appear here</p>
          </div>
        )
      ) : (
        <>
          {/* Patient header — JUDGMENT CALL: bg-slate-900 here is a "dark stat card"
              (mapping-table's judgment-call row for bg-slate-900/800/700 chrome
              blocks), not an image viewer. Left hardcoded rather than converted to
              bg-surface-card: this is a per-patient identity/emphasis bar, and
              converting it would visibly change today's light-mode appearance
              (white card losing its dark "pop") for a purely cosmetic dark-mode
              gain — since bg-slate-900 already sits close to the app's own dark
              --color-surface once dark mode exists, the "no silent breaking
              changes" call is to leave it as-is. Descendant text (text-white,
              text-slate-400/500, text-teal-400) stays hardcoded too, since it's
              calibrated for this permanently-dark backdrop. The Camera button is
              self-contained (own solid fill), so it converts normally below. See
              task-6-report.md for the fuller writeup. */}
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
                className="shrink-0 flex items-center gap-1.5 bg-accent hover:bg-accent-pressed
                           text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
              >
                <Camera className="w-3.5 h-3.5" /> Camera
              </button>
            )}
          </div>

          {/* ── PRE-OP ──────────────────────────────────────────────── (border-blue-100:
              same pre-op categorical judgment call as UploadCard — left hardcoded) */}
          <div className="bg-surface-card rounded-xl border border-blue-100 p-4">
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
            <div className="bg-surface-card rounded-xl border border-accent p-4">
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
            <div className="bg-vital-normal-surface/40 rounded-xl border border-vital-normal-border p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-vital-normal-surface flex items-center justify-center shrink-0">
                <Leaf className="w-4 h-4 text-vital-normal" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Post-op imaging not required</p>
                <p className="text-xs text-ink-muted">Planned conservative management — no post-operative X-ray expected.</p>
              </div>
            </div>
          )}

          {/* ── WhatsApp Share Bar ─────────────────────────────────────
              JUDGMENT CALL: reuses the vital-normal ("success") family for this
              green banner even though it isn't a clinical value — WhatsApp's own
              brand green (#25D366, the inline-styled icon circle below) is left
              untouched as a fixed third-party brand mark, but the surrounding
              Tailwind bg-green-50/border-green-200/text-green-* classes were a
              static light-green tint that would look wrong pinned onto a dark
              page, so they take the "positive outcome" reading of vital-normal
              rather than staying hardcoded. See task-6-report.md. */}
          {(preOpScans.length + postOpScans.length) > 0 && (
            <div className="flex items-center gap-3 bg-vital-normal-surface border border-vital-normal-border rounded-xl p-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                   style={{ backgroundColor: '#25D366' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  <path d="M11.997 2C6.477 2 2 6.484 2 12.017c0 1.99.52 3.85 1.43 5.456L2 22l4.616-1.43A9.96 9.96 0 0011.997 22C17.52 22 17.516 22 22 12.017 22 6.484 17.52 2 11.997 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-vital-normal-fg">Share via WhatsApp</p>
                <p className="text-[10px] text-vital-normal-fg truncate font-mono">
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
        onEditFile={(index) => setEditingIndex(index)}
      />

      {/* Crop / rotate / straighten editor — reachable for any image file,
          single or in a batch; editingIndex says which one. */}
      {editingIndex !== null && previewUrls[editingIndex] && (
        <ImageEditor
          src={previewUrls[editingIndex]}
          onClose={() => setEditingIndex(null)}
          onApply={(edited) => {
            const idx = editingIndex;
            const oldUrl = previewUrls[idx];
            if (oldUrl?.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
            const nextUrl = URL.createObjectURL(edited);
            setSelectedFiles(prev => prev.map((f, i) => (i === idx ? edited : f)));
            setPreviewUrls(prev => prev.map((u, i) => (i === idx ? nextUrl : u)));
            setEditingIndex(null);
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
