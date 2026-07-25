/**
 * DateBottomSheet.tsx — a single date-input bottom sheet shared by Patient
 * Detail (DOA/DOS editing) and the Surgical History section (planning a
 * next surgery's date). Extracted so both can use the identical component
 * instead of two copies drifting apart.
 */
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { todayYmd } from '../../utils/dates';

interface Props {
  label: string;
  value: string;
  onSave: (v: string) => void;
  onClose: () => void;
  /** Defaults to today — pass a future date (or omit the cap) for planning ahead. */
  max?: string;
}

const DateBottomSheet: React.FC<Props> = ({ label, value, onSave, onClose, max = todayYmd() }) => {
  const [date, setDate] = useState(value);
  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-surface-card rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-5 pb-10 sm:pb-6 animate-[slideUp_0.25s_ease-out] sm:animate-none">
        <div className="w-10 h-1 bg-surface-sunken rounded-full mx-auto mb-5 sm:hidden" />
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-ink">{label}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full text-ink-faint hover:text-ink hover:bg-surface-sunken transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <input
          type="date"
          aria-label={label}
          value={date}
          onChange={e => setDate(e.target.value)}
          max={max}
          className="w-full px-4 py-3.5 border border-line rounded-2xl text-base text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent mb-4"
          autoFocus
        />
        <button
          onClick={() => { onSave(date); onClose(); }}
          className="w-full py-3.5 bg-accent hover:bg-accent-pressed text-white text-sm font-bold rounded-2xl transition-colors"
        >
          Confirm Date
        </button>
      </div>
    </div>
  );
};

export default DateBottomSheet;
