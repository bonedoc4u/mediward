/**
 * SurgicalHistorySection.tsx — shows past (superseded) surgeries and offers
 * the two second-surgery actions: planning a future date, or recording that
 * one already happened. Renders nothing for the common case (a patient with
 * exactly one surgery and nothing further planned) — this section only
 * earns its place on screen once there's something to show or do.
 */
import React, { useState } from 'react';
import { CalendarClock, Plus } from 'lucide-react';
import { Patient, PacStatus } from '../../types';
import DateBottomSheet from '../ui/DateBottomSheet';
import AddSurgerySheet from './AddSurgerySheet';

interface Props {
  patient: Patient;
  canEdit: boolean;
  onUpdate: (patient: Patient) => void;
  onAddSurgery: (ipNo: string, procedure: string, dos: string) => void;
}

const SurgicalHistorySection: React.FC<Props> = ({ patient, canEdit, onUpdate, onAddSurgery }) => {
  const [showPlanNext, setShowPlanNext] = useState(false);
  const [showAddSurgery, setShowAddSurgery] = useState(false);

  const priorSurgeries = patient.priorSurgeries ?? [];
  const hasCurrentSurgery = !!patient.dos;

  // Nothing to show and nothing actionable yet — stay invisible.
  if (priorSurgeries.length === 0 && !hasCurrentSurgery) return null;

  return (
    <div className="bg-surface-card rounded-2xl shadow-sm border border-line px-4 py-3 mb-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint mb-2">
        Surgical history
      </p>

      {priorSurgeries.length > 0 && (
        <ul className="space-y-1.5 mb-3">
          {priorSurgeries.map((s, i) => (
            <li key={`${s.procedure}-${s.dos}-${i}`} className="flex items-center justify-between text-sm">
              <span className="text-ink">{s.procedure}</span>
              <span className="text-ink-muted tabular-nums">{s.dos}</span>
            </li>
          ))}
        </ul>
      )}

      {canEdit && hasCurrentSurgery && (
        <div className="flex gap-2">
          <button
            onClick={() => setShowPlanNext(true)}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 bg-surface-sunken rounded-xl text-xs font-bold text-ink-muted hover:bg-accent-soft hover:text-accent-fg transition-colors"
          >
            <CalendarClock className="w-3.5 h-3.5" /> Plan next surgery
          </button>
          <button
            onClick={() => setShowAddSurgery(true)}
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 bg-accent-soft rounded-xl text-xs font-bold text-accent-fg hover:bg-accent hover:text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add another surgery
          </button>
        </div>
      )}

      {showPlanNext && (
        <DateBottomSheet
          label="Plan next surgery date"
          value={patient.plannedDos ?? ''}
          max="9999-12-31"
          onSave={val => onUpdate({
            ...patient,
            plannedDos: val || undefined,
            // A second surgery starts its own pre-op/PAC workflow from scratch —
            // without this, the patient would show as already PAC Fit and fully
            // checklisted for a procedure nothing has actually been assessed for.
            pacStatus: PacStatus.Pending,
            pacFlow: undefined,
            preOpChecklist: undefined,
          })}
          onClose={() => setShowPlanNext(false)}
        />
      )}

      {showAddSurgery && (
        <AddSurgerySheet
          defaultDate={patient.plannedDos}
          onSave={(procedure, dos) => onAddSurgery(patient.ipNo, procedure, dos)}
          onClose={() => setShowAddSurgery(false)}
        />
      )}
    </div>
  );
};

export default SurgicalHistorySection;
