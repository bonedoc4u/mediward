/**
 * RoundProgress — a thin bar under the Round Mode title: how many patients
 * on this list have a round today.
 */
import React from 'react';

interface Props {
  rounded: number;
  total: number;
}

const RoundProgress: React.FC<Props> = ({ rounded, total }) => {
  const pct = total > 0 ? Math.round((rounded / total) * 100) : 0;
  return (
    <div className="mb-4 flex items-center gap-3">
      <span
        role="progressbar"
        aria-label={`${rounded} of ${total} rounded today`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={rounded}
        className="flex-1 h-1.5 rounded-full bg-surface-sunken overflow-hidden"
      >
        <span className="block h-full rounded-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
      </span>
      <span className="shrink-0 text-xs font-semibold text-ink-muted tabular-nums" aria-hidden="true">
        {rounded}/{total} rounded
      </span>
    </div>
  );
};

export default RoundProgress;
