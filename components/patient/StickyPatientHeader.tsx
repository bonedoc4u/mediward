/**
 * StickyPatientHeader.tsx — a slim identity bar that pins to the top of the
 * detail view / sheet once the tall hero header scrolls away, so name, bed, IP,
 * diagnosis, post-op day and status stay visible during a long scroll.
 *
 * It's always `sticky top-0` but hidden (translated up) until `visible`, so it
 * doesn't duplicate the hero on first paint — the parent flips `visible` via an
 * IntersectionObserver on a sentinel below the hero.
 */
import React from 'react';
import { Patient } from '../../types';

interface Props {
  patient: Patient;
  statusLabel: string;
  statusColor: { bg: string; text: string; dot: string };
  visible: boolean;
}

const StickyPatientHeader: React.FC<Props> = ({ patient, statusLabel, statusColor, visible }) => (
  <div
    className={`sticky top-0 z-30 -mx-4 sm:-mx-8 px-4 sm:px-8 bg-surface-card/95 backdrop-blur border-b border-line
                flex items-center gap-3 transition-all duration-200 ${
      visible ? 'py-2 opacity-100 translate-y-0' : 'py-0 h-0 opacity-0 -translate-y-full pointer-events-none overflow-hidden'
    }`}
  >
    <div className="w-9 h-9 shrink-0 rounded-lg bg-ink text-white flex items-center justify-center text-sm font-bold font-mono">
      {patient.bed}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <p className="text-sm font-bold text-ink truncate">{patient.name}</p>
        {patient.pod !== undefined && (
          <span className="shrink-0 text-[10px] font-bold text-vital-normal-fg bg-vital-normal-surface border border-vital-normal-border px-1.5 py-0.5 rounded-full">
            POD {patient.pod}
          </span>
        )}
      </div>
      <p className="text-[11px] text-ink-muted truncate">
        {patient.age}y · {patient.gender} · IP {patient.ipNo} · {patient.diagnosis}
      </p>
    </div>
    <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${statusColor.bg} ${statusColor.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${statusColor.dot}`} />
      {statusLabel}
    </span>
  </div>
);

export default StickyPatientHeader;
