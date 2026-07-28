import React, { useState, useMemo } from 'react';
import { ClipboardList, Plus, Pencil, ChevronLeft, ChevronRight, Trash2, AlertTriangle, FileDown, Loader2, Table2, LayoutGrid, Eye } from 'lucide-react';
import { usePatients } from '../contexts/PatientContext';
import { useAuth } from '../contexts/AuthContext';
import { Patient, Investigation } from '../types';
import { localYmd, todayYmd } from '../utils/dates';
import { getAdmissionDayCohort } from '../utils/calculations';
import { exportAdmissionListPDF } from '../utils/exportAdmissionList';
import { toast } from '../utils/toast';
import { getModality } from './radiology/modality';
import { useSignedUrl } from '../hooks/useSignedUrl';
import { isPdfPath } from '../services/storageService';
import Lightbox from './radiology/Lightbox';

interface Props {
  onAddPatient?: (source: 'OPD' | 'Casualty', doa?: string) => void;
  onEditPatient?: (patient: Patient) => void;
  onDeletePatient?: (patient: Patient) => void;
  onViewPatient?: (ipNo: string) => void;
}

type ViewMode = 'table' | 'cards';
const VIEW_MODE_KEY = 'mediward_admission_view_mode';

function loadViewMode(): ViewMode {
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    return raw === 'table' || raw === 'cards' ? raw : 'cards';
  } catch { return 'cards'; }
}

function saveViewMode(mode: ViewMode) {
  try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* ignore */ }
}

function todayStr() {
  return todayYmd();
}

function fmtDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function stepDate(dateStr: string, delta: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + delta);
  return localYmd(d);
}

type SourceSection = 'OPD' | 'Casualty';

const SOURCE_STYLE: Record<SourceSection, { badge: string; header: string; addBtn: string; accent: string }> = {
  OPD:      { badge: 'bg-teal-100 text-teal-800',   header: 'bg-teal-50 border-teal-200 text-teal-800',       addBtn: 'bg-teal-600 hover:bg-teal-700 text-white',   accent: '#0d9488' },
  Casualty: { badge: 'bg-orange-100 text-orange-800', header: 'bg-orange-50 border-orange-200 text-orange-800', addBtn: 'bg-orange-500 hover:bg-orange-600 text-white', accent: '#f97316' },
};

/** Small tappable thumbnail strip of a patient's investigations — reuses the
 * same signed-URL resolution and fullscreen viewer already built for
 * radiology/culture reports, so X-rays, PDFs, etc. all just work here too. */
export const InvestigationThumb: React.FC<{ inv: Investigation; onClick: () => void }> = ({ inv, onClick }) => {
  const cfg = getModality(inv.type);
  const Icon = cfg.Icon;
  const signedUrl = useSignedUrl(inv.imageUrl);
  const isPdf = !!inv.imageUrl && isPdfPath(inv.imageUrl);

  return (
    <button
      onClick={onClick}
      aria-label={`View ${inv.type}`}
      className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center ${cfg.bg}`}
    >
      {inv.imageUrl && !isPdf && signedUrl
        ? <img src={signedUrl} alt={inv.type} className="w-full h-full object-cover" />
        : <Icon className="w-5 h-5 text-white/70" />}
    </button>
  );
};

export const InvestigationThumbs: React.FC<{ investigations: Investigation[] }> = ({ investigations }) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  if (investigations.length === 0) return null;

  return (
    <>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {investigations.map((inv, i) => (
          <InvestigationThumb key={inv.id} inv={inv} onClick={() => setLightboxIndex(i)} />
        ))}
      </div>
      {lightboxIndex !== null && (
        <Lightbox investigations={investigations} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </>
  );
};

const AdmissionListTable: React.FC<{
  source: SourceSection;
  patients: Patient[];
  date: string;
  unit?: string;
  viewMode: ViewMode;
  onAdd?: () => void;
  onEdit?: (p: Patient) => void;
  onDelete?: (p: Patient) => void;
  onView?: (ipNo: string) => void;
}> = ({ source, patients, date, unit, viewMode, onAdd, onEdit, onDelete, onView }) => {
  const style = SOURCE_STYLE[source];
  const [confirmIpNo, setConfirmIpNo] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleDeleteClick = (p: Patient) => {
    setConfirmIpNo(p.ipNo);
  };

  const handleConfirmDelete = (p: Patient) => {
    setConfirmIpNo(null);
    onDelete?.(p);
  };

  const handleExportPdf = async () => {
    if (patients.length === 0) {
      toast.error(`No ${source} admissions to export for this date.`);
      return;
    }
    setExporting(true);
    try {
      await exportAdmissionListPDF({ source, patients, dateLabel: fmtDisplay(date), unit });
    } catch (err) {
      console.error('[export] admission list PDF failed:', err);
      toast.error('Could not generate the PDF. Please try again.');
    } finally {
      setExporting(false);
    }
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
            onClick={handleExportPdf}
            disabled={exporting}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-current opacity-70 hover:opacity-100 disabled:opacity-40 transition-opacity"
            title={`Export ${source} list as PDF`}
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            PDF
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
        <>
          {viewMode === 'table' && (
          /* Compact table (also the layout the PDF export mirrors) */
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
                    <td className="px-3 py-3 font-semibold break-words">
                      {onView ? (
                        <button type="button" onClick={() => onView(p.ipNo)} className="min-h-11 flex items-center text-accent-fg hover:text-accent-pressed hover:underline text-left">
                          {p.name}
                        </button>
                      ) : (
                        <span className="text-slate-800">{p.name}</span>
                      )}
                    </td>
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
                            className="flex items-center gap-1 px-2 min-h-11 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            <AlertTriangle className="w-3 h-3" /> Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmIpNo(null)}
                            className="px-2 min-h-11 text-slate-500 hover:text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          {onView && (
                            <button
                              type="button"
                              onClick={() => onView(p.ipNo)}
                              className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-accent-fg hover:bg-accent-soft rounded-lg transition-colors"
                              title="View details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onEdit && (
                            <button
                              type="button"
                              onClick={() => onEdit(p)}
                              className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                              title="Edit patient"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteClick(p)}
                              className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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

          {viewMode === 'cards' && (
          /* Card list with inline imaging thumbnails — for walking through
              admissions + X-rays with the unit chief before rounds */
          <div className="divide-y divide-slate-100 bg-white">
            {patients.map((p, idx) => (
              <div key={p.ipNo} className={`p-3 space-y-2 ${confirmIpNo === p.ipNo ? 'bg-red-50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs text-slate-400 font-mono shrink-0">#{idx + 1}</span>
                      {onView ? (
                        <button type="button" onClick={() => onView(p.ipNo)} className="font-semibold text-accent-fg hover:text-accent-pressed hover:underline truncate text-left">
                          {p.name}
                        </button>
                      ) : (
                        <span className="font-semibold text-slate-800 truncate">{p.name}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      <span className="font-mono">IP {p.ipNo}</span> · {p.age}/
                      <span className={p.gender === 'Female' ? 'text-pink-600' : 'text-blue-600'}>{p.gender[0]}</span>
                      {p.mobile && <> · <span className="font-mono">{p.mobile}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {confirmIpNo === p.ipNo ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleConfirmDelete(p)}
                          className="flex items-center gap-1 px-2 py-1.5 min-h-11 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" /> Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmIpNo(null)}
                          className="px-2 py-1.5 min-h-11 text-slate-500 hover:text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        {onView && (
                          <button
                            type="button"
                            onClick={() => onView(p.ipNo)}
                            aria-label={`View ${p.name}'s full details`}
                            className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-accent-fg hover:bg-accent-soft rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        {onEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(p)}
                            aria-label={`Edit ${p.name}`}
                            className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(p)}
                            aria-label={`Remove ${p.name} from list`}
                            className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-700 leading-snug">{p.diagnosis || '—'}</p>
                <InvestigationThumbs investigations={p.investigations} />
              </div>
            ))}
          </div>
          )}
        </>
      )}
    </div>
  );
};

const OtherAdmissionsTable: React.FC<{
  patients: Patient[];
  viewMode: ViewMode;
  onEdit?: (p: Patient) => void;
  onDelete?: (p: Patient) => void;
  onView?: (ipNo: string) => void;
}> = ({ patients, viewMode, onEdit, onDelete, onView }) => {
  const [confirmIpNo, setConfirmIpNo] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50 text-slate-600">
        <span className="text-sm font-semibold">Other admissions (no source set)</span>
        <span className="text-xs text-slate-400">{patients.length}</span>
      </div>
      {viewMode === 'table' && (
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
                <td className="px-3 py-3 font-semibold break-words">
                  {onView ? (
                    <button type="button" onClick={() => onView(p.ipNo)} className="min-h-11 flex items-center text-accent-fg hover:text-accent-pressed hover:underline text-left">
                      {p.name}
                    </button>
                  ) : (
                    <span className="text-slate-800">{p.name}</span>
                  )}
                </td>
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
                        className="flex items-center gap-1 px-2 min-h-11 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors">
                        <AlertTriangle className="w-3 h-3" /> Delete
                      </button>
                      <button type="button" onClick={() => setConfirmIpNo(null)}
                        className="px-2 min-h-11 text-slate-500 hover:text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      {onView && (
                        <button type="button" onClick={() => onView(p.ipNo)}
                          className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-accent-fg hover:bg-accent-soft rounded-lg transition-colors" title="View details">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onEdit && (
                        <button type="button" onClick={() => onEdit(p)}
                          className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onDelete && (
                        <button type="button" onClick={() => setConfirmIpNo(p.ipNo)}
                          className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remove from list">
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

      {viewMode === 'cards' && (
      <div className="divide-y divide-slate-100 bg-white">
        {patients.map((p, idx) => (
          <div key={p.ipNo} className={`p-3 space-y-2 ${confirmIpNo === p.ipNo ? 'bg-red-50' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs text-slate-400 font-mono shrink-0">#{idx + 1}</span>
                  {onView ? (
                    <button type="button" onClick={() => onView(p.ipNo)} className="font-semibold text-accent-fg hover:text-accent-pressed hover:underline truncate text-left">
                      {p.name}
                    </button>
                  ) : (
                    <span className="font-semibold text-slate-800 truncate">{p.name}</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  <span className="font-mono">IP {p.ipNo}</span> · {p.age}/
                  <span className={p.gender === 'Female' ? 'text-pink-600' : 'text-blue-600'}>{p.gender[0]}</span>
                  {p.mobile && <> · <span className="font-mono">{p.mobile}</span></>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {confirmIpNo === p.ipNo ? (
                  <>
                    <button type="button" onClick={() => { setConfirmIpNo(null); onDelete?.(p); }}
                      className="flex items-center gap-1 px-2 py-1.5 min-h-11 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors">
                      <AlertTriangle className="w-3.5 h-3.5" /> Delete
                    </button>
                    <button type="button" onClick={() => setConfirmIpNo(null)}
                      className="px-2 py-1.5 min-h-11 text-slate-500 hover:text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    {onView && (
                      <button type="button" onClick={() => onView(p.ipNo)} aria-label={`View ${p.name}'s full details`}
                        className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-accent-fg hover:bg-accent-soft rounded-lg transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                    {onEdit && (
                      <button type="button" onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`}
                        className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" onClick={() => setConfirmIpNo(p.ipNo)} aria-label={`Remove ${p.name} from list`}
                        className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            <p className="text-sm text-slate-700 leading-snug">{p.diagnosis || '—'}</p>
            <InvestigationThumbs investigations={p.investigations} />
          </div>
        ))}
      </div>
      )}
    </div>
  );
};

const AdmissionList: React.FC<Props> = ({ onAddPatient, onEditPatient, onDeletePatient, onViewPatient }) => {
  const [selectedDate, setSelectedDate] = useState(todayStr);
  // Remembered across sessions — a chief walkthrough on a laptop wants cards
  // with imaging; a quick check on a phone might want the denser table.
  // Applies to every section uniformly (not toggled per OPD/Casualty/Other).
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    saveViewMode(mode);
  };
  const { patients } = usePatients();
  const { user } = useAuth();

  const isToday = selectedDate === todayStr();

  // Same logic App.tsx uses to compute Next/Previous-patient navigation when
  // viewing a patient's detail from this list — kept in one shared place
  // (utils/calculations.ts) so the two can't drift out of sync.
  const dayPatients = useMemo(
    () => getAdmissionDayCohort(patients, selectedDate, user?.unit),
    [patients, selectedDate, user?.unit],
  );

  const byIpAsc = (a: Patient, b: Patient) => parseInt(a.ipNo, 10) - parseInt(b.ipNo, 10);

  const opdPatients      = useMemo(() => dayPatients.filter(p => p.admissionSource === 'OPD').sort(byIpAsc),      [dayPatients]);
  const casualtyPatients = useMemo(() => dayPatients.filter(p => p.admissionSource === 'Casualty').sort(byIpAsc), [dayPatients]);
  const otherPatients    = useMemo(() => dayPatients.filter(p => !p.admissionSource).sort(byIpAsc),               [dayPatients]);

  return (
    <div className="space-y-4 pb-24">
      {/* Header bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
        {/* Row 1: title + view toggle */}
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-teal-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800 leading-tight">Admission List</h2>
            {user?.unit && (
              <p className="text-xs text-slate-500">{user.unit}</p>
            )}
          </div>
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => changeViewMode('cards')}
              aria-pressed={viewMode === 'cards'}
              aria-label="Card view with imaging"
              title="Card view with imaging"
              className={`min-w-11 min-h-11 flex items-center justify-center rounded-md transition-colors ${
                viewMode === 'cards' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => changeViewMode('table')}
              aria-pressed={viewMode === 'table'}
              aria-label="Compact table view"
              title="Compact table view"
              className={`min-w-11 min-h-11 flex items-center justify-center rounded-md transition-colors ${
                viewMode === 'table' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Table2 className="w-4 h-4" />
            </button>
          </div>
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
        viewMode={viewMode}
        onAdd={onAddPatient ? () => onAddPatient('OPD', selectedDate) : undefined}
        onEdit={onEditPatient}
        onDelete={onDeletePatient}
        onView={onViewPatient}
      />

      {/* Casualty section */}
      <AdmissionListTable
        source="Casualty"
        patients={casualtyPatients}
        date={selectedDate}
        unit={user?.unit}
        viewMode={viewMode}
        onAdd={onAddPatient ? () => onAddPatient('Casualty', selectedDate) : undefined}
        onEdit={onEditPatient}
        onDelete={onDeletePatient}
        onView={onViewPatient}
      />

      {/* Patients without a source */}
      {otherPatients.length > 0 && (
        <OtherAdmissionsTable
          patients={otherPatients}
          viewMode={viewMode}
          onView={onViewPatient}
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
                onClick={() => onAddPatient('OPD', selectedDate)}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-lg"
              >
                <Plus className="w-4 h-4" /> Add OPD
              </button>
              <button
                type="button"
                onClick={() => onAddPatient('Casualty', selectedDate)}
                className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg"
              >
                <Plus className="w-4 h-4" /> Add Casualty
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdmissionList;
