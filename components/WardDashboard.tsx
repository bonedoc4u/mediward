import React, { useState, useMemo, useRef, memo } from 'react';
import { Patient, PacStatus, PatientStatus } from '../types';
import { useConfig, useAuth } from '../contexts/AppContext';
import { getStatusColor, sortByBed, groupByWard, getTriagePriority, getTriageBorderClass } from '../utils/calculations';
import { getSmartAlerts } from '../utils/smartAlerts';
import { Search, Filter, UserPlus, Pencil, Layout, Activity, BedDouble, Stethoscope, Layers, ExternalLink, BedSingle, CheckCircle2, Loader2, ChevronRight, FlaskConical, X } from 'lucide-react';
import HandoverSummary from './HandoverSummary';
import { useWindowVirtualizer } from '@tanstack/react-virtual';

// ─── Virtual list item types ───
type FlatItem =
  | { kind: 'ward-header'; ward: string; isIcu: boolean; count: number }
  | { kind: 'patient'; patient: Patient; ward: string; isIcu: boolean };

interface Props {
  patients: Patient[];
  viewMode?: 'home' | 'pending' | 'master';
  onAddPatient?: () => void;
  onEditPatient?: (patient: Patient) => void;
  onViewPatient?: (ipNo: string) => void;
  onStartRounds?: () => void;
  onAddLab?: (ipNo: string, type: string, value: number, date: string) => Promise<void>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

const WardDashboard: React.FC<Props> = memo(({ patients, viewMode = 'home', onAddPatient, onEditPatient, onViewPatient, onStartRounds, onAddLab, hasMore, isLoadingMore, onLoadMore }) => {
  const { wards: configWards, icuWardNames, labTypes } = useConfig();
  const { user } = useAuth();

  // For unit-scoped users: show only wards belonging to their unit + shared wards (no unit) + ICU wards.
  // Admins (no unit) see all wards.
  const activeConfigWards = useMemo(() => {
    const all = configWards.filter(w => w.active).sort((a, b) => a.sortOrder - b.sortOrder);
    if (!user?.unit) return all; // admin — all wards
    return all.filter(w => !w.unit?.length || w.unit.includes(user.unit) || w.isIcu);
  }, [configWards, user?.unit]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterPending, setFilterPending] = useState(false);
  const [filterSurgeryToday, setFilterSurgeryToday] = useState(false);
  const [filterPod01, setFilterPod01] = useState(false);
  const [filterOverdueTodos, setFilterOverdueTodos] = useState(false);
  const [selectedWard, setSelectedWard] = useState<string>('All');

  const today = new Date().toISOString().split('T')[0];

  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
      if (viewMode === 'home') {
        if (p.patientStatus === PatientStatus.Discharged) return false;
      } else if (viewMode === 'pending') {
        if (p.patientStatus === PatientStatus.Discharged) return false;
        if (p.dos) return false;
      }

      const matchesSearch =
        (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.diagnosis || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.bed || '').includes(searchTerm) ||
        (p.ipNo || '').includes(searchTerm);

      const matchesPending = filterPending ? p.pacStatus === PacStatus.Pending : true;
      const matchesSurgery = filterSurgeryToday ? p.dos === today : true;
      const matchesPod01 = filterPod01 ? (p.pod === 0 || p.pod === 1) : true;
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
        const diff = getTriagePriority(a) - getTriagePriority(b);
        return diff !== 0 ? diff : sortByBed(a, b);
      });
      items.push({ kind: 'ward-header', ward, isIcu: isIcuWard, count: wps.length });
      for (const patient of wps) {
        items.push({ kind: 'patient', patient, ward, isIcu: isIcuWard });
      }
    }
    return items;
  }, [wardsToDisplay, patientsByWard, icuWardNames]);

  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useWindowVirtualizer({
    count: flatItems.length,
    estimateSize: (i) => flatItems[i].kind === 'ward-header' ? 48 : 140,
    overscan: 6,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  const WardTab = ({ ward, icon: Icon, count, colorClass, activeClass }: any) => (
    <button
      onClick={() => setSelectedWard(ward)}
      aria-label={`${ward} ward, ${count} patients`}
      aria-pressed={selectedWard === ward}
      className={`shrink-0 w-[90px] md:w-auto md:flex-1 flex flex-col items-center justify-center p-2 md:p-4 rounded-xl border transition-all duration-200 ${
        selectedWard === ward
          ? `${activeClass} shadow-md scale-[1.02]`
          : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-slate-50'
      }`}
    >
      <div className={`p-1.5 md:p-2 rounded-full mb-1 md:mb-2 ${selectedWard === ward ? 'bg-white/20' : 'bg-slate-100'}`}>
        <Icon className={`w-4 h-4 md:w-5 md:h-5 ${selectedWard === ward ? 'text-white' : colorClass}`} />
      </div>
      <span className={`text-xs md:text-sm font-bold truncate w-full text-center ${selectedWard === ward ? 'text-white' : 'text-slate-700'}`}>{ward === 'All' ? 'All' : ward}</span>
      <span className={`text-[10px] md:text-xs ${selectedWard === ward ? 'text-white/80' : 'text-slate-400'}`}>{count} pts</span>
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

  return (
    <div className="space-y-6">
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
        <WardTab ward="All" icon={Layers} count={counts.All} colorClass="text-slate-600" activeClass="bg-slate-800 border-slate-900 text-white" />
        {activeConfigWards.map((w, i) => {
          const NON_ICU_STYLES = [
            { icon: BedDouble,   colorClass: 'text-blue-600',   activeClass: 'bg-blue-600 border-blue-700 text-white' },
            { icon: Stethoscope, colorClass: 'text-indigo-600', activeClass: 'bg-indigo-600 border-indigo-700 text-white' },
            { icon: BedDouble,   colorClass: 'text-teal-600',   activeClass: 'bg-teal-600 border-teal-700 text-white' },
          ];
          const style = icuWardNames.has(w.name)
            ? { icon: Activity, colorClass: 'text-red-600', activeClass: 'bg-red-600 border-red-700 text-white' }
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
      <div className="bg-white p-3 md:p-4 rounded-lg shadow-sm border border-slate-200 sticky top-0 z-10">
        <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center">
          <div className="relative w-full xl:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search Name, Bed, IP No, Diagnosis..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 w-full xl:w-auto">
            {(viewMode === 'home' || viewMode === 'master') && onAddPatient && (
              <button onClick={onAddPatient} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors">
                <UserPlus className="w-4 h-4" /> Add Patient
              </button>
            )}
            <button
              onClick={() => setFilterPending(!filterPending)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm border transition-colors ${filterPending ? 'bg-red-50 text-red-700 border-red-200' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
            >
              <Filter className="w-4 h-4" /> PAC Pending
            </button>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2 rounded-lg font-medium text-xs border border-slate-300 text-slate-500 hover:bg-slate-100 transition-colors"
              >
                ✕ Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Patient Tables by Ward — Desktop only; mobile uses virtual list below */}
      {wardsToDisplay.map(ward => {
        // Sort by clinical urgency first, then bed number as tiebreaker
        const wardPatients = [...patientsByWard[ward]].sort((a, b) => {
          const diff = getTriagePriority(a) - getTriagePriority(b);
          return diff !== 0 ? diff : sortByBed(a, b);
        });
        const isIcuWard = icuWardNames.has(ward);
        const criticalCount = isIcuWard ? wardPatients.length : 0;
        return (
        <div key={ward} className="space-y-2">
          <div className={`px-4 py-2 rounded-lg flex items-center gap-2 border ${isIcuWard ? 'bg-red-50 text-red-800 border-red-100' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
            <Layout className="w-4 h-4" />
            <h3 className="font-bold uppercase tracking-wide text-sm">{ward}</h3>
            <span className="text-xs font-normal opacity-70">({wardPatients.length})</span>
            {isIcuWard && criticalCount > 0 && (
              <span className="ml-auto flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-100 border border-red-200 px-2 py-0.5 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
                </span>
                CRITICAL
              </span>
            )}
          </div>

          {/* Desktop Table (md and up) */}
          <div className="hidden md:block bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Bed</th>
                  <th className="px-6 py-3">Patient</th>
                  <th className="px-6 py-3">Diagnosis</th>
                  <th className="px-6 py-3">Comorbidities</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-center">POD</th>
                  <th className="px-6 py-3">Procedure</th>
                  {(onEditPatient || onViewPatient) && <th className="px-6 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {wardPatients.map((patient) => (
                  <tr
                    key={patient.ipNo}
                    className={`border-b last:border-0 hover:bg-slate-50 transition-colors ${getTriageBorderClass(patient)} ${
                      patient.pacStatus === PacStatus.Pending ? 'bg-red-50/30' : ''
                    } ${patient.patientStatus === PatientStatus.Discharged ? 'opacity-60 bg-slate-50' : ''}`}
                  >
                    <td className="px-6 py-4 font-medium text-slate-900">{patient.bed}</td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900 flex items-center gap-2">
                        {onViewPatient ? (
                          <button onClick={() => onViewPatient(patient.ipNo)} className="text-blue-600 hover:text-blue-800 hover:underline font-semibold text-left">
                            {patient.name}
                          </button>
                        ) : patient.name}
                        {patient.patientStatus === PatientStatus.Discharged && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 text-slate-600 uppercase tracking-wide">Discharged</span>
                        )}
                        {patient.dailyRounds.some(r => r.date === today) && (
                          <span title="Rounded today">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-1">
                        <span>{patient.age} / {patient.gender} • IP: {patient.ipNo}</span>
                        {patient.pod !== undefined && (
                          <span className="font-bold text-green-700 bg-green-100 px-1.5 rounded-sm ml-1">POD {patient.pod}</span>
                        )}
                      </div>
                      <div className="text-xs text-blue-600">{patient.mobile}</div>
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <div className="truncate" title={patient.diagnosis}>{patient.diagnosis}</div>
                      {getSmartAlerts(patient).map((a, i) => (
                        <span key={i} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded mt-1 mr-1 ${
                          a.type === 'critical' ? 'bg-red-100 text-red-700' :
                          a.type === 'warning'  ? 'bg-amber-100 text-amber-700' :
                                                  'bg-blue-100 text-blue-700'
                        }`}>⚡ {a.message}</span>
                      ))}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {patient.comorbidities.map(c => (
                          <span key={c} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">{c}</span>
                        ))}
                        {patient.comorbidities.length === 0 && <span className="text-slate-400">-</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 space-y-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(patient.pacStatus)} block w-fit`}>
                        {patient.pacStatus}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${patient.patientStatus === PatientStatus.Discharged ? 'bg-slate-100 text-slate-600 border-slate-200' : getStatusColor(patient.patientStatus)} block w-fit`}>
                        {patient.patientStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {patient.pod !== undefined ? (
                        <div className="inline-block p-2 rounded-lg border-2 border-green-500 bg-green-50">
                          <span className="block text-[10px] uppercase font-bold text-green-700 leading-none mb-0.5">POD</span>
                          <span className="font-bold text-lg text-green-800 leading-none">{patient.pod}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {patient.procedure || "Conservative"}
                      {patient.dos && <div className="text-xs text-slate-500 font-medium">DOS: {patient.dos}</div>}
                    </td>
                    {(onEditPatient || onViewPatient) && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {onViewPatient && (
                            <button
                              onClick={() => onViewPatient(patient.ipNo)}
                              className="p-2 hover:bg-blue-100 rounded-full text-slate-400 hover:text-blue-600 transition-colors"
                              title="View Details"
                              aria-label={`View details for ${patient.name}`}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          )}
                          {onEditPatient && (
                            <button
                              onClick={() => onEditPatient(patient)}
                              className="p-2 hover:bg-slate-200 rounded-full text-slate-500 hover:text-blue-600 transition-colors"
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

      {/* ─── Start Rounds CTA — mobile home view only ─── */}
      {viewMode === 'home' && onStartRounds && filteredPatients.length > 0 && (
        <div className="md:hidden">
          <button
            onClick={onStartRounds}
            className="w-full flex items-center justify-between bg-gradient-to-r from-teal-700 to-teal-800 text-white p-4 rounded-xl shadow-md active:scale-[0.98] transition-transform"
          >
            <div>
              <p className="font-bold text-sm">Start Ward Rounds</p>
              <p className="text-teal-200 text-xs mt-0.5">{filteredPatients.length} patients · tap to begin</p>
            </div>
            <ChevronRight className="w-5 h-5 text-teal-300" />
          </button>
        </div>
      )}

      {/* ─── Mobile: Virtualised flat card list (all wards) ─── */}
      <div className="md:hidden" ref={listRef}>
        <div
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
                  <div className={`px-4 py-2 rounded-lg flex items-center gap-2 border mb-2 ${item.isIcu ? 'bg-red-50 text-red-800 border-red-100' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                    <Layout className="w-4 h-4" />
                    <h3 className="font-bold uppercase tracking-wide text-sm">{item.ward}</h3>
                    <span className="text-xs font-normal opacity-70">({item.count})</span>
                    {item.isIcu && (
                      <span className="ml-auto flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-100 border border-red-200 px-2 py-0.5 rounded-full">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
                        </span>
                        CRITICAL
                      </span>
                    )}
                  </div>
                ) : (
                  <div
                    className={`p-4 space-y-3 bg-white border border-slate-200 rounded-lg mb-2 ${getTriageBorderClass(item.patient)} ${
                      item.patient.pacStatus === PacStatus.Pending ? 'bg-red-50/20' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <span className={`text-white text-sm font-bold w-10 h-10 shrink-0 flex items-center justify-center rounded-lg ${item.isIcu ? 'bg-red-700' : 'bg-slate-800'}`}>
                          {item.patient.bed}
                        </span>
                        <div>
                          <h3 className="font-bold text-slate-900 flex items-center gap-1.5">
                            {item.patient.name}
                            {item.patient.dailyRounds.some(r => r.date === today) && (
                              <span title="Rounded today">
                                <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                              </span>
                            )}
                          </h3>
                          <div className="text-xs text-slate-500">
                            {item.patient.age}y • {item.patient.gender} • {item.patient.ipNo}
                          </div>
                        </div>
                      </div>
                      {item.patient.pod !== undefined && (
                        <div className="text-xs font-bold uppercase text-slate-500 border-2 border-green-500 bg-green-50 p-1.5 rounded text-center">
                          <span className="text-green-700 block text-[9px]">POD</span>
                          <span className="text-lg text-green-800 block leading-none">{item.patient.pod}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-sm border-t border-slate-100 pt-2">
                      <p className="font-medium text-slate-800">{item.patient.diagnosis}</p>
                      {item.patient.procedure && <p className="text-xs text-slate-500 mt-0.5">{item.patient.procedure}</p>}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(item.patient.pacStatus)}`}>{item.patient.pacStatus}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(item.patient.patientStatus)}`}>{item.patient.patientStatus}</span>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {onAddLab && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setQuickLabIp(item.patient.ipNo); setQuickLabType(''); setQuickLabValue(''); }}
                            className="p-2 bg-teal-50 hover:bg-teal-100 rounded-lg text-teal-700 transition-colors"
                            title="Quick Lab Entry"
                            aria-label={`Add lab result for ${item.patient.name}`}
                          >
                            <FlaskConical className="w-4 h-4" />
                          </button>
                        )}
                        {onEditPatient && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onEditPatient(item.patient); }}
                            className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors"
                            title="Edit"
                            aria-label={`Edit ${item.patient.name}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {onViewPatient && (
                          <button
                            onClick={() => onViewPatient(item.patient.ipNo)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors"
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
            className="flex items-center gap-2 px-5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 transition-colors shadow-sm"
          >
            {isLoadingMore
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>
              : 'Load more patients'}
          </button>
        </div>
      )}

      {wardsToDisplay.length === 0 && (
        <div className="py-16 px-6 flex flex-col items-center justify-center text-slate-400 bg-white rounded-xl border border-slate-200">
          {hasActiveFilters ? (
            <>
              <Search className="w-10 h-10 mb-3 text-slate-300" />
              <p className="font-semibold text-slate-600">No patients match</p>
              <p className="text-sm text-slate-400 mt-1">Try clearing your filters</p>
              <button onClick={clearFilters} className="mt-3 text-sm text-blue-600 hover:underline">
                Clear all filters
              </button>
            </>
          ) : (
            <>
              <BedSingle className="w-12 h-12 mb-3 opacity-20" />
              <p className="font-semibold text-slate-600">No patients in this view</p>
              {onAddPatient && (
                <button onClick={onAddPatient} className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                  <UserPlus className="w-4 h-4" /> Admit first patient
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── Quick Lab Entry bottom panel — mobile only ─── */}
      {quickLabIp && onAddLab && (
        <div className="md:hidden fixed left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-2xl px-4 py-4 animate-in slide-in-from-bottom-4 duration-200" style={{ bottom: 'calc(var(--bottom-nav-height, 56px) + var(--safe-area-bottom, env(safe-area-inset-bottom, 0px)))' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm text-slate-800">Quick Lab Entry</p>
            <button onClick={() => setQuickLabIp(null)} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <select
              value={quickLabType}
              onChange={e => setQuickLabType(e.target.value)}
              className="flex-1 min-h-[44px] p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none bg-white"
            >
              <option value="">Select lab type…</option>
              {labTypes.filter(l => l.active).map(lt => (
                <option key={lt.id} value={lt.name}>{lt.name} ({lt.unit})</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Value"
              value={quickLabValue}
              onChange={e => setQuickLabValue(e.target.value)}
              className="w-20 min-h-[44px] p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            />
            <button
              onClick={handleQuickLab}
              disabled={!quickLabType || !quickLabValue || quickLabSaving}
              className="px-3 min-h-[44px] bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
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
