import React, { useState, useMemo, useRef, useLayoutEffect, memo } from 'react';
import { Patient, PacStatus, PatientStatus, VitalSigns } from '../types';
import { useConfig, useAuth } from '../contexts/AppContext';
import { getStatusColor, sortByBed, groupByWard, getTriageBorderClass, needsPac, hasPendingSurgery } from '../utils/calculations';
import { getSmartAlerts } from '../utils/smartAlerts';
import { Search, Filter, UserPlus, Pencil, Layout, Activity, BedDouble, Stethoscope, Layers, ExternalLink, CheckCircle2, AlertCircle, Loader2, ChevronRight, FlaskConical, X, CalendarClock, CalendarCheck, Heart, Home, FileDown, Leaf } from 'lucide-react';
import { exportWardListPDF } from '../utils/exportWardList';
import { toast } from '../utils/toast';
import { NoPatients, NoSearchResults } from './ui/EmptyState';
import BottomSheetPicker from './ui/BottomSheetPicker';
import { calcPod } from './HandoverSummary';
import TodaySchedule from './TodaySchedule';
import OTDatePicker from './OTDatePicker';

/** Strip ward-number prefix from bed for display: "10-05" → "05", "1A" → "1A" */
const shortBed = (bed: string) => bed.includes('-') ? bed.split('-').pop()! : bed;

// ─── NEWS2 Badge ─────────────────────────────────────────────────────────────
function getNews2Config(score: number): { label: string; badge: string; dot: string } {
  // Escalation stays legible without orange: pulse+bold red > bold red > amber > green
  if (score >= 7) return { label: `N2: ${score}`, badge: 'bg-vital-critical-surface text-vital-critical-fg border-vital-critical-border animate-pulse font-bold', dot: 'bg-vital-critical' };
  if (score >= 5) return { label: `N2: ${score}`, badge: 'bg-vital-critical-surface text-vital-critical-fg border-vital-critical-border font-bold', dot: 'bg-vital-critical' };
  if (score >= 2) return { label: `N2: ${score}`, badge: 'bg-vital-warning-surface text-vital-warning-fg border-vital-warning-border', dot: 'bg-vital-warning' };
  return { label: `N2: ${score}`, badge: 'bg-vital-normal-surface text-vital-normal-fg border-vital-normal-border', dot: 'bg-vital-normal' };
}

function News2Badge({ vitals, compact = false }: { vitals?: VitalSigns[]; compact?: boolean }) {
  const latest = vitals?.[0];
  if (!latest || latest.news2Score == null) {
    return compact ? null : (
      <span className="px-1.5 py-0.5 rounded text-[10px] border bg-surface text-ink-faint border-line" title="No vitals recorded">
        <Heart className="w-2.5 h-2.5 inline mr-0.5 opacity-50" />N2—
      </span>
    );
  }
  const cfg = getNews2Config(latest.news2Score);
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] border ${cfg.badge}`}
      title={`NEWS2 score ${latest.news2Score} — recorded ${new Date(latest.timestamp).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}`}
    >
      <Heart className="w-2.5 h-2.5 inline mr-0.5" />{cfg.label}
    </span>
  );
}
import HandoverSummary from './HandoverSummary';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { todayYmd } from '../utils/dates';

// ─── Virtual list item types ───
type FlatItem =
  | { kind: 'ward-header'; ward: string; isIcu: boolean; count: number }
  | { kind: 'patient'; patient: Patient; ward: string; isIcu: boolean };

interface Props {
  patients: Patient[];
  viewMode?: 'home' | 'pending' | 'master' | 'wenthome';
  onAddPatient?: () => void;
  onEditPatient?: (patient: Patient) => void;
  onViewPatient?: (ipNo: string) => void;
  onStartRounds?: () => void;
  onAddLab?: (ipNo: string, type: string, value: number, date: string) => Promise<void>;
  onAssignDate?: (ipNo: string, plannedDos: string) => void;
  onClearDate?: (ipNo: string) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  /** Row of the patient just viewed — briefly accent-highlighted on return. */
  highlightIpNo?: string | null;
}

const WardDashboard: React.FC<Props> = memo(({ patients, viewMode = 'home', onAddPatient, onEditPatient, onViewPatient, onStartRounds, onAddLab, onAssignDate, onClearDate, hasMore, isLoadingMore, onLoadMore, highlightIpNo }) => {
  const { wards: configWards, icuWardNames, labTypes, showNews2, hospitalName, department } = useConfig();
  const { user, selectedUnit } = useAuth();

  // Determine which unit's wards to show:
  // - Unit-assigned staff: use their own unit
  // - Admin/superadmin who picked a specific unit from UnitPicker: use selectedUnit
  // - Admin who picked 'all': show all wards
  const activeConfigWards = useMemo(() => {
    const all = configWards.filter(w => w.active).sort((a, b) => a.sortOrder - b.sortOrder);
    const effectiveUnit = user?.unit ?? (selectedUnit && selectedUnit !== 'all' ? selectedUnit : null);
    if (!effectiveUnit) return all;
    return all.filter(w => !w.unit?.length || w.unit.includes(effectiveUnit) || w.isIcu);
  }, [configWards, user?.unit, selectedUnit]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterPending, setFilterPending] = useState(false);
  const [filterSurgeryToday, setFilterSurgeryToday] = useState(false);
  const [filterPod01, setFilterPod01] = useState(false);
  const [filterOverdueTodos, setFilterOverdueTodos] = useState(false);
  const [selectedWard, setSelectedWard] = useState<string>('All');

  const today = todayYmd();

  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
      if (viewMode === 'wenthome') {
        return p.patientStatus === PatientStatus.WentHome;
      }
      // Always hide WentHome from active ward views
      if (p.patientStatus === PatientStatus.WentHome) return false;

      if (viewMode === 'home') {
        if (p.patientStatus === PatientStatus.Discharged) return false;
      } else if (viewMode === 'pending') {
        if (p.patientStatus === PatientStatus.Discharged) return false;
        if (!hasPendingSurgery(p)) return false;
        // Conservative patients don't need surgery — exclude from the pending/pre-op list
        if ((p.management ?? 'surgical_fixation') === 'conservative') return false;
      }

      const matchesSearch =
        (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.diagnosis || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.bed || '').includes(searchTerm) ||
        (p.ipNo || '').includes(searchTerm);

      const matchesPending = filterPending ? (needsPac(p) && p.pacStatus === PacStatus.Pending) : true;
      const matchesSurgery = filterSurgeryToday ? (p.dos === today || p.plannedDos === today) : true;
      const matchesPod01 = filterPod01 ? (() => { const d = calcPod(p.dos, today); return d === 1 || d === 2; })() : true;
      const matchesOverdue = filterOverdueTodos ? p.todos.some(t => !t.isDone) : true;

      return matchesSearch && matchesPending && matchesSurgery && matchesPod01 && matchesOverdue;
    });
  }, [patients, searchTerm, filterPending, filterSurgeryToday, filterPod01, filterOverdueTodos, viewMode, today]);

  const patientsByWard = useMemo(() => groupByWard(filteredPatients), [filteredPatients]);

  const wardsToDisplay = useMemo(() => {
    const visible = Object.keys(patientsByWard).filter(w => selectedWard === 'All' || w === selectedWard);
    return [...visible].sort((a, b) => {
      const oa = activeConfigWards.findIndex(w => w.name === a);
      const ob = activeConfigWards.findIndex(w => w.name === b);
      return (oa === -1 ? 999 : oa) - (ob === -1 ? 999 : ob);
    });
  }, [patientsByWard, selectedWard, activeConfigWards]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { All: filteredPatients.length };
    activeConfigWards.forEach(w => {
      result[w.name] = filteredPatients.filter(p => p.ward === w.name).length;
    });
    return result;
  }, [filteredPatients, activeConfigWards]);

  // ─── Flat item list for virtual scrolling ───
  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = [];
    for (const ward of wardsToDisplay) {
      const isIcuWard = icuWardNames.has(ward);
      const wps = [...(patientsByWard[ward] ?? [])].sort((a, b) => {
        if (viewMode === 'pending') {
          // Pending list: earliest planned surgery date first, undated cases last
          if (a.plannedDos && b.plannedDos) return a.plannedDos.localeCompare(b.plannedDos);
          if (a.plannedDos) return -1;
          if (b.plannedDos) return 1;
        }
        // All views: primary sort is bed number so the list mirrors the physical ward layout
        return sortByBed(a, b);
      });
      items.push({ kind: 'ward-header', ward, isIcu: isIcuWard, count: wps.length });
      for (const patient of wps) {
        items.push({ kind: 'patient', patient, ward, isIcu: isIcuWard });
      }
    }
    return items;
  }, [wardsToDisplay, patientsByWard, icuWardNames]);

  const listRef = useRef<HTMLDivElement>(null);
  // scrollMargin must be measured after mount — listRef.current is null during render
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    if (listRef.current) setScrollMargin(listRef.current.offsetTop);
  }, []);
  const virtualizer = useWindowVirtualizer({
    count: flatItems.length,
    estimateSize: (i) => flatItems[i].kind === 'ward-header' ? 48 : 164,
    overscan: 6,
    scrollMargin,
  });

  const WardTab = ({ ward, icon: Icon, count, colorClass, activeClass }: any) => (
    <button
      onClick={() => setSelectedWard(ward)}
      aria-label={`${ward} ward, ${count} patients`}
      aria-pressed={selectedWard === ward}
      className={`shrink-0 w-[90px] md:w-auto md:flex-1 flex flex-col items-center justify-center p-2 md:p-4 rounded-xl border transition-all duration-200 ${
        selectedWard === ward
          ? `${activeClass} shadow-md scale-[1.02]`
          : 'bg-surface-card border-line hover:border-accent hover:shadow-sm'
      }`}
    >
      <div className={`p-1.5 md:p-2 rounded-full mb-1 md:mb-2 ${selectedWard === ward ? 'bg-white/20' : 'bg-surface-sunken'}`}>
        <Icon className={`w-4 h-4 md:w-5 md:h-5 ${selectedWard === ward ? 'text-white' : colorClass}`} />
      </div>
      <span className={`text-xs md:text-sm font-bold truncate w-full text-center ${selectedWard === ward ? 'text-white' : 'text-ink'}`}>{ward === 'All' ? 'All' : ward}</span>
      <span className={`text-[10px] md:text-xs ${selectedWard === ward ? 'text-white/80' : 'text-ink-muted'}`}>{count} pts</span>
    </button>
  );

  const clearFilters = () => {
    setFilterPending(false);
    setFilterSurgeryToday(false);
    setFilterPod01(false);
    setFilterOverdueTodos(false);
    setSearchTerm('');
  };

  const hasActiveFilters = filterPending || filterSurgeryToday || filterPod01 || filterOverdueTodos || searchTerm;

  // ─── Export ward list PDF (follows the active ward tab) ───
  const [exporting, setExporting] = useState(false);
  const handleExportPdf = async () => {
    const sections = wardsToDisplay
      .map(w => ({ name: w, patients: patientsByWard[w] ?? [] }))
      .filter(s => s.patients.length > 0);
    if (sections.length === 0) {
      toast.error('No patients to export in this view.');
      return;
    }
    setExporting(true);
    try {
      await exportWardListPDF({ sections, hospitalName, department, scopeLabel: selectedWard });
    } catch (err) {
      console.error('[export] ward list PDF failed:', err);
      toast.error('Could not generate the PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // ─── Assign Date state (pending list) ───
  const [assigningDateIp, setAssigningDateIp] = useState<string | null>(null);
  const [assigningDateValue, setAssigningDateValue] = useState('');

  const handleAssignDate = (ipNo: string, date?: string) => {
    const d = date ?? assigningDateValue;
    if (!d || !onAssignDate) return;
    onAssignDate(ipNo, d);
    setAssigningDateIp(null);
    setAssigningDateValue('');
  };

  // ─── Quick Lab Entry state ───
  const [quickLabIp, setQuickLabIp] = useState<string | null>(null);
  const [quickLabType, setQuickLabType] = useState('');
  const [quickLabValue, setQuickLabValue] = useState('');
  const [quickLabSaving, setQuickLabSaving] = useState(false);

  const handleQuickLab = async () => {
    if (!quickLabIp || !quickLabType || !quickLabValue || !onAddLab) return;
    setQuickLabSaving(true);
    try {
      await onAddLab(quickLabIp, quickLabType, parseFloat(quickLabValue), today);
      setQuickLabIp(null);
      setQuickLabType('');
      setQuickLabValue('');
    } finally {
      setQuickLabSaving(false);
    }
  };

  // ─── Went Home View ─────────────────────────────────────────────────────────
  if (viewMode === 'wenthome') {
    return (
      <div className="space-y-3">
        {filteredPatients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-ink-faint">
            <Home className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-base font-semibold text-ink-muted">No patients went home</p>
            <p className="text-sm mt-1">Patients temporarily sent home will appear here.</p>
          </div>
        ) : (
          filteredPatients.map(p => (
            <div
              key={p.ipNo}
              className="bg-surface-card rounded-xl border border-line border-l-4 border-l-accent p-4 flex items-center gap-4 cursor-pointer hover:shadow-sm hover:border-accent transition-all active:scale-[0.99]"
              onClick={() => onViewPatient?.(p.ipNo)}
            >
              <div className="w-10 h-10 rounded-lg bg-surface-sunken flex items-center justify-center text-sm font-bold font-mono text-ink shrink-0">
                {p.bed}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ink truncate">{p.name}</p>
                <p className="text-xs text-ink-muted mt-0.5">{p.age}y · {p.gender} · IP {p.ipNo}</p>
                <p className="text-xs text-ink-muted mt-1 break-words">{p.diagnosis}</p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-accent-soft text-accent-fg border border-accent">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                  Went Home
                </span>
                {p.doa && (
                  <span className="text-[10px] text-ink-faint">
                    DOA {new Date(p.doa).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Today's Department Schedule — home view only */}
      {viewMode === 'home' && (
        <TodaySchedule
          userUnit={user?.unit ?? null}
          isAdmin={!user?.unit || user?.role === 'admin' || user?.role === 'superadmin'}
        />
      )}

      {/* Ward Snapshot Strip — home view only */}
      {viewMode === 'home' && (
        <HandoverSummary
          patients={patients.filter(p => p.patientStatus !== PatientStatus.Discharged)}
          onFilterSurgeryToday={() => { clearFilters(); setFilterSurgeryToday(true); }}
          onFilterPod01={() => { clearFilters(); setFilterPod01(true); }}
          onFilterPacPending={() => { clearFilters(); setFilterPending(true); }}
          onFilterOverdueTodos={() => { clearFilters(); setFilterOverdueTodos(true); }}
          onStartRounds={onStartRounds ?? (() => {})}
        />
      )}

      {/* Ward Selection Tabs — rendered from ward_config */}
      <div className="flex overflow-x-auto gap-2 pb-1 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:pb-0">
        <WardTab ward="All" icon={Layers} count={counts.All} colorClass="text-ink-muted" activeClass="bg-ink border-ink text-white" />
        {activeConfigWards.map((w, i) => {
          const NON_ICU_STYLES = [
            { icon: BedDouble,   colorClass: 'text-accent-fg', activeClass: 'bg-accent border-accent-pressed text-white' },
            { icon: Stethoscope, colorClass: 'text-accent-fg', activeClass: 'bg-accent border-accent-pressed text-white' },
            { icon: BedDouble,   colorClass: 'text-accent-fg', activeClass: 'bg-accent border-accent-pressed text-white' },
          ];
          const style = icuWardNames.has(w.name)
            ? { icon: Activity, colorClass: 'text-accent-fg', activeClass: 'bg-accent border-accent-pressed text-white' }
            : NON_ICU_STYLES[i % NON_ICU_STYLES.length];
          return (
            <WardTab key={w.name} ward={w.name} icon={style.icon}
              count={counts[w.name] ?? 0}
              colorClass={style.colorClass} activeClass={style.activeClass}
            />
          );
        })}
      </div>

      {/* Controls */}
      <div className="bg-surface-card p-3 md:p-4 rounded-lg shadow-sm border border-line sticky top-0 z-10">
        <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center">
          <div className="relative w-full xl:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
            <input
              type="text"
              placeholder="Search Name, Bed, IP No, Diagnosis..."
              className="w-full pl-10 pr-4 py-2 border border-line rounded-md focus:ring-2 focus:ring-accent focus:outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 w-full xl:w-auto">
            {(viewMode === 'home' || viewMode === 'master') && onAddPatient && (
              <button onClick={onAddPatient} className="flex items-center gap-2 bg-accent hover:bg-accent-pressed text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors">
                <UserPlus className="w-4 h-4" /> Add Patient
              </button>
            )}
            {viewMode === 'home' && (
              <button
                onClick={handleExportPdf}
                disabled={exporting}
                aria-label="Export ward list as PDF"
                className="flex items-center gap-2 bg-surface-card border border-line hover:border-accent hover:text-accent-fg text-ink px-4 py-2 rounded-lg font-medium shadow-sm transition-colors disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                {exporting ? 'Exporting…' : 'Export PDF'}
              </button>
            )}
            <button
              onClick={() => setFilterPending(!filterPending)}
              className={`flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-lg font-medium text-sm border transition-colors ${filterPending ? 'bg-vital-critical-surface text-vital-critical-fg border-vital-critical-border' : 'border-line text-ink-muted hover:bg-surface'}`}
            >
              <Filter className="w-4 h-4" /> PAC Pending
            </button>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2 min-h-[44px] rounded-lg font-medium text-xs border border-line text-ink-muted hover:bg-surface-sunken transition-colors"
              >
                ✕ Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Patient Tables by Ward — Desktop only; mobile uses virtual list below */}
      <div className="hidden md:block space-y-6">
      {wardsToDisplay.map(ward => {
        const wardPatients = [...patientsByWard[ward]].sort((a, b) => {
          if (viewMode === 'pending') {
            // Pending: earliest planned surgery date first, undated last
            if (a.plannedDos && b.plannedDos) return a.plannedDos.localeCompare(b.plannedDos);
            if (a.plannedDos) return -1;
            if (b.plannedDos) return 1;
          }
          // Primary sort: bed number (mirrors physical ward layout)
          return sortByBed(a, b);
        });
        const isIcuWard = icuWardNames.has(ward);
        const criticalCount = isIcuWard ? wardPatients.length : 0;
        return (
        <div key={ward} className="space-y-2">
          <div className={`px-4 py-2 rounded-lg flex items-center gap-2 border ${isIcuWard ? 'bg-accent-soft text-ink border-line' : 'bg-surface-sunken text-ink border-line'}`}>
            <Layout className="w-4 h-4" />
            <h3 className="font-bold uppercase tracking-wide text-sm">{ward}</h3>
            <span className="text-xs font-normal opacity-70">({wardPatients.length})</span>
            {isIcuWard && criticalCount > 0 && (
              <span className="ml-auto flex items-center gap-1.5 text-xs font-bold text-vital-critical-fg bg-vital-critical-surface border border-vital-critical-border px-2 py-0.5 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-vital-critical opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-vital-critical" />
                </span>
                CRITICAL
              </span>
            )}
          </div>

          {/* Desktop Table (md and up) */}
          <div className="hidden md:block bg-surface-card rounded-lg shadow-sm border border-line overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-ink-muted uppercase bg-surface border-b border-line">
                <tr>
                  <th className="px-6 py-3 min-w-[56px]">Bed</th>
                  <th className="px-6 py-3 min-w-[160px]">Patient</th>
                  {showNews2 && <th className="px-4 py-3 min-w-[80px] text-center" title="NEWS2 Early Warning Score">NEWS2</th>}
                  <th className="px-6 py-3 min-w-[140px]">Diagnosis</th>
                  <th className="px-6 py-3 min-w-[120px]">Comorbidities</th>
                  <th className="px-6 py-3 min-w-[140px]">Status</th>
                  {viewMode !== 'pending' && <th className="px-6 py-3 text-center min-w-[60px]">POD</th>}
                  <th className="px-6 py-3 min-w-[120px]">Procedure</th>
                  {viewMode === 'pending' && <th className="px-6 py-3">Planned Date</th>}
                  {(onEditPatient || onViewPatient) && <th className="px-6 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {wardPatients.map((patient) => (
                  <tr
                    key={patient.ipNo}
                    className={`border-b last:border-0 hover:bg-surface transition-colors ${getTriageBorderClass(patient)} ${
                      !patient.dos && needsPac(patient) && patient.pacStatus === PacStatus.Pending ? 'bg-vital-critical-surface/30' : ''
                    } ${patient.patientStatus === PatientStatus.Discharged ? 'opacity-60 bg-surface' : ''} ${
                      highlightIpNo === patient.ipNo ? 'row-highlight' : ''
                    }`}
                  >
                    <td className="px-6 py-4 font-medium font-mono leading-5 text-ink">{shortBed(patient.bed)}</td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-ink flex items-center gap-2">
                        {onViewPatient ? (
                          <button onClick={() => onViewPatient(patient.ipNo)} className="text-accent-fg hover:text-accent-pressed hover:underline font-semibold text-left">
                            {patient.name}
                          </button>
                        ) : patient.name}
                        {patient.patientStatus === PatientStatus.Discharged && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-sunken text-ink-muted uppercase tracking-wide">Discharged</span>
                        )}
                        {patient.dailyRounds.some(r => r.date === today) && (
                          <span title="Rounded today">
                            <CheckCircle2 className="w-3.5 h-3.5 text-vital-normal shrink-0" />
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-muted flex flex-wrap items-center gap-1">
                        <span>{patient.age} / {patient.gender} • IP: {patient.ipNo}</span>
                      </div>
                      <div className="text-xs text-accent-fg">{patient.mobile}</div>
                    </td>
                    {showNews2 && (
                      <td className="px-4 py-4 text-center">
                        <News2Badge vitals={patient.vitals} />
                      </td>
                    )}
                    <td className="px-4 py-3 max-w-[280px]">
                      <span className="block whitespace-normal break-words text-sm text-ink">{patient.diagnosis}</span>
                      {getSmartAlerts(patient).map((a, i) => (
                        <span key={i} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded mt-1 mr-1 ${
                          a.type === 'critical' ? 'bg-vital-critical-surface text-vital-critical-fg' :
                          a.type === 'warning'  ? 'bg-vital-warning-surface text-vital-warning-fg' :
                                                  'bg-vital-low-surface text-vital-low-fg'
                        }`}>⚡ {a.message}</span>
                      ))}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {patient.comorbidities.map(c => (
                          <span key={c} className="px-2 py-0.5 bg-surface-sunken text-ink-muted rounded text-xs">{c}</span>
                        ))}
                        {patient.comorbidities.length === 0 && <span className="text-ink-muted">—</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 space-y-2">
                      {!patient.dos && (
                        needsPac(patient) ? (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(patient.pacStatus)} flex items-center gap-1 w-fit`}>
                            {patient.pacStatus === PacStatus.Pending
                              ? <AlertCircle className="w-3 h-3 shrink-0" aria-label="PAC Pending" />
                              : <CheckCircle2 className="w-3 h-3 shrink-0" aria-label="PAC Fit" />}
                            {patient.pacStatus}
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-medium border bg-vital-normal-surface text-vital-normal-fg border-vital-normal-border flex items-center gap-1 w-fit">
                            <Leaf className="w-3 h-3 shrink-0" aria-hidden="true" /> Conservative
                          </span>
                        )
                      )}
                      {patient.patientStatus !== PatientStatus.Fit && (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${patient.patientStatus === PatientStatus.Discharged ? 'bg-surface-sunken text-ink-muted border-line' : getStatusColor(patient.patientStatus)} block w-fit`}>
                          {patient.patientStatus === PatientStatus.Review ? 'Needs Review' : patient.patientStatus}
                        </span>
                      )}
                    </td>
                    {viewMode !== 'pending' && (
                      <td className="px-6 py-4 text-center">
                        {calcPod(patient.dos, today) !== undefined ? (
                          <div className="inline-block p-2 rounded-lg border-2 border-vital-normal bg-vital-normal-surface">
                            <span className="block text-[10px] uppercase font-bold text-vital-normal-fg leading-none mb-0.5">POD</span>
                            <span className="font-bold font-mono text-lg text-vital-normal-fg leading-none">{calcPod(patient.dos, today)}</span>
                          </div>
                        ) : (
                          <span className="text-ink-muted">-</span>
                        )}
                      </td>
                    )}
                    <td className="px-6 py-4">
                      {patient.procedure || <span className="text-ink-faint text-xs italic">—</span>}
                      {patient.dos && <div className="text-xs text-ink-muted font-medium">DOS: {patient.dos}</div>}
                    </td>
                    {viewMode === 'pending' && (
                      <td className="px-6 py-4">
                        {patient.plannedDos ? (
                          <button
                            onClick={() => { setAssigningDateIp(patient.ipNo); setAssigningDateValue(patient.plannedDos ?? ''); }}
                            className="flex items-center gap-1.5 px-2 py-1 bg-accent-soft hover:bg-accent-soft text-accent-fg border border-accent rounded text-xs font-semibold transition-colors"
                            title="Change planned date"
                          >
                            <CalendarCheck className="w-3.5 h-3.5" />
                            {patient.plannedDos}
                          </button>
                        ) : onAssignDate ? (
                          <button
                            onClick={() => { setAssigningDateIp(patient.ipNo); setAssigningDateValue(''); }}
                            className="flex items-center gap-1.5 px-2 py-1 bg-surface hover:bg-accent-soft text-ink-muted hover:text-accent-fg border border-dashed border-line hover:border-accent rounded text-xs transition-colors"
                            title="Assign surgery date"
                          >
                            <CalendarClock className="w-3.5 h-3.5" />
                            Assign date
                          </button>
                        ) : (
                          <span className="text-ink-faint text-xs">—</span>
                        )}
                      </td>
                    )}
                    {(onEditPatient || onViewPatient) && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {onViewPatient && (
                            <button
                              onClick={() => onViewPatient(patient.ipNo)}
                              className="p-2 hover:bg-accent-soft rounded-full text-ink-faint hover:text-accent-fg transition-colors"
                              title="View Details"
                              aria-label={`View details for ${patient.name}`}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          )}
                          {onEditPatient && (
                            <button
                              onClick={() => onEditPatient(patient)}
                              className="p-2 hover:bg-surface-sunken rounded-full text-ink-muted hover:text-accent-fg transition-colors"
                              title="Edit"
                              aria-label={`Edit ${patient.name}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
        );
      })}
      </div>

      {/* ─── Start Rounds CTA — mobile home view only ─── */}
      {viewMode === 'home' && onStartRounds && filteredPatients.length > 0 && (
        <div className="md:hidden">
          <button
            onClick={onStartRounds}
            className="w-full flex items-center justify-between bg-accent text-white p-4 rounded-xl shadow-md active:scale-[0.98] transition-transform"
          >
            <div>
              <p className="font-bold text-sm">Start Ward Rounds</p>
              <p className="text-white/75 text-xs mt-0.5">{filteredPatients.length} patients · tap to begin</p>
            </div>
            <ChevronRight className="w-5 h-5 text-white/70" />
          </button>
        </div>
      )}

      {/* ─── Mobile: Virtualised flat card list (all wards) ─── */}
      <div className="md:hidden" ref={listRef}>
        <div
          role="list"
          aria-label="Patient list"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map(vi => {
            const item = flatItems[vi.index];
            return (
              <div
                key={vi.key}
                role={item.kind === 'patient' ? 'listitem' : undefined}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vi.start - (virtualizer.options.scrollMargin ?? 0)}px)`,
                }}
              >
                {item.kind === 'ward-header' ? (
                  <div className={`px-4 py-2 rounded-lg flex items-center gap-2 border mb-2 ${item.isIcu ? 'bg-accent-soft text-ink border-line' : 'bg-surface-sunken text-ink border-line'}`}>
                    <Layout className="w-4 h-4" />
                    <h3 className="font-bold uppercase tracking-wide text-sm">{item.ward}</h3>
                    <span className="text-xs font-normal opacity-70">({item.count})</span>
                    {item.isIcu && (
                      <span className="ml-auto flex items-center gap-1.5 text-xs font-bold text-vital-critical-fg bg-vital-critical-surface border border-vital-critical-border px-2 py-0.5 rounded-full">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-vital-critical opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-vital-critical" />
                        </span>
                        CRITICAL
                      </span>
                    )}
                  </div>
                ) : (
                  <div
                    className={`p-4 space-y-3 bg-surface-card border border-line rounded-lg mb-2 ${getTriageBorderClass(item.patient)} ${
                      !item.patient.dos && needsPac(item.patient) && item.patient.pacStatus === PacStatus.Pending ? 'bg-vital-critical-surface/20' : ''
                    } ${highlightIpNo === item.patient.ipNo ? 'row-highlight' : ''}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <span className={`text-white text-sm font-bold font-mono w-10 h-10 shrink-0 flex items-center justify-center rounded-lg ${item.isIcu ? 'bg-ink' : 'bg-accent'}`}>
                          {shortBed(item.patient.bed)}
                        </span>
                        <div>
                          <h3 className="font-bold text-ink flex items-center gap-1.5 max-w-[160px] truncate" title={item.patient.name}>
                            <span className="truncate">{item.patient.name}</span>
                            {item.patient.dailyRounds.some(r => r.date === today) && (
                              <span title="Rounded today">
                                <CheckCircle2 className="w-3 h-3 text-vital-normal shrink-0" />
                              </span>
                            )}
                          </h3>
                          <div className="text-xs text-ink-muted">
                            {item.patient.age}y • {item.patient.gender} • {item.patient.ipNo}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {showNews2 && <News2Badge vitals={item.patient.vitals} compact />}
                        {calcPod(item.patient.dos, today) !== undefined && (
                          <div className="text-xs font-bold uppercase text-ink-muted border-2 border-vital-normal bg-vital-normal-surface p-1.5 rounded text-center">
                            <span className="text-vital-normal-fg block text-[9px]">POD</span>
                            <span className="text-lg font-mono text-vital-normal-fg block leading-none">{calcPod(item.patient.dos, today)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-sm border-t border-line pt-2">
                      <p className="font-medium text-ink break-words">{item.patient.diagnosis}</p>
                      {item.patient.procedure && <p className="text-xs text-ink-muted mt-0.5">{item.patient.procedure}</p>}
                      {item.patient.comorbidities.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {item.patient.comorbidities.slice(0, 2).map(c => (
                            <span key={c} className="px-2 py-0.5 bg-surface-sunken text-ink-muted rounded text-xs">{c}</span>
                          ))}
                          {item.patient.comorbidities.length > 2 && (
                            <span className="px-2 py-0.5 text-ink-faint text-xs">+{item.patient.comorbidities.length - 2} more</span>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Planned date row — pending view only */}
                    {viewMode === 'pending' && (
                      <div className="flex items-center gap-2 border-t border-line pt-2">
                        {item.patient.plannedDos ? (
                          <button
                            onClick={() => { setAssigningDateIp(item.patient.ipNo); setAssigningDateValue(item.patient.plannedDos ?? ''); }}
                            className="flex items-center gap-1.5 px-2 py-1 bg-accent-soft text-accent-fg border border-accent rounded text-xs font-semibold"
                          >
                            <CalendarCheck className="w-3.5 h-3.5" />
                            {item.patient.plannedDos}
                          </button>
                        ) : onAssignDate ? (
                          <button
                            onClick={() => { setAssigningDateIp(item.patient.ipNo); setAssigningDateValue(''); }}
                            className="flex items-center gap-1.5 px-2 py-1 bg-surface text-ink-muted border border-dashed border-line rounded text-xs"
                          >
                            <CalendarClock className="w-3.5 h-3.5" />
                            Assign surgery date
                          </button>
                        ) : null}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-1.5">
                        {!item.patient.dos && (
                          needsPac(item.patient) ? (
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(item.patient.pacStatus)}`}>
                              {item.patient.pacStatus === 'PAC Pending' && <AlertCircle className="w-3 h-3" aria-hidden="true" />}
                              {item.patient.pacStatus === 'PAC Fit' && <CheckCircle2 className="w-3 h-3" aria-hidden="true" />}
                              {item.patient.pacStatus}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-vital-normal-surface text-vital-normal-fg border-vital-normal-border">
                              <Leaf className="w-3 h-3" aria-hidden="true" /> Conservative
                            </span>
                          )
                        )}
                        {item.patient.patientStatus !== PatientStatus.Fit && (
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(item.patient.patientStatus)}`}>
                            {item.patient.patientStatus === PatientStatus.Critical && <AlertCircle className="w-3 h-3" aria-hidden="true" />}
                            {item.patient.patientStatus === PatientStatus.DischargeReady && <CheckCircle2 className="w-3 h-3" aria-hidden="true" />}
                            {item.patient.patientStatus === PatientStatus.Review ? 'Needs Review' : item.patient.patientStatus}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {onAddLab && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setQuickLabIp(item.patient.ipNo); setQuickLabType(''); setQuickLabValue(''); }}
                            className="w-11 h-11 flex items-center justify-center bg-accent-soft hover:bg-accent-soft rounded-lg text-accent-fg transition-colors"
                            title="Quick Lab Entry"
                            aria-label={`Add lab result for ${item.patient.name}`}
                          >
                            <FlaskConical className="w-4 h-4" />
                          </button>
                        )}
                        {onEditPatient && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onEditPatient(item.patient); }}
                            className="w-11 h-11 flex items-center justify-center bg-surface-sunken hover:bg-accent-soft rounded-lg text-ink-muted transition-colors"
                            title="Edit"
                            aria-label={`Edit ${item.patient.name}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {onViewPatient && (
                          <button
                            onClick={() => onViewPatient(item.patient.ipNo)}
                            className="px-3 py-1.5 bg-accent hover:bg-accent-pressed text-white text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors"
                            aria-label={`View details for ${item.patient.name}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> View
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Load More — shown when more pages exist on the server */}
      {hasMore && onLoadMore && (
        <div className="flex justify-center pt-2 pb-4">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="flex items-center gap-2 px-5 py-2 rounded-lg border border-line bg-surface-card text-ink text-sm font-medium hover:bg-surface disabled:opacity-60 transition-colors shadow-sm"
          >
            {isLoadingMore
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>
              : 'Load more patients'}
          </button>
        </div>
      )}

      {wardsToDisplay.length === 0 && (
        <div className="bg-surface-card rounded-xl border border-line">
          {hasActiveFilters ? (
            <NoSearchResults query={searchTerm || 'current filters'} />
          ) : (
            <NoPatients onAdd={onAddPatient} />
          )}
        </div>
      )}

      {/* ─── OT Date Picker modal ─── */}
      {assigningDateIp && onAssignDate && (() => {
        const pt = patients.find(p => p.ipNo === assigningDateIp);
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
            <OTDatePicker
              unit={pt?.unit ?? user?.unit ?? undefined}
              value={assigningDateValue}
              minDate={today}
              onSelect={date => handleAssignDate(assigningDateIp, date)}
              onClear={() => { if (assigningDateIp) onClearDate?.(assigningDateIp); setAssigningDateIp(null); setAssigningDateValue(''); }}
              onCancel={() => { setAssigningDateIp(null); setAssigningDateValue(''); }}
            />
          </div>
        );
      })()}

      {/* ─── Quick Lab Entry bottom panel — mobile only ─── */}
      {quickLabIp && onAddLab && (
        <div className="md:hidden fixed left-0 right-0 z-40 bg-surface-card border-t border-line shadow-2xl px-4 py-4 animate-in slide-in-from-bottom-4 duration-200" style={{ bottom: 'calc(var(--bottom-nav-height, 56px) + var(--safe-area-bottom, env(safe-area-inset-bottom, 0px)))' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-sm text-ink">Quick Lab Entry</p>
              <p className="text-xs text-ink-muted">{patients.find(p => p.ipNo === quickLabIp)?.name ?? quickLabIp}</p>
            </div>
            <button onClick={() => setQuickLabIp(null)} className="text-ink-faint hover:text-ink-muted p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <BottomSheetPicker
              title="Lab Type"
              value={quickLabType}
              placeholder="Select lab type…"
              options={[
                { value: '', label: 'Select lab type…' },
                ...labTypes.filter(l => l.active).map(lt => ({ value: lt.name, label: `${lt.name} (${lt.unit})` })),
              ]}
              onChange={val => setQuickLabType(val)}
              triggerClassName="flex-1 min-h-[44px] p-2 border border-line rounded text-sm flex items-center justify-between gap-1 bg-surface-card"
            />
            <input
              type="number"
              placeholder="Value"
              value={quickLabValue}
              onChange={e => setQuickLabValue(e.target.value)}
              className="w-20 min-h-[44px] p-2 border border-line rounded text-sm font-mono focus:ring-2 focus:ring-accent outline-none"
            />
            <button
              onClick={handleQuickLab}
              disabled={!quickLabType || !quickLabValue || quickLabSaving}
              className="px-3 min-h-[44px] bg-accent hover:bg-accent-pressed text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
            >
              {quickLabSaving ? '…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

WardDashboard.displayName = 'WardDashboard';
export default WardDashboard;
