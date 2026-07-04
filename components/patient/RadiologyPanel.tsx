/**
 * RadiologyPanel.tsx — pinned, always-visible imaging strip under the patient
 * header. For an ortho ward, imaging is the most-consulted data, so it sits
 * above everything and needs no tab click. Studies are newest-first with a
 * modality badge, date and a pre/post-op tag inferred from the surgery date.
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

const phaseOf = (inv: Investigation, dos?: string): Phase => {
  if (inv.phase) return inv.phase;
  if (!dos) return undefined;
  return inv.date >= dos ? 'postop' : 'preop';
};

const RadiologyPanel: React.FC<Props> = ({ patient, onOpenFull }) => {
  const [lightboxInv, setLightboxInv] = useState<Investigation | null>(null);

  const studies = useMemo(
    () => [...patient.investigations].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [patient.investigations],
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <FileImage className="w-3.5 h-3.5 text-teal-500" /> Radiology ({studies.length})
        </p>
        <button
          onClick={onOpenFull}
          className="flex items-center gap-1 text-xs font-semibold text-teal-600 hover:text-teal-700 min-h-[36px] px-2 rounded-lg hover:bg-teal-50 transition-colors"
        >
          {studies.length > 0 ? 'View all' : 'Add'} <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {studies.length === 0 ? (
        <button
          onClick={onOpenFull}
          className="w-full flex flex-col items-center justify-center gap-1.5 py-6 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-teal-300 hover:text-teal-600 hover:bg-teal-50/40 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span className="text-xs font-semibold">Add imaging</span>
        </button>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {studies.map(inv => (
            <StudyCard key={inv.id} inv={inv} phase={phaseOf(inv, patient.dos)} onClick={() => setLightboxInv(inv)} />
          ))}
        </div>
      )}

      {lightboxInv && <Lightbox inv={lightboxInv} onClose={() => setLightboxInv(null)} />}
    </div>
  );
};

const PHASE_CHIP: Record<'preop' | 'postop', string> = {
  preop: 'bg-blue-100 text-blue-700',
  postop: 'bg-teal-100 text-teal-700',
};

const StudyCard: React.FC<{ inv: Investigation; phase: Phase; onClick: () => void }> = ({ inv, phase, onClick }) => {
  const cfg = getModality(inv.type);
  const Icon = cfg.Icon;
  const signedUrl = useSignedUrl(inv.imageUrl);
  const fmtDate = new Date(inv.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });

  return (
    <button
      onClick={onClick}
      className="shrink-0 w-[112px] rounded-xl border border-slate-200 overflow-hidden text-left hover:border-teal-300 hover:-translate-y-0.5 hover:shadow-sm transition-all active:scale-[0.98]"
    >
      <div className={`h-20 flex items-center justify-center ${cfg.bg}`}>
        {inv.imageUrl && signedUrl
          ? <img src={signedUrl} alt={inv.type} className="w-full h-full object-cover" />
          : <Icon className="w-6 h-6 text-white/25" />}
      </div>
      <div className="p-1.5 bg-white">
        <div className="flex items-center gap-1 mb-0.5">
          <span className={`text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.badge}`}>{inv.type}</span>
          {phase && <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${PHASE_CHIP[phase]}`}>{phase === 'postop' ? 'Post' : 'Pre'}</span>}
        </div>
        {inv.findings && <p className="text-[10px] font-medium text-slate-600 leading-tight truncate">{inv.findings}</p>}
        <p className="text-[10px] text-slate-400">{fmtDate}</p>
      </div>
    </button>
  );
};

export default RadiologyPanel;
