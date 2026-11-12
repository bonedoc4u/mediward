/**
 * RoundActionBar — the one primary action of Round Mode, fixed in the thumb
 * zone: save this patient and move to the next bed.
 */
import React from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Patient } from '../../../types';

interface Props {
  /** False on the first patient. */
  canGoBack: boolean;
  next?: Pick<Patient, 'bed' | 'name'>;
  onPrev: () => void;
  onDone: () => void;
}

const RoundActionBar: React.FC<Props> = ({ canGoBack, next, onPrev, onDone }) => (
  <div className="round-action-bar z-30 py-3 bg-surface border-t border-line">
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canGoBack}
        aria-label="Previous patient"
        className="w-14 min-h-14 shrink-0 flex items-center justify-center rounded-card border border-line bg-surface-card text-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="w-5 h-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onDone}
        className="flex-1 min-w-0 min-h-14 flex items-center justify-center gap-2 px-4 rounded-card bg-accent hover:bg-accent-pressed active:bg-accent-pressed text-white font-bold shadow-sm transition-colors"
      >
        {next ? (
          <>
            <span className="truncate">Done · next: Bed {next.bed}</span>
            <ChevronRight className="w-5 h-5 shrink-0" aria-hidden="true" />
          </>
        ) : (
          <>
            <Check className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>Done · finish round</span>
          </>
        )}
      </button>
    </div>
  </div>
);

export default RoundActionBar;
