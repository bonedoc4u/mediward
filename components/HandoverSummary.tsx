import React, { useMemo } from 'react';
import { Patient } from '../types';
import { Scissors, HeartPulse, AlertTriangle, ListChecks, ClipboardList, FileDown } from 'lucide-react';
import { todayYmd } from '../utils/dates';
import { buildShiftSnapshot, exportShiftHandoverPDF } from '../utils/shiftHandover';

// Kept here as well: several screens import calcPod from this file.
export { calcPod } from '../utils/shiftHandover';

export type SnapshotFilter = 'surgeryToday' | 'pod01' | 'pending' | 'overdueTodos';

interface Props {
  patients: Patient[];
  onFilterSurgeryToday: () => void;
  onFilterPod01: () => void;
  onFilterPacPending: () => void;
  onFilterOverdueTodos: () => void;
  onStartRounds: () => void;
  /** Filters currently on, so the matching tiles show as pressed. */
  activeFilters?: ReadonlySet<SnapshotFilter>;
}

interface Tile {
  key: SnapshotFilter;
  label: string;
  count: number;
  names: string[];
  icon: React.ComponentType<{ className?: string }>;
  /** Colour only when the count asks for action (see Product Principle 2). */
  needsAction: boolean;
  onClick: () => void;
}

const HandoverSummary: React.FC<Props> = ({
  patients,
  onFilterSurgeryToday,
  onFilterPod01,
  onFilterPacPending,
  onFilterOverdueTodos,
  onStartRounds,
  activeFilters,
}) => {
  const today = todayYmd();
  const data = useMemo(() => buildShiftSnapshot(patients, today), [patients, today]);
  const firstNames = (list: Patient[]) => list.map(p => p.name.split(' ')[0]).slice(0, 3);

  // Tiles are neutral by default. A tile turns amber only when its count is
  // work left undone (open orders). The old tiles were blue / green / red /
  // amber by position, so "PAC pending" looked like an emergency every day.
  const tiles: Tile[] = [
    { key: 'surgeryToday', label: "Today's Surgeries", count: data.surgeryToday.length, names: firstNames(data.surgeryToday), icon: Scissors, needsAction: false, onClick: onFilterSurgeryToday },
    { key: 'pod01', label: 'POD 0-1 Watch', count: data.pod01.length, names: firstNames(data.pod01), icon: HeartPulse, needsAction: false, onClick: onFilterPod01 },
    { key: 'pending', label: 'PAC Pending', count: data.pacPending.length, names: firstNames(data.pacPending), icon: AlertTriangle, needsAction: false, onClick: onFilterPacPending },
    { key: 'overdueTodos', label: 'Overdue Orders', count: data.overdueTodos.length, names: firstNames(data.overdueTodos), icon: ListChecks, needsAction: data.overdueTodos.length > 0, onClick: onFilterOverdueTodos },
  ];

  const dateLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'short',
  });

  return (
    <div className="md:mb-6">
      {/* Header — md up. On a phone the date is in the top bar, Rounds is in the
          tab bar and the PDF export is in the search row's "⋯" menu. */}
      <div className="hidden md:flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-ink-muted uppercase tracking-wider">Ward Snapshot</h3>
          <p className="text-xs text-ink-muted">{dateLabel} · Click a card to filter</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportShiftHandoverPDF(data, today)}
            className="flex items-center gap-2 px-3 py-2 bg-surface-card hover:bg-surface text-ink text-sm font-semibold rounded-control transition-colors shadow-sm border border-line"
            title="Download shift handover as PDF"
          >
            <FileDown className="w-4 h-4" />
            Export PDF
          </button>
          <button
            onClick={onStartRounds}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-pressed text-white text-sm font-semibold rounded-control transition-colors shadow-sm"
          >
            <ClipboardList className="w-4 h-4" />
            Start Rounds
          </button>
        </div>
      </div>

      {/* Phone: four compact tiles in one row (number + label). The icon and the
          patient names appear from md up. */}
      <div className="grid grid-cols-4 gap-2 md:gap-3">
        {tiles.map(tile => {
          const pressed = activeFilters?.has(tile.key) ?? false;
          return (
            <button
              key={tile.key}
              onClick={tile.onClick}
              aria-pressed={pressed}
              aria-label={`${tile.label}: ${tile.count}. Show only these patients`}
              className={`flex flex-col items-start min-h-14 p-2 md:p-4 rounded-card border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                tile.needsAction
                  ? 'bg-vital-warning-surface border-vital-warning-border hover:border-vital-warning'
                  : 'bg-surface-card border-line hover:border-accent'
              } ${pressed ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''}`}
            >
              <span className={`hidden md:flex p-2 rounded-control mb-3 ${tile.needsAction ? 'bg-vital-warning/15 text-vital-warning-fg' : 'bg-surface-sunken text-ink-muted'}`}>
                <tile.icon className="w-4 h-4" />
              </span>
              <span className={`text-xl md:text-2xl font-bold leading-none mb-1 tabular-nums ${tile.needsAction ? 'text-vital-warning-fg' : 'text-ink'}`}>
                {tile.count}
              </span>
              <span className={`text-xs font-semibold leading-tight md:mb-1 ${tile.needsAction ? 'text-vital-warning-fg' : 'text-ink-muted'}`}>
                {tile.label}
              </span>
              <span className="hidden md:block text-[11px] text-ink-muted leading-relaxed">
                {tile.names.length > 0
                  ? `${tile.names.join(', ')}${tile.count > 3 ? ` +${tile.count - 3}` : ''}`
                  : 'None today'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default HandoverSummary;
