import React, { useState, useMemo, useCallback } from 'react';
import { ClipboardList, Plus, Pencil, Printer, ChevronLeft, ChevronRight, Trash2, AlertTriangle, FileDown } from 'lucide-react';
import { usePatients } from '../contexts/PatientContext';
import { useAuth } from '../contexts/AuthContext';
import { Patient } from '../types';

interface Props {
  onAddPatient?: (source: 'OPD' | 'Casualty') => void;
  onEditPatient?: (patient: Patient) => void;
  onDeletePatient?: (patient: Patient) => void;
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

const SOURCE_STYLE: Record<SourceSection, { badge: string; header: string; addBtn: string; accent: string }> = {
  OPD:      { badge: 'bg-teal-100 text-teal-800',   header: 'bg-teal-50 border-teal-200 text-teal-800',       addBtn: 'bg-teal-600 hover:bg-teal-700 text-white',   accent: '#0d9488' },
  Casualty: { badge: 'bg-orange-100 text-orange-800', header: 'bg-orange-50 border-orange-200 text-orange-800', addBtn: 'bg-orange-500 hover:bg-orange-600 text-white', accent: '#f97316' },
};

function exportSectionPdf(source: SourceSection, patients: Patient[], dateStr: string, unit?: string) {
  const win = window.open('', '_blank', 'width=960,height=680');
  if (!win) { alert('Allow pop-ups to export PDF'); return; }

  const accent = SOURCE_STYLE[source].accent;
  const dateLabel = fmtDisplay(dateStr);
  const unitLabel = unit ? ` · ${unit}` : '';

  const rows = patients.map((p, idx) => `
    <tr>
      <td style="text-align:center;color:#94a3b8">${idx + 1}</td>
      <td style="font-family:monospace;font-size:12px">${p.ipNo}</td>
      <td><strong>${p.name}</strong></td>
      <td style="text-align:center;white-space:nowrap">${p.age} / ${p.gender === 'Female' ? '<span style="color:#db2777">F</span>' : '<span style="color:#2563eb">M</span>'}</td>
      <td>${p.diagnosis || '—'}</td>
      <td style="font-family:monospace;font-size:12px">${p.mobile || '—'}</td>
    </tr>`).join('');

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${source} Admission List — ${dateLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #1e293b; padding: 28px 32px; }
    .header { border-bottom: 3px solid ${accent}; padding-bottom: 10px; margin-bottom: 16px; display: flex; align-items: flex-start; justify-content: space-between; }
    .header h1 { font-size: 20px; color: ${accent}; }
    .header .meta { font-size: 12px; color: #64748b; margin-top: 4px; }
    .badge { display: inline-block; background: ${accent}22; color: ${accent}; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 99px; margin-right: 6px; }
    .count { font-size: 12px; color: #64748b; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    thead tr { background: #f8fafc; }
    th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; padding: 8px 10px; text-align: left; border-bottom: 2px solid #e2e8f0; }
    th:first-child { text-align: center; width: 36px; }
    td { padding: 9px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; line-height: 1.4; }
    tr:nth-child(even) { background: #f8fafc; }
    .footer { margin-top: 20px; font-size: 10px; color: #94a3b8; text-align: right; }
    @media print {
      body { padding: 12px 16px; }
      @page { margin: 1cm; size: A4 landscape; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>MediWard — ${source} Admission List</h1>
      <div class="meta">${dateLabel}${unitLabel}</div>
    </div>
    <div style="text-align:right">
      <span class="badge">${source}</span>
      <span class="count">${patients.length} patient${patients.length !== 1 ? 's' : ''}</span>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Sl</th><th>IP No</th><th>Name</th><th>Age/Sex</th><th>Diagnosis</th><th>Mobile</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">Printed from MediWard · ${new Date().toLocaleString()}</div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`);
  win.document.close();
}

const AdmissionListTable: React.FC<{
  source: SourceSection;
  patients: Patient[];
  date: string;
  unit?: string;
  onAdd?: () => void;
  onEdit?: (p: Patient) => void;
  onDelete?: (p: Patient) => void;
}> = ({ source, patients, date, unit, onAdd, onEdit, onDelete }) => {
  const style = SOURCE_STYLE[source];
  const [confirmIpNo, setConfirmIpNo] = useState<string | null>(null);

  const handleDeleteClick = (p: Patient) => {
    setConfirmIpNo(p.ipNo);
  };

  const handleConfirmDelete = (p: Patient) => {
    setConfirmIpNo(null);
    onDelete?.(p);
  };

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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportSectionPdf(source, patients, date, unit)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-current opacity-70 hover:opacity-100 transition-opacity"
            title={`Export ${source} list as PDF`}
          >
            <FileDown className="w-3.5 h-3.5" /> PDF
          </button>
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
      </div>

      {patients.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-400 bg-white">
          No {source} admissions for this date
        </div>
      ) : (
        <div className="overflow-x-auto bg-white">
          {/* table-fixed forces the browser to honour the colgroup widths strictly.
              Without it, the auto layout expands Name and squeezes Diagnosis. */}
          <table className="w-full min-w-[860px] text-sm table-fixed">
            <colgroup>
              <col className="w-10" />          {/* Sl */}
              <col className="w-[88px]" />      {/* IP No */}
              <col className="w-[150px]" />     {/* Name */}
              <col className="w-[72px]" />      {/* Age/Sex */}
              <col />                           {/* Diagnosis — takes all remaining space */}
              <col className="w-[128px]" />     {/* Mobile */}
              <col className="w-[88px]" />      {/* Actions */}
            </colgroup>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                <th className="px-3 py-2.5 text-center">Sl</th>
                <th className="px-3 py-2.5 text-left">IP No</th>
                <th className="px-3 py-2.5 text-left">Name</th>
                <th className="px-3 py-2.5 text-center">Age/Sex</th>
                <th className="px-3 py-2.5 text-left">Diagnosis</th>
                <th className="px-3 py-2.5 text-left">Mobile</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {patients.map((p, idx) => (
                <tr key={p.ipNo} className={`transition-colors ${confirmIpNo === p.ipNo ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                  <td className="px-3 py-3 text-center text-slate-400 font-mono text-xs">{idx + 1}</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">{p.ipNo}</td>
                  <td className="px-3 py-3 font-semibold text-slate-800 break-words">{p.name}</td>
                  <td className="px-3 py-3 text-center whitespace-nowrap text-slate-600">
                    {p.age}<span className="text-slate-400 mx-0.5">/</span>
                    <span className={p.gender === 'Female' ? 'text-pink-600' : 'text-blue-600'}>{p.gender[0]}</span>
                  </td>
                  <td className="px-3 py-3 text-slate-700 leading-snug break-words">{p.diagnosis}</td>
                  <td className="px-3 py-3 font-mono text-slate-600 break-all">{p.mobile || '—'}</td>
                  <td className="px-3 py-2.5">
                    {confirmIpNo === p.ipNo ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleConfirmDelete(p)}
                          className="flex items-center gap-1 px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          <AlertTriangle className="w-3 h-3" /> Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmIpNo(null)}
                          className="px-2 py-1 text-slate-500 hover:text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
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
                        {onDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(p)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove from list"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
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

const OtherAdmissionsTable: React.FC<{
  patients: Patient[];
  onEdit?: (p: Patient) => void;
  onDelete?: (p: Patient) => void;
}> = ({ patients, onEdit, onDelete }) => {
  const [confirmIpNo, setConfirmIpNo] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50 text-slate-600">
        <span className="text-sm font-semibold">Other admissions (no source set)</span>
        <span className="text-xs text-slate-400">{patients.length}</span>
      </div>
      <div className="overflow-x-auto bg-white">
        <table className="w-full min-w-[860px] text-sm table-fixed">
          <colgroup>
            <col className="w-10" />
            <col className="w-[88px]" />
            <col className="w-[150px]" />
            <col className="w-[72px]" />
            <col />
            <col className="w-[128px]" />
            <col className="w-[88px]" />
          </colgroup>
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
              <th className="px-3 py-2.5 text-center">Sl</th>
              <th className="px-3 py-2.5 text-left">IP No</th>
              <th className="px-3 py-2.5 text-left">Name</th>
              <th className="px-3 py-2.5 text-center">Age/Sex</th>
              <th className="px-3 py-2.5 text-left">Diagnosis</th>
              <th className="px-3 py-2.5 text-left">Mobile</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {patients.map((p, idx) => (
              <tr key={p.ipNo} className={`transition-colors ${confirmIpNo === p.ipNo ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                <td className="px-3 py-3 text-center text-slate-400 font-mono text-xs">{idx + 1}</td>
                <td className="px-3 py-3 font-mono text-xs text-slate-600">{p.ipNo}</td>
                <td className="px-3 py-3 font-semibold text-slate-800 break-words">{p.name}</td>
                <td className="px-3 py-3 text-center whitespace-nowrap text-slate-600">
                  {p.age}<span className="text-slate-400 mx-0.5">/</span>
                  <span className={p.gender === 'Female' ? 'text-pink-600' : 'text-blue-600'}>{p.gender[0]}</span>
                </td>
                <td className="px-3 py-3 text-slate-700 leading-snug break-words">{p.diagnosis}</td>
                <td className="px-3 py-3 font-mono text-slate-600 break-all">{p.mobile || '—'}</td>
                <td className="px-3 py-2.5">
                  {confirmIpNo === p.ipNo ? (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => { setConfirmIpNo(null); onDelete?.(p); }}
                        className="flex items-center gap-1 px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors">
                        <AlertTriangle className="w-3 h-3" /> Delete
                      </button>
                      <button type="button" onClick={() => setConfirmIpNo(null)}
                        className="px-2 py-1 text-slate-500 hover:text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      {onEdit && (
                        <button type="button" onClick={() => onEdit(p)}
                          className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onDelete && (
                        <button type="button" onClick={() => setConfirmIpNo(p.ipNo)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remove from list">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AdmissionList: React.FC<Props> = ({ onAddPatient, onEditPatient, onDeletePatient }) => {
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const { patients } = usePatients();
  const { user } = useAuth();

  const isToday = selectedDate === todayStr();

  // Filter by date and unit, deduplicate, then sort by IP No ascending
  // so the earliest-admitted patient is always SL 1.
  const dayPatients = useMemo(() => {
    const seen = new Set<string>();
    return patients
      .filter(p => {
        if (p.doa !== selectedDate) return false;
        if (user?.unit && p.unit && p.unit !== user.unit) return false;
        if (seen.has(p.ipNo)) return false;
        seen.add(p.ipNo);
        return true;
      })
      .sort((a, b) => {
        const an = parseInt(a.ipNo, 10);
        const bn = parseInt(b.ipNo, 10);
        return isNaN(an) || isNaN(bn) ? a.ipNo.localeCompare(b.ipNo) : an - bn;
      });
  }, [patients, selectedDate, user?.unit]);

  const byIpAsc = (a: Patient, b: Patient) => parseInt(a.ipNo, 10) - parseInt(b.ipNo, 10);

  const opdPatients      = useMemo(() => dayPatients.filter(p => p.admissionSource === 'OPD').sort(byIpAsc),      [dayPatients]);
  const casualtyPatients = useMemo(() => dayPatients.filter(p => p.admissionSource === 'Casualty').sort(byIpAsc), [dayPatients]);
  const otherPatients    = useMemo(() => dayPatients.filter(p => !p.admissionSource).sort(byIpAsc),               [dayPatients]);

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
        date={selectedDate}
        unit={user?.unit}
        onAdd={onAddPatient ? () => onAddPatient('OPD') : undefined}
        onEdit={onEditPatient}
        onDelete={onDeletePatient}
      />

      {/* Casualty section */}
      <AdmissionListTable
        source="Casualty"
        patients={casualtyPatients}
        date={selectedDate}
        unit={user?.unit}
        onAdd={onAddPatient ? () => onAddPatient('Casualty') : undefined}
        onEdit={onEditPatient}
        onDelete={onDeletePatient}
      />

      {/* Patients without a source */}
      {otherPatients.length > 0 && (
        <OtherAdmissionsTable
          patients={otherPatients}
          onEdit={onEditPatient}
          onDelete={onDeletePatient}
        />
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
