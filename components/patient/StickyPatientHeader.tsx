/**
 * StickyPatientHeader.tsx — a slim identity bar that pins to the top of the
 * detail view / sheet once the tall hero header scrolls away, so name, bed, IP,
 * diagnosis, post-op day and status stay visible during a long scroll.
 *
 * It's always `sticky top-0` but hidden (translated up) until `visible`, so it
 * doesn't duplicate the hero on first paint — the parent flips `visible` via an
 * IntersectionObserver on a sentinel below the hero.
 */
import React, { useLayoutEffect, useState } from 'react';
import { Patient } from '../../types';

interface Props {
  patient: Patient;
  statusLabel: string;
  statusColor: { bg: string; text: string; dot: string };
  visible: boolean;
  /**
   * True on the full-page patient view. There, on a phone, the PAGE scrolls
   * (not a box around this component), so `position: sticky` cannot hold and
   * the bar used to scroll away with the content. In that case the bar is
   * fixed directly under the app's top bar instead. Inside a sheet (which has
   * its own scroll box) leave this false: sticky works there.
   */
  pinToViewport?: boolean;
}

const StickyPatientHeader: React.FC<Props> = ({ patient, statusLabel, statusColor, visible, pinToViewport }) => {
  // Where the app's phone top bar ends. 0 from md up, where that bar is hidden.
  const [topBarBottom, setTopBarBottom] = useState(0);
  useLayoutEffect(() => {
    if (!pinToViewport || !visible) return;
    const bar = document.querySelector('header');
    setTopBarBottom(bar ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0);
  }, [pinToViewport, visible]);

  return (
  <div
    data-testid="patient-identity-bar"
    style={pinToViewport ? ({ '--top-bar-bottom': `${topBarBottom}px` } as React.CSSProperties) : undefined}
    className={`${pinToViewport ? 'patient-identity-bar--page' : ''} sticky top-0 z-30 -mx-4 sm:-mx-8 px-4 sm:px-8 bg-surface-card/95 backdrop-blur border-b border-line
                flex items-center gap-3 transition-all duration-200 ${
      visible ? 'py-2 opacity-100 translate-y-0' : 'py-0 h-0 opacity-0 -translate-y-full pointer-events-none overflow-hidden'
    }`}
  >
    <div className="w-9 h-9 shrink-0 rounded-lg bg-accent text-white flex items-center justify-center text-sm font-bold font-mono">
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
      {/* Allergies stay with the identity for the whole scroll. */}
      {(patient.drugAllergies ?? []).some(a => a.trim()) && (
        <p className="text-xs font-bold text-vital-critical-fg truncate">
          Allergy: {(patient.drugAllergies ?? []).map(a => a.trim()).filter(Boolean).join(', ')}
        </p>
      )}
    </div>
    <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${statusColor.bg} ${statusColor.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${statusColor.dot}`} />
      {statusLabel}
    </span>
  </div>
  );
};

export default StickyPatientHeader;
