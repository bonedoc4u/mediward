import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Patient, Investigation } from '../types';
import { useConfig } from '../contexts/AppContext';
import { ImageIcon, Camera, X, Trash2, Calendar, Check, Filter, Users, ArrowUp, Loader2 } from 'lucide-react';
import { uploadInvestigationImage, deleteInvestigationImage } from '../services/storageService';
import { generateId } from '../utils/sanitize';

interface Props {
  patients: Patient[];
  onAddInvestigation: (patientId: string, investigation: Investigation) => void;
  onDeleteInvestigation?: (patientId: string, investigationId: string) => void;
  initialPatientId?: string;
}

const RadiologyComparator: React.FC<Props> = ({ patients, onAddInvestigation, onDeleteInvestigation, initialPatientId }) => {
  const { wards: configWards } = useConfig();
  const activeConfigWards = useMemo(
    () => configWards.filter(w => w.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [configWards],
  );
  const [selectedWard, setSelectedWard] = useState<string>('All');
  const [selectedPatientId, setSelectedPatientId] = useState<string>(initialPatientId || '');

  // Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [invType, setInvType] = useState('X-Ray');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync prop with state if it changes
  useEffect(() => {
    if (initialPatientId) {
      setSelectedPatientId(initialPatientId);
      const patient = patients.find(p => p.ipNo === initialPatientId);
      if (patient) setSelectedWard('All');
    }
  }, [initialPatientId, patients]);

  // Revoke object URL on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const filteredPatients = useMemo(() => {
    let filtered = patients;
    if (selectedWard !== 'All') {
      filtered = filtered.filter(p => p.ward === selectedWard);
    }
    return filtered.sort((a, b) => (parseInt(a.bed) || 0) - (parseInt(b.bed) || 0));
  }, [patients, selectedWard]);

  const selectedPatient = patients.find(p => p.ipNo === selectedPatientId);
  const investigations = selectedPatient?.investigations || [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Revoke previous blob URL
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setShowUploadForm(true);
    setInvType('X-Ray');
    setUploadError(null);
  };

  const handleSave = async () => {
    if (!selectedPatientId || !selectedFile) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const imageUrl = await uploadInvestigationImage(selectedFile, selectedPatientId);

      const newInv: Investigation = {
        id: generateId(),
        date: new Date().toISOString().split('T')[0],
        type: invType,
        findings: '',
        imageUrl,
      };

      onAddInvestigation(selectedPatientId, newInv);
      handleCancelUpload();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancelUpload = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setShowUploadForm(false);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (invId: string, imageUrl: string) => {
    if (!onDeleteInvestigation) return;
    onDeleteInvestigation(selectedPatientId, invId);
    // Fire-and-forget storage deletion
    deleteInvestigationImage(imageUrl).catch(err =>
      console.error('[Storage] Delete failed:', err)
    );
  };

  return (
    <div className="flex flex-col space-y-6">
      {/* Selection Area */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 relative z-20">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Filter by Ward
          </label>
          <select
            className="w-full p-2 border border-slate-300 rounded-md bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={selectedWard}
            onChange={(e) => {
              setSelectedWard(e.target.value);
              setSelectedPatientId('');
              handleCancelUpload();
            }}
          >
            <option value="All">All Wards</option>
            {activeConfigWards.map(w => (
              <option key={w.name} value={w.name}>{w.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Users className="w-3 h-3" /> Select Patient
          </label>
          <select
            className={`w-full p-2 border rounded-md bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all ${!selectedPatientId ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-300'}`}
            value={selectedPatientId}
            onChange={(e) => {
              setSelectedPatientId(e.target.value);
              handleCancelUpload();
            }}
            disabled={filteredPatients.length === 0}
          >
            <option value="">-- {filteredPatients.length === 0 ? 'No Patients in Ward' : 'Select Patient to Upload/View'} --</option>
            {filteredPatients.map(p => (
              <option key={p.ipNo} value={p.ipNo}>
                Bed {p.bed}: {p.name} ({p.investigations.length})
              </option>
            ))}
          </select>
          {!selectedPatientId && filteredPatients.length > 0 && (
            <div className="absolute right-4 top-16 md:top-4 text-blue-600 animate-bounce hidden md:block">
              <ArrowUp className="w-5 h-5" />
            </div>
          )}
        </div>
      </div>

      {!selectedPatient ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 p-12 text-center animate-in fade-in duration-500">
          <div className="bg-white p-4 rounded-full shadow-sm mb-4">
            <ImageIcon className="w-12 h-12 text-blue-500 opacity-80" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-1">Radiology & Imaging Gallery</h3>
          <p className="max-w-md mx-auto mb-6 text-sm">Select a patient from the dropdown above to view their history or upload new X-Rays, CT Scans, and MRI reports.</p>
          <div className="flex gap-2 text-xs font-mono bg-slate-100 p-2 rounded text-slate-500 border border-slate-200">
            <span className="flex items-center gap-1"><Filter className="w-3 h-3" /> Filter by Ward</span>
            <span className="text-slate-300">→</span>
            <span className="flex items-center gap-1 font-bold text-blue-600"><Users className="w-3 h-3" /> Select Patient</span>
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">

          {/* Action Bar */}
          {!showUploadForm && (
            <div className="flex justify-between items-center bg-slate-100 p-3 rounded-lg border border-slate-200">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  {selectedPatient.name}
                  <span className="text-sm font-normal text-slate-500">({selectedPatient.ward}, Bed {selectedPatient.bed})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{investigations.length} images on file</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  <span className="hidden md:inline">Take Photo / Upload</span>
                  <span className="md:hidden">Add Photo</span>
                </button>
              </div>
            </div>
          )}

          {/* Upload Form */}
          {showUploadForm && (
            <div className="bg-white rounded-lg shadow-xl border border-blue-100 overflow-hidden animate-in slide-in-from-top-4 duration-200 max-w-md mx-auto md:mx-0">
              <div className="relative bg-black h-64 flex items-center justify-center">
                {previewUrl && (
                  <img src={previewUrl} alt="Preview" className="max-h-full max-w-full object-contain" />
                )}
                {!isUploading && (
                  <button
                    onClick={handleCancelUpload}
                    className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full hover:bg-black/70"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              <div className="p-4 bg-blue-50/50 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Investigation Type</label>
                  <select
                    value={invType}
                    onChange={(e) => setInvType(e.target.value)}
                    disabled={isUploading}
                    className="w-full p-2 text-sm border border-blue-200 rounded outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-60"
                  >
                    <option value="X-Ray">X-Ray</option>
                    <option value="Pre-Op X-Ray">Pre-Op X-Ray</option>
                    <option value="CT Scan">CT Scan</option>
                    <option value="MRI">MRI</option>
                    <option value="Ultrasound">Ultrasound</option>
                    <option value="Lab Report">Lab Report</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {uploadError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{uploadError}</p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleCancelUpload}
                    disabled={isUploading}
                    className="flex-1 py-2 border border-slate-300 bg-white rounded text-slate-600 font-medium hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isUploading}
                    className="flex-1 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Save
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Gallery Grid */}
          {investigations.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 border border-slate-200 rounded-lg text-slate-400">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No investigations uploaded for this patient yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {investigations.map((inv) => (
                <div key={inv.id} className="group bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden relative">
                  <div className="aspect-[4/3] bg-black relative flex items-center justify-center overflow-hidden">
                    <img
                      src={inv.imageUrl}
                      alt={inv.type}
                      className="max-h-full max-w-full object-cover"
                    />
                    <div className="absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/60 to-transparent flex justify-between items-start">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-white drop-shadow-sm">{inv.type}</span>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5 text-white/80" />
                          <span className="text-[9px] font-medium text-white/90">{inv.date}</span>
                        </div>
                      </div>
                    </div>

                    {onDeleteInvestigation && (
                      <button
                        onClick={() => handleDelete(inv.id, inv.imageUrl)}
                        className="absolute top-2 right-2 bg-red-600/80 hover:bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete Image"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RadiologyComparator;
