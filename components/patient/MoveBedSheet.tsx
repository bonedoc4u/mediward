/**
 * MoveBedSheet.tsx — bottom sheet to move a patient to a different bed / ward.
 * Kept separate from demographics so "move bed" is a deliberate, quick action.
 * Saves via the caller's onSave (PatientContext.updatePatient → audited).
 */
import React, { useState } from 'react';
import { X, ArrowRightLeft } from 'lucide-react';
import { Patient, Ward } from '../../types';
import BottomSheetPicker from '../ui/BottomSheetPicker';

interface Props {
  patient: Patient;
  wardOptions: string[];
  onSave: (bed: string, ward: Ward) => void;
  onClose: () => void;
}

const INPUT =
  'w-full px-4 py-3 min-h-[48px] border border-slate-200 rounded-2xl text-base text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';

const MoveBedSheet: React.FC<Props> = ({ patient, wardOptions, onSave, onClose }) => {
  const [bed, setBed] = useState(patient.bed);
  const [ward, setWard] = useState<Ward>(patient.ward);

  // Include the current ward even if it's no longer in the active config list.
  const options = wardOptions.includes(ward) ? wardOptions : [ward, ...wardOptions];

  const handleSave = () => {
    const trimmed = bed.trim();
    if (!trimmed) return;
    onSave(trimmed, ward);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-5 pb-10 sm:pb-6 sheet-in-bottom sm:animate-none">
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5 sm:hidden" />
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-teal-600" /> Move bed
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 mb-4">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Ward</label>
            <BottomSheetPicker
              value={ward}
              options={options.map(w => ({ value: w, label: w }))}
              onChange={w => setWard(w as Ward)}
              title="Move to ward"
              triggerClassName={`${INPUT} flex items-center justify-between gap-2 text-left`}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Bed</label>
            <input className={INPUT} value={bed} onChange={e => setBed(e.target.value)} placeholder="Bed number" autoFocus />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!bed.trim()}
          className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-bold rounded-2xl transition-colors"
        >
          Confirm move
        </button>
      </div>
    </div>
  );
};

export default MoveBedSheet;
