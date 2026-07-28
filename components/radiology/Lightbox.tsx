/**
 * Lightbox.tsx — full-screen study viewer with pinch-zoom (works in the
 * Capacitor webview via touch-action: pinch-zoom) and Next/Previous
 * navigation through a patient's other investigations. Shared by
 * RadiologyComparator, the patient-detail Radiology panel, and Admission List.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { X, ImageIcon, Loader2, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { Investigation } from '../../types';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { isPdfPath } from '../../services/storageService';
import { getModality } from './modality';
import { registerLightboxClose, unregisterLightboxClose } from '../../hooks/useLightboxBackHandler';

interface Props {
  investigations: Investigation[];
  initialIndex: number;
  onClose: () => void;
}

const Lightbox: React.FC<Props> = ({ investigations, initialIndex, onClose }) => {
  // Track the open study by id, not by raw array position: `investigations`
  // can be a live reference (patient context re-fetch/realtime) whose order
  // or length changes while this is open, and a stale index would silently
  // point at a different study — or past the end of a shrunk array.
  const [currentId, setCurrentId] = useState(() => investigations[initialIndex]?.id);
  const index = investigations.findIndex(i => i.id === currentId);
  const inv = index >= 0 ? investigations[index] : undefined;
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < investigations.length - 1;
  const goPrev = useCallback(() => {
    setCurrentId(id => {
      const i = investigations.findIndex(inv => inv.id === id);
      return i > 0 ? investigations[i - 1].id : id;
    });
  }, [investigations]);
  const goNext = useCallback(() => {
    setCurrentId(id => {
      const i = investigations.findIndex(inv => inv.id === id);
      return i >= 0 && i < investigations.length - 1 ? investigations[i + 1].id : id;
    });
  }, [investigations]);

  // The current study disappeared out from under us (e.g. deleted on another
  // device) — close rather than render on missing data.
  useEffect(() => {
    if (!inv) onClose();
  }, [inv, onClose]);

  const cfg = inv ? getModality(inv.type) : null;
  const signedUrl = useSignedUrl(inv?.imageUrl);
  const fmtDate = inv
    ? new Date(inv.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, goPrev, goNext]);

  // Android hardware back button: close this viewer instead of falling
  // through to whatever view-level navigation would otherwise run.
  useEffect(() => {
    registerLightboxClose(onClose);
    return () => unregisterLightboxClose(onClose);
  }, [onClose]);

  if (!inv || !cfg) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col" onClick={onClose}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/70 shrink-0" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded shrink-0 ${cfg.badge}`}>{inv.type}</span>
          <span className="text-white/50 text-xs shrink-0">{fmtDate}</span>
          {inv.findings && <span className="text-white/70 text-xs truncate">{inv.findings}</span>}
          {investigations.length > 1 && (
            <span className="text-white/40 text-xs shrink-0 tabular-nums">{index + 1}/{investigations.length}</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors shrink-0"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Image / PDF */}
      <div className="relative flex-1 flex items-center justify-center p-4 overflow-hidden" onClick={onClose}>
        {hasPrev && (
          <button
            onClick={e => { e.stopPropagation(); goPrev(); }}
            aria-label="Previous investigation"
            className="absolute left-1 sm:left-3 top-1/2 -translate-y-1/2 z-10 min-w-11 min-h-11 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={e => { e.stopPropagation(); goNext(); }}
            aria-label="Next investigation"
            className="absolute right-1 sm:right-3 top-1/2 -translate-y-1/2 z-10 min-w-11 min-h-11 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
        {inv.imageUrl ? (
          isPdfPath(inv.imageUrl) ? (
            // Show the PDF's identity immediately — unlike an image, there's
            // nothing to wait to render, so don't show the image-loading spinner
            // just because the signed URL (needed only for the href) isn't back yet.
            <div className="flex flex-col items-center gap-3 text-white/80">
              <ExternalLink className="w-12 h-12" />
              {signedUrl ? (
                <a
                  href={signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-sm font-semibold hover:text-white transition-colors"
                >
                  Open PDF in new tab
                </a>
              ) : (
                <span className="text-sm font-semibold text-white/50">Preparing link…</span>
              )}
            </div>
          ) : (
            signedUrl ? (
              <img
                src={signedUrl}
                alt={inv.type}
                className="max-w-full max-h-full object-contain select-none"
                style={{ touchAction: 'pinch-zoom' }}
                onClick={e => e.stopPropagation()}
                draggable={false}
              />
            ) : (
              <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
            )
          )
        ) : (
          <div className="text-white/30 text-center">
            <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No image available</p>
          </div>
        )}
      </div>

      <p className="text-center text-white/30 text-xs pb-3 shrink-0">
        {investigations.length > 1 ? 'Tap anywhere to close · use the arrows to browse' : 'Tap anywhere to close'}
      </p>
    </div>
  );
};

export default Lightbox;
