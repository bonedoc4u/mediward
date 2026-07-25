/**
 * AddFractureSheet.tsx — records a new distinct fracture: pick the region,
 * then optionally which side. Classifications are added separately per
 * fracture afterward (see AddClassificationSheet) — this step only creates
 * the fracture entry itself.
 */
import React, { useState } from 'react';
import { X } from 'lucide-react';
import BottomSheetPicker from '../ui/BottomSheetPicker';
import { FRACTURE_REGIONS, REGION_GROUPS } from '../../utils/fractureClassifications';

interface Props {
  onSave: (region: string, side?: 'left' | 'right' | 'bilateral') => void;
  onClose: () => void;
}

const SIDE_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'bilateral', label: 'Bilateral' },
];

const AddFractureSheet: React.FC<Props> = ({ onSave, onClose }) => {
  const [region, setRegion] = useState('');
  const [side, setSide] = useState('');

  const regionOptions = REGION_GROUPS.flatMap(group =>
    FRACTURE_REGIONS.filter(r => r.group === group).map(r => ({
      value: r.key,
      label: r.label,
      description: group,
    })),
  );

  const canSave = region.length > 0;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-surface-card rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-5 pb-10 sm:pb-6 animate-[slideUp_0.25s_ease-out] sm:animate-none">
        <div className="w-10 h-1 bg-surface-sunken rounded-full mx-auto mb-5 sm:hidden" />
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-ink">Add fracture</h3>
          <button onClick={onClose} className="p-1.5 rounded-full text-ink-faint hover:text-ink hover:bg-surface-sunken transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
          Region
        </label>
        <div className="mb-4">
          <BottomSheetPicker
            title="Fracture region"
            value={region}
            options={regionOptions}
            onChange={setRegion}
            placeholder="Select region…"
          />
        </div>

        <label className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
          Side (optional)
        </label>
        <div className="mb-4">
          <BottomSheetPicker
            title="Side"
            value={side}
            options={SIDE_OPTIONS}
            onChange={setSide}
            placeholder="Not specified"
          />
        </div>

        <button
          onClick={() => { onSave(region, (side || undefined) as 'left' | 'right' | 'bilateral' | undefined); onClose(); }}
          disabled={!canSave}
          className="w-full py-3.5 bg-accent hover:bg-accent-pressed disabled:opacity-40 text-white text-sm font-bold rounded-2xl transition-colors"
        >
          Save fracture
        </button>
      </div>
    </div>
  );
};

export default AddFractureSheet;
