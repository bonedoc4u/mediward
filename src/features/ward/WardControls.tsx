/**
 * WardControls — the search row of the Ward Dashboard.
 *
 * Phone: one row (search, filter menu, "⋯" menu) so the patient list starts
 * on the first screen. Add patient is the floating button instead.
 * md up: search plus the full button row, as before.
 * The parent makes this row sticky.
 */
import React from 'react';
import { CalendarClock, FileDown, Filter, HeartPulse, ListChecks, Loader2, MoreVertical, Search, Stethoscope, UserPlus, X } from 'lucide-react';
import ActionMenu from '../../../components/ui/ActionMenu';
import type { SnapshotFilter } from '../../../components/HandoverSummary';

export type WardFilters = Record<SnapshotFilter, boolean>;

const FILTER_LABELS: Record<SnapshotFilter, string> = {
  surgeryToday: 'Surgery today',
  pod01: 'POD 0–1',
  pending: 'PAC pending',
  overdueTodos: 'Overdue orders',
};
const FILTER_ICONS: Record<SnapshotFilter, React.ComponentType<{ className?: string }>> = {
  surgeryToday: CalendarClock,
  pod01: HeartPulse,
  pending: Stethoscope,
  overdueTodos: ListChecks,
};

interface Props {
  viewMode: 'home' | 'pending' | 'master' | 'wenthome';
  searchTerm: string;
  onSearch: (term: string) => void;
  filters: WardFilters;
  onToggleFilter: (key: SnapshotFilter) => void;
  onClear: () => void;
  onAddPatient?: () => void;
  onExportWardList: () => void;
  exportingWardList: boolean;
  onExportShiftHandover: () => void;
}

const WardControls: React.FC<Props> = ({
  viewMode, searchTerm, onSearch, filters, onToggleFilter, onClear,
  onAddPatient, onExportWardList, exportingWardList, onExportShiftHandover,
}) => {
  const activeKeys = (Object.keys(filters) as SnapshotFilter[]).filter(k => filters[k]);
  const hasActiveFilters = activeKeys.length > 0 || searchTerm !== '';
  const canAdd = (viewMode === 'home' || viewMode === 'master') && !!onAddPatient;

  return (
    <div className="bg-surface-card p-2 md:p-4 rounded-card shadow-sm border border-line">
      <div className="flex flex-col xl:flex-row gap-2 md:gap-4 justify-between items-stretch xl:items-center">
        <div className="flex items-center gap-2 w-full xl:w-96">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search patients"
              placeholder="Name, bed, IP no, diagnosis"
              className="w-full min-h-11 pl-10 pr-3 border border-line rounded-control bg-surface-card text-ink placeholder:text-ink-faint focus:ring-2 focus:ring-accent focus:outline-none"
              value={searchTerm}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>

          {/* Phone tools */}
          <div className="md:hidden flex items-center gap-2">
            <ActionMenu
              label={activeKeys.length ? `Filters, ${activeKeys.length} on` : 'Filters'}
              active={activeKeys.length > 0}
              items={(Object.keys(FILTER_LABELS) as SnapshotFilter[]).map(key => ({
                key,
                label: FILTER_LABELS[key],
                icon: FILTER_ICONS[key],
                checked: filters[key],
                onSelect: () => onToggleFilter(key),
              }))}
            >
              <Filter className="w-4 h-4" aria-hidden="true" />
            </ActionMenu>
            {viewMode === 'home' && (
              <ActionMenu
                label="More actions"
                items={[
                  { key: 'ward-list', label: exportingWardList ? 'Exporting ward list…' : 'Ward list (PDF)', icon: FileDown, disabled: exportingWardList, onSelect: onExportWardList },
                  { key: 'handover', label: 'Shift handover (PDF)', icon: FileDown, onSelect: onExportShiftHandover },
                ]}
              >
                {exportingWardList
                  ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  : <MoreVertical className="w-4 h-4" aria-hidden="true" />}
              </ActionMenu>
            )}
          </div>
        </div>

        {/* Phone: what is filtered, and a way out */}
        {hasActiveFilters && (
          <div className="md:hidden flex items-center gap-2 px-1 text-sm text-ink-muted">
            <span className="flex-1 min-w-0 truncate">
              Showing: {[...activeKeys.map(k => FILTER_LABELS[k]), ...(searchTerm ? [`“${searchTerm}”`] : [])].join(' · ')}
            </span>
            <button
              type="button"
              onClick={onClear}
              className="shrink-0 min-h-11 px-3 flex items-center gap-1 rounded-control font-semibold text-accent-fg hover:bg-accent-soft"
            >
              <X className="w-4 h-4" aria-hidden="true" /> Clear
            </button>
          </div>
        )}

        {/* md up: the full button row */}
        <div className="hidden md:flex flex-wrap gap-2 w-full xl:w-auto">
          {canAdd && (
            <button onClick={onAddPatient} className="flex items-center gap-2 bg-accent hover:bg-accent-pressed text-white px-4 py-2 rounded-control font-medium shadow-sm transition-colors">
              <UserPlus className="w-4 h-4" /> Add Patient
            </button>
          )}
          {viewMode === 'home' && (
            <button
              onClick={onExportWardList}
              disabled={exportingWardList}
              aria-label="Export ward list as PDF"
              className="flex items-center gap-2 bg-surface-card border border-line hover:border-accent hover:text-accent-fg text-ink px-4 py-2 rounded-control font-medium shadow-sm transition-colors disabled:opacity-50"
            >
              {exportingWardList ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              {exportingWardList ? 'Exporting…' : 'Export PDF'}
            </button>
          )}
          <button
            onClick={() => onToggleFilter('pending')}
            aria-pressed={filters.pending}
            className={`flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-control font-medium text-sm border transition-colors ${filters.pending ? 'bg-accent-soft text-accent-fg border-accent' : 'border-line text-ink-muted hover:bg-surface'}`}
          >
            <Filter className="w-4 h-4" /> PAC Pending
          </button>
          {hasActiveFilters && (
            <button
              onClick={onClear}
              className="flex items-center gap-1 px-3 py-2 min-h-[44px] rounded-control font-medium text-xs border border-line text-ink-muted hover:bg-surface-sunken transition-colors"
            >
              ✕ Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default WardControls;
