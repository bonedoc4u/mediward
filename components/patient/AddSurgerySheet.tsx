/**
 * AddSurgerySheet.tsx — records that a (second or further) surgery happened:
 * procedure name + date entered together, submitted as one atomic action.
 * Deliberately NOT two separate field edits — see the design spec
 * (docs/superpowers/specs/2026-07-17-second-surgery-support-design.md) for
 * why editing procedure and DOS independently risks losing the prior
 * surgery's data depending on which field is changed first.
 */
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { todayYmd } from '../../utils/dates';

interface Props {
  onSave: (procedure: string, dos: string) => void;
  onClose: () => void;
  /** Pre-fills the date — e.g. a previously-planned date for this surgery. */
  defaultDate?: string;
}

const AddSurgerySheet: React.FC<Props> = ({ onSave, onClose, defaultDate }) => {
  const [procedure, setProcedure] = useState('');
  const [dos, setDos] = useState(defaultDate ?? '');
  const canSave = procedure.trim().length > 0 && dos.length > 0;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-surface-card rounded-t-3xl sm:rounded-3xl shadow-2xl px-5 pt-5 pb-10 sm:pb-6 animate-[slideUp_0.25s_ease-out] sm:animate-none">
        <div className="w-10 h-1 bg-surface-sunken rounded-full mx-auto mb-5 sm:hidden" />
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-ink">Add another surgery</h3>
          <button onClick={onClose} className="p-1.5 rounded-full text-ink-faint hover:text-ink hover:bg-surface-sunken transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label htmlFor="add-surgery-procedure" className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
          Procedure name
        </label>
        <input
          id="add-surgery-procedure"
          type="text"
          value={procedure}
          onChange={e => setProcedure(e.target.value)}
          placeholder="e.g. Implant removal"
          className="w-full px-4 py-3.5 border border-line rounded-2xl text-base text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent mb-4"
          autoFocus
        />

        <label htmlFor="add-surgery-dos" className="block text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1">
          Date of surgery
        </label>
        <input
          id="add-surgery-dos"
          type="date"
          value={dos}
          onChange={e => setDos(e.target.value)}
          max={todayYmd()}
          className="w-full px-4 py-3.5 border border-line rounded-2xl text-base text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent mb-4"
        />

        <button
          onClick={() => { onSave(procedure.trim(), dos); onClose(); }}
          disabled={!canSave}
          className="w-full py-3.5 bg-accent hover:bg-accent-pressed disabled:opacity-40 text-white text-sm font-bold rounded-2xl transition-colors"
        >
          Save surgery
        </button>
      </div>
    </div>
  );
};

export default AddSurgerySheet;
