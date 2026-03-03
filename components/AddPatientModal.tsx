import React, { useState, useEffect, useRef } from 'react';
import { Patient, Gender, PacStatus, Ward } from '../types';
import { useConfig, useAuth } from '../contexts/AppContext';
import { supabase } from '../lib/supabase';
import { parseFhirPatient } from '../services/fhirService';
import { X, Save, UserPlus, Pencil, ScanLine, Loader2, FileJson, ChevronDown, ChevronUp } from 'lucide-react';


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

const AddPatientModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialData }) => {
  const { wards, unitOptions } = useConfig();
  const { user } = useAuth();
  const activeWards = wards.filter(w => w.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const defaultWard = activeWards[0]?.name ?? 'Ward 1';

  // Non-admins are locked to their own unit; admins can assign any unit
  const isAdmin = user?.role === 'admin';
  const defaultUnit = user?.unit ?? '';

  const [formData, setFormData] = useState({
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
    patientStatus: 'Admitted'
  });

  // ── FHIR import ──
  const [showFhirImport, setShowFhirImport] = useState(false);
  const [fhirJson, setFhirJson] = useState('');
  const [fhirImportError, setFhirImportError] = useState<string | null>(null);

  const handleFhirImport = () => {
    setFhirImportError(null);
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

  // ── Admission slip scanner ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const handleScanSlip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);
    setScanning(true);

    try {
      // Read file as base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Get session token for Edge Function auth
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(
        'https://mnyjpxkopiktsrqmjilb.supabase.co/functions/v1/parse-admission-slip',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ image: base64, mimeType: file.type }),
        },
      );

      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? 'Scan failed');

      // Map extracted fields into form (only overwrite non-null values)
      setFormData(prev => ({
        ...prev,
        ...(result.name   ? { name: String(result.name) }   : {}),
        ...(result.age    ? { age: String(Math.round(Number(result.age))) } : {}),
        ...(result.gender && ['Male','Female','Other'].includes(result.gender) ? { gender: result.gender as Gender } : {}),
        ...(result.ipNo   ? { ipNo: String(result.ipNo) }   : {}),
        ...(result.doa    ? { doa: String(result.doa) }     : {}),
        ...(result.mobile ? { mobile: String(result.mobile) } : {}),
      }));
    } catch (err: any) {
      setScanError(err.message ?? 'Could not read slip');
    } finally {
      setScanning(false);
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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
      todos: initialData?.todos || []
    };
    
    onSave(patientData);
    onClose();
  };

  // Helper to get a consistent color for a tag
  const getTagColor = (tag: string) => {
    const index = tag.length % COLORS.length;
    return COLORS[index];
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-lg sticky top-0 z-10">
          <div className="flex items-center gap-2">
            {initialData ? <Pencil className="w-5 h-5 text-blue-600" /> : <UserPlus className="w-5 h-5 text-blue-600" />}
            <h3 className="font-bold text-slate-800">{initialData ? 'Edit Patient Details' : 'Admit New Patient'}</h3>
          </div>
          <div className="flex items-center gap-2">
            {/* Hidden file input — triggered by the Scan button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleScanSlip}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={scanning}
              title="Scan admission slip to auto-fill"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              {scanning
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning…</>
                : <><ScanLine className="w-3.5 h-3.5" /> Scan Slip</>}
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* Scan error banner */}
          {scanError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <X className="w-4 h-4 shrink-0" />
              <span><strong>Scan failed:</strong> {scanError}</span>
              <button type="button" onClick={() => setScanError(null)} className="ml-auto text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* Section 1: Demographics */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-900 border-b pb-2">1. Demographics & Identifiers</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                          // Auto-fill unit from ward config (admins only; non-admins keep their locked unit)
                          // Only auto-fill when ward has exactly 1 unit; if shared or multi-unit, keep previous selection
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
                    Unit
                    {!isAdmin && <span className="ml-1 text-slate-400 normal-case font-normal">(your unit)</span>}
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
                    <input
                      type="text"
                      readOnly
                      className="w-full p-2 border border-slate-200 rounded text-sm bg-slate-50 text-slate-600 cursor-not-allowed"
                      value={formData.unit || '—'}
                    />
                  )}
               </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="col-span-1">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bed No.</label>
                <input
                    required
                    type="text"
                    className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.bed}
                    onChange={e => setFormData({...formData, bed: e.target.value})}
                />
                </div>
                <div className="col-span-1">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">IP Number</label>
                <input
                    required
                    type="text"
                    className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.ipNo}
                    disabled={!!initialData} // Lock IP Number on edit to prevent identity issues
                    onChange={e => setFormData({...formData, ipNo: e.target.value})}
                />
                </div>
                <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mobile Number</label>
                <input
                    type="tel"
                    className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.mobile}
                    onChange={e => setFormData({...formData, mobile: e.target.value})}
                />
                </div>
            </div>

            {/* ABHA ID */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                ABHA ID <span className="normal-case font-normal text-slate-400">(Ayushman Bharat — optional)</span>
              </label>
              <input
                type="text"
                placeholder="14-digit ABHA number"
                maxLength={17}
                className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none font-mono tracking-wider"
                value={formData.abhaId}
                onChange={e => setFormData({...formData, abhaId: e.target.value})}
              />
            </div>

            {/* FHIR Import */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => { setShowFhirImport(v => !v); setFhirImportError(null); }}
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-xs font-semibold text-slate-600"
              >
                <span className="flex items-center gap-1.5">
                  <FileJson className="w-3.5 h-3.5 text-teal-600" />
                  Import from FHIR JSON
                </span>
                {showFhirImport ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {showFhirImport && (
                <div className="p-3 space-y-2 border-t border-slate-200">
                  <p className="text-[11px] text-slate-500">Paste a FHIR R4 Patient resource or Document Bundle. Matched fields will pre-fill this form.</p>
                  <textarea
                    rows={4}
                    placeholder='{"resourceType":"Patient", ...}'
                    className="w-full p-2 border border-slate-300 rounded text-xs font-mono focus:ring-2 focus:ring-teal-500 outline-none resize-none"
                    value={fhirJson}
                    onChange={e => setFhirJson(e.target.value)}
                  />
                  {fhirImportError && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <X className="w-3.5 h-3.5 shrink-0" /> {fhirImportError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleFhirImport}
                    disabled={!fhirJson.trim()}
                    className="w-full py-1.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white text-xs font-semibold rounded transition-colors"
                  >
                    Parse &amp; Fill Form
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Patient Name</label>
                    <input 
                        required
                        type="text" 
                        className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Age</label>
                    <input 
                        required
                        type="number" 
                        className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.age}
                        onChange={e => setFormData({...formData, age: e.target.value})}
                    />
                    </div>
                    <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Gender</label>
                    <select 
                        className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        value={formData.gender}
                        onChange={e => setFormData({...formData, gender: e.target.value as Gender})}
                    >
                        <option value={Gender.Male}>Male</option>
                        <option value={Gender.Female}>Female</option>
                        <option value={Gender.Other}>Other</option>
                    </select>
                    </div>
                </div>
            </div>
          </div>

          {/* Section 2: Clinical Data */}
          <div className="space-y-4">
             <h4 className="text-sm font-bold text-slate-900 border-b pb-2">2. Clinical Details</h4>
             
             <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Diagnosis</label>
                <textarea 
                    required
                    rows={2}
                    className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.diagnosis}
                    onChange={e => setFormData({...formData, diagnosis: e.target.value})}
                />
            </div>

            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Comorbidities (Click to Select)</label>
                
                {/* Custom Input */}
                <div className="mb-3">
                   <input 
                      type="text" 
                      placeholder="Type custom comorbidity and press Enter..." 
                      className="w-full text-sm p-2 border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                      value={customComorbidity}
                      onChange={e => setCustomComorbidity(e.target.value)}
                      onKeyDown={addCustomComorbidity}
                   />
                </div>

                {/* Selected Chips */}
                {selectedComorbidities.length > 0 && (
                   <div className="flex flex-wrap gap-2 mb-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                      {selectedComorbidities.map(c => (
                        <span key={c} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${getTagColor(c)} shadow-sm`}>
                           {c}
                           <button type="button" onClick={() => toggleComorbidity(c)} className="hover:bg-black/10 rounded-full p-0.5">
                              <X className="w-3 h-3" />
                           </button>
                        </span>
                      ))}
                   </div>
                )}

                {/* Options List */}
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                   {COMORBIDITY_OPTIONS.filter(opt => !selectedComorbidities.includes(opt)).map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggleComorbidity(opt)}
                        className="px-2 py-1 rounded-md text-xs border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all"
                      >
                         + {opt}
                      </button>
                   ))}
                </div>
            </div>
          </div>

          {/* Section 3: Status & Plan */}
          <div className="space-y-4">
             <h4 className="text-sm font-bold text-slate-900 border-b pb-2">3. Ward Status & Plan</h4>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">PAC Status</label>
                    <select 
                        className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        value={formData.pacStatus}
                        onChange={e => setFormData({...formData, pacStatus: e.target.value as PacStatus})}
                    >
                        {Object.values(PacStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Patient Status</label>
                    <input
                        type="text"
                        className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.patientStatus}
                        placeholder="e.g. Fit, Review, Critical"
                        onChange={e => setFormData({...formData, patientStatus: e.target.value})}
                    />
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date of Admission</label>
                    <input 
                        type="date"
                        className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.doa}
                        onChange={e => setFormData({...formData, doa: e.target.value})}
                    />
                </div>
                 <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Procedure</label>
                    <input 
                        type="text"
                        placeholder="Planned or Completed Procedure"
                        className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={formData.procedure}
                        onChange={e => setFormData({...formData, procedure: e.target.value})}
                    />
                </div>
             </div>

             <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date of Surgery (If completed)</label>
                <input 
                    type="date"
                    className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.dos}
                    onChange={e => setFormData({...formData, dos: e.target.value})}
                />
                <p className="text-[10px] text-slate-400 mt-1">Leave blank if surgery is pending.</p>
             </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button 
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-slate-300 rounded text-slate-600 hover:bg-slate-50 font-medium"
            >
                Cancel
            </button>
            <button 
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded flex items-center justify-center gap-2"
            >
                <Save className="w-4 h-4" />
                {initialData ? 'Update Patient' : 'Admit Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddPatientModal;