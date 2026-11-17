/**
 * RoundWardCard — one ward on the "Start ward rounds" picker.
 *
 * Neutral for every ward. An ICU gets a plain "ICU" tag: being in an ICU is a
 * location, not a warning, and red is kept for critical patients only.
 * The bar shows how much of today's round in that ward is done.
 */
import React from 'react';

interface Props {
  name: string;
  count: number;
  /** Patients in this ward with a round today. */
  rounded: number;
  isIcu?: boolean;
  /** The "All wards" card (dashed outline). */
  allWards?: boolean;
  onSelect: () => void;
}

const RoundWardCard: React.FC<Props> = ({ name, count, rounded, isIcu, allWards, onSelect }) => {
  const pct = count > 0 ? Math.round((rounded / count) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`p-5 rounded-card border text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        allWards ? 'border-dashed border-line bg-surface-sunken' : 'border-line bg-surface-card'
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-lg font-bold text-ink truncate">{name}</span>
          {isIcu && (
            <span className="shrink-0 px-1.5 py-0.5 rounded border border-line bg-surface-sunken text-[11px] font-bold tracking-wide text-ink-muted">
              ICU
            </span>
          )}
        </span>
        <span className="text-3xl font-bold text-ink tabular-nums">{count}</span>
      </span>
      <span className="block mt-1 text-sm text-ink-muted">
        {rounded} of {count} rounded
      </span>
      <span
        role="progressbar"
        aria-label={`${name}: ${rounded} of ${count} rounded`}
        aria-valuemin={0}
        aria-valuemax={count}
        aria-valuenow={rounded}
        className="block mt-3 h-1.5 rounded-full bg-surface-sunken overflow-hidden"
      >
        <span className="block h-full rounded-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
      </span>
    </button>
  );
};

export default RoundWardCard;
