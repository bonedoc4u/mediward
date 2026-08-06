import React from 'react';
import { Patient } from '../../types';
import { X, Loader2, Crop as CropIcon } from 'lucide-react';
import BottomSheetPicker from '../ui/BottomSheetPicker';

interface UploadSheetProps {
  isOpen: boolean;
  files: File[];
  previewUrls: string[];
  patient: Patient;
  isUploading: boolean;
  uploadError: string | null;
  onPhaseChange: (p: 'preop' | 'postop') => void;
  onTypeChange: (t: string) => void;
  phase: 'preop' | 'postop';
  invType: string;
  allowPostOp: boolean;
  onSave: () => void;
  onCancel: () => void;
  onRemoveFile: (index: number) => void;
  /** Opens the crop/rotate editor for the file at this index — offered for
   *  any image file, single or in a batch; never offered for PDFs. */
  onEditFile?: (index: number) => void;
}

const UploadSheet: React.FC<UploadSheetProps> = ({
  isOpen, files, previewUrls, patient, isUploading, uploadError,
  onPhaseChange, onTypeChange, phase, invType, allowPostOp, onSave, onCancel, onRemoveFile, onEditFile,
}) => {
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
            so each file can be reviewed/removed/cropped before the shared modality+phase
            is saved. */}
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
            {!isUploading && onEditFile && (
              <button
                onClick={() => onEditFile(0)}
                className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white text-xs font-semibold px-3 py-2 rounded-full"
              >
                <CropIcon className="w-3.5 h-3.5" /> Crop / Rotate
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto px-4 mb-4 pb-1">
            {files.map((f, i) => {
              const isImage = f.type.startsWith('image/');
              const canCrop = isImage && !!onEditFile;
              return (
                <div
                  key={`${f.name}-${i}`}
                  className="relative shrink-0 w-20 h-20 bg-slate-900 rounded-lg overflow-hidden"
                  onClick={canCrop ? () => onEditFile(i) : undefined}
                  onKeyDown={canCrop ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEditFile(i); } } : undefined}
                  tabIndex={canCrop ? 0 : undefined}
                  role={canCrop ? 'button' : undefined}
                  aria-label={canCrop ? `Crop ${f.name}` : undefined}
                >
                  {isImage
                    ? <img src={previewUrls[i]} alt={f.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-slate-400 text-[9px] font-semibold px-1 text-center break-all">{f.name}</div>}
                  {canCrop && (
                    <div className="absolute bottom-1 right-1 bg-black/60 text-white p-1 rounded-full pointer-events-none">
                      <CropIcon className="w-3 h-3" />
                    </div>
                  )}
                  {!isUploading && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveFile(i); }}
                      aria-label={`Remove ${f.name}`}
                      className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-full"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
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

export default UploadSheet;
