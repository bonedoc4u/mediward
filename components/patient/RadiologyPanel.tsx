/**
 * RadiologyPanel.tsx — pinned, always-visible imaging strip under the patient
 * header. For an ortho ward, imaging is the most-consulted data, so it sits
 * above everything and needs no tab click.
 *
 * Visual model: a negatoscope (X-ray viewing box) — films sit on one dark
 * neutral strip, newest first, captions etched beneath. Colour appears only
 * where it carries meaning: amber = report pending (no findings entered yet).
 * Modality and pre/post-op phase are plain text labels, not coloured chips.
 *
 * Read-first: tap a study for the full-screen pinch-zoom viewer. "Add / view
 * all" opens the full RadiologyComparator (existing camera/gallery/file upload)
 * — this panel intentionally adds no new storage-write path.
 */
import React, { useMemo, useState } from 'react';
import { FileImage, Plus, ChevronRight } from 'lucide-react';
import { Patient, Investigation } from '../../types';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { getModality } from '../radiology/modality';
import Lightbox from '../radiology/Lightbox';

interface Props {
  patient: Patient;
  onOpenFull: () => void;
}

type Phase = 'preop' | 'postop' | undefined;

/** Exported for tests. Explicit phase wins; otherwise inferred from surgery date. */
export const phaseOf = (inv: Investigation, dos?: string): Phase => {
  if (inv.phase) return inv.phase;
  if (!dos) return undefined;
  return inv.date >= dos ? 'postop' : 'preop';
};

/** Exported for tests. A study with no findings text is awaiting its report. */
export const isReportPending = (inv: Investigation): boolean => !inv.findings?.trim();

const RadiologyPanel: React.FC<Props> = ({ patient, onOpenFull }) => {
  const [lightboxInv, setLightboxInv] = useState<Investigation | null>(null);

  const studies = useMemo(
    () => [...patient.investigations].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [patient.investigations],
  );
  const pendingCount = useMemo(() => studies.filter(isReportPending).length, [studies]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <FileImage className="w-3.5 h-3.5" /> Radiology ({studies.length})
          {pendingCount > 0 && (
            <span className="normal-case tracking-normal font-semibold text-vital-warning-fg">
              · {pendingCount} report{pendingCount > 1 ? 's' : ''} pending
            </span>
          )}
        </p>
        <button
          onClick={onOpenFull}
          className="flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700 min-h-11 px-2 rounded-lg hover:bg-teal-50 transition-colors"
        >
          {studies.length > 0 ? 'View all' : 'Add'} <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {studies.length === 0 ? (
        <button
          onClick={onOpenFull}
          className="w-full flex flex-col items-center justify-center gap-1.5 min-h-24 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span className="text-xs font-semibold">Add imaging</span>
        </button>
      ) : (
        <div className="rounded-xl bg-slate-900 overflow-hidden">
          <div className="flex gap-3 overflow-x-auto snap-x px-3 py-3 scrollbar-hide">
            {studies.map(inv => (
              <StudyCard key={inv.id} inv={inv} phase={phaseOf(inv, patient.dos)} onClick={() => setLightboxInv(inv)} />
            ))}
          </div>
        </div>
      )}

      {lightboxInv && <Lightbox inv={lightboxInv} onClose={() => setLightboxInv(null)} />}
    </div>
  );
};

const StudyCard: React.FC<{ inv: Investigation; phase: Phase; onClick: () => void }> = ({ inv, phase, onClick }) => {
  const Icon = getModality(inv.type).Icon;
  const signedUrl = useSignedUrl(inv.imageUrl);
  const pending = isReportPending(inv);
  const fmtDate = new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });

  return (
    <button
      onClick={onClick}
      className="shrink-0 w-32 snap-start text-left rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 active:scale-[0.98] transition-transform"
      aria-label={`${inv.type}, ${fmtDate}${pending ? ', report pending' : ''}`}
    >
      {/* Film: dark well; radiographs read best on dark. Pulse while the signed URL resolves. */}
      <div className="h-24 rounded-lg overflow-hidden bg-slate-800 flex items-center justify-center">
        {inv.imageUrl
          ? (signedUrl
              ? <img src={signedUrl} alt={inv.type} className="w-full h-full object-cover" />
              : <div className="w-full h-full animate-pulse bg-slate-700/60" />)
          : <Icon className="w-6 h-6 text-slate-600" />}
      </div>

      {/* Caption etched under the film */}
      <div className="pt-1.5 space-y-0.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-300 truncate">
          {inv.type}
          {phase && <span className="font-semibold text-slate-500"> · {phase === 'postop' ? 'Post-op' : 'Pre-op'}</span>}
        </p>
        {pending ? (
          <p className="text-xs font-semibold text-vital-warning flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-vital-warning shrink-0" aria-hidden="true" />
            Report pending
          </p>
        ) : (
          <p className="text-xs text-slate-300 leading-tight truncate">{inv.findings}</p>
        )}
        <p className="text-xs text-slate-500 tabular-nums">{fmtDate}</p>
      </div>
    </button>
  );
};

export default RadiologyPanel;
