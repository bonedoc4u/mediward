import React, { useState, useMemo, useCallback } from 'react';
import { ClipboardList, Plus, Pencil, Printer, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePatients } from '../contexts/PatientContext';
import { useAuth } from '../contexts/AuthContext';
import { Patient } from '../types';

interface Props {
  onAddPatient?: (source: 'OPD' | 'Casualty') => void;
  onEditPatient?: (patient: Patient) => void;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function fmtDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function stepDate(dateStr: string, delta: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + delta);
  return d.toISOString().split('T')[0];
}

type SourceSection = 'OPD' | 'Casualty';

const SOURCE_STYLE: Record<SourceSection, { badge: string; header: string; addBtn: string }> = {
  OPD:      { badge: 'bg-teal-100 text-teal-800',   header: 'bg-teal-50 border-teal-200 text-teal-800',     addBtn: 'bg-teal-600 hover:bg-teal-700 text-white' },
  Casualty: { badge: 'bg-orange-100 text-orange-800', header: 'bg-orange-50 border-orange-200 text-orange-800', addBtn: 'bg-orange-500 hover:bg-orange-600 text-white' },
};

const AdmissionListTable: React.FC<{
  source: SourceSection;
  patients: Patient[];
  onAdd?: () => void;
  onEdit?: (p: Patient) => void;
}> = ({ source, patients, onAdd, onEdit }) => {
  const style = SOURCE_STYLE[source];

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Section header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${style.header}`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.badge}`}>{source}</span>
          <span className="text-sm font-semibold">
            {patients.length} patient{patients.length !== 1 ? 's' : ''}
          </span>
        </div>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold ${style.addBtn}`}
          >
            <Plus className="w-3.5 h-3.5" /> Add {source}
          </button>
        )}
      </div>

      {patients.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-400 bg-white">
          No {source} admissions for this date
        </div>
      ) : (
        <div className="overflow-x-auto bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                <th className="px-3 py-2 text-center w-10">Sl</th>
                <th className="px-3 py-2 text-left">IP No</th>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-center">Age/Sex</th>
                <th className="px-3 py-2 text-left">Diagnosis</th>
                <th className="px-3 py-2 text-left">Mobile</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {patients.map((p, idx) => (
                <tr key={p.ipNo} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2.5 text-center text-slate-400 font-mono text-xs">{idx + 1}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600 whitespace-nowrap">{p.ipNo}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-800">{p.name}</td>
                  <td className="px-3 py-2.5 text-center whitespace-nowrap text-slate-600">
                    {p.age}<span className="text-slate-400 mx-0.5">/</span>
                    <span className={p.gender === 'Female' ? 'text-pink-600' : 'text-blue-600'}>{p.gender[0]}</span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700 max-w-[200px] truncate" title={p.diagnosis}>{p.diagnosis}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-600 whitespace-nowrap">{p.mobile || '—'}</td>
                  <td className="px-3 py-2.5">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(p)}
                        className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                        title="Edit patient"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const AdmissionList: React.FC<Props> = ({ onAddPatient, onEditPatient }) => {
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const { patients } = usePatients();
  const { user } = useAuth();

  const isToday = selectedDate === todayStr();

  // Filter by date and unit, deduplicating by ipNo so a transient realtime
  // race (cache + fresh fetch + INSERT event all overlapping) never produces
  // repeated rows in the admission list.
  const dayPatients = useMemo(() => {
    const seen = new Set<string>();
    return patients.filter(p => {
      if (p.doa !== selectedDate) return false;
      if (user?.unit && p.unit && p.unit !== user.unit) return false;
      if (seen.has(p.ipNo)) return false;
      seen.add(p.ipNo);
      return true;
    });
  }, [patients, selectedDate, user?.unit]);

  const opdPatients      = useMemo(() => dayPatients.filter(p => p.admissionSource === 'OPD'),      [dayPatients]);
  const casualtyPatients = useMemo(() => dayPatients.filter(p => p.admissionSource === 'Casualty'), [dayPatients]);
  const otherPatients    = useMemo(() => dayPatients.filter(p => !p.admissionSource),               [dayPatients]);

  const handlePrint = useCallback(() => window.print(), []);

  const totalLabelled = opdPatients.length + casualtyPatients.length;

  return (
    <div className="space-y-4 pb-24">
      {/* Header bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        {/* Row 1: title + print */}
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-teal-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800 leading-tight">Admission List</h2>
            {user?.unit && (
              <p className="text-xs text-slate-500">{user.unit}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors shrink-0"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>

        {/* Row 2: date navigator */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSelectedDate(d => stepDate(d, -1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors shrink-0"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="date"
            value={selectedDate}
            max={todayStr()}
            onChange={e => setSelectedDate(e.target.value)}
            className="flex-1 min-w-0 border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-slate-800 focus:ring-2 focus:ring-teal-500 outline-none"
          />
          {!isToday && (
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr())}
              className="text-xs text-teal-600 hover:text-teal-800 font-semibold px-2 py-1 rounded-lg hover:bg-teal-50 shrink-0"
            >
              Today
            </button>
          )}
          <button
            type="button"
            onClick={() => setSelectedDate(d => stepDate(d, 1))}
            disabled={isToday}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-30 transition-colors shrink-0"
            aria-label="Next day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary chips */}
      {dayPatients.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
            {fmtDisplay(selectedDate)} · {dayPatients.length} total
          </span>
          {opdPatients.length > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-100 text-teal-700">
              OPD: {opdPatients.length}
            </span>
          )}
          {casualtyPatients.length > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">
              Casualty: {casualtyPatients.length}
            </span>
          )}
        </div>
      )}

      {/* OPD section */}
      <AdmissionListTable
        source="OPD"
        patients={opdPatients}
        onAdd={onAddPatient ? () => onAddPatient('OPD') : undefined}
        onEdit={onEditPatient}
      />

      {/* Casualty section */}
      <AdmissionListTable
        source="Casualty"
        patients={casualtyPatients}
        onAdd={onAddPatient ? () => onAddPatient('Casualty') : undefined}
        onEdit={onEditPatient}
      />

      {/* Patients without a source — show with a note so they're not hidden */}
      {otherPatients.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50 text-slate-600">
            <span className="text-sm font-semibold">Other admissions (no source set)</span>
            <span className="text-xs text-slate-400">{otherPatients.length}</span>
          </div>
          <div className="overflow-x-auto bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                  <th className="px-3 py-2 text-center w-10">Sl</th>
                  <th className="px-3 py-2 text-left">IP No</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-center">Age/Sex</th>
                  <th className="px-3 py-2 text-left">Diagnosis</th>
                  <th className="px-3 py-2 text-left">Mobile</th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {otherPatients.map((p, idx) => (
                  <tr key={p.ipNo} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 text-center text-slate-400 font-mono text-xs">{idx + 1}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{p.ipNo}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-800">{p.name}</td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap text-slate-600">
                      {p.age}<span className="text-slate-400 mx-0.5">/</span>
                      <span className={p.gender === 'Female' ? 'text-pink-600' : 'text-blue-600'}>{p.gender[0]}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 max-w-[200px] truncate" title={p.diagnosis}>{p.diagnosis}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-600">{p.mobile || '—'}</td>
                    <td className="px-3 py-2.5">
                      {onEditPatient && (
                        <button type="button" onClick={() => onEditPatient(p)} className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state for the whole day */}
      {dayPatients.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No admissions on {fmtDisplay(selectedDate)}</p>
          <p className="text-slate-400 text-sm mt-1">Patients admitted on this date will appear here</p>
          {onAddPatient && isToday && (
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => onAddPatient('OPD')}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg"
              >
                <Plus className="w-4 h-4" /> Add OPD
              </button>
              <button
                type="button"
                onClick={() => onAddPatient('Casualty')}
                className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg"
              >
                <Plus className="w-4 h-4" /> Add Casualty
              </button>
            </div>
          )}
        </div>
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .admission-print, .admission-print * { visibility: visible; }
        }
      `}</style>
    </div>
  );
};

export default AdmissionList;
