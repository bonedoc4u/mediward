/**
 * Lightbox.tsx — full-screen study viewer with pinch-zoom (works in the
 * Capacitor webview via touch-action: pinch-zoom). Shared by RadiologyComparator
 * and the patient-detail Radiology panel.
 */
import React from 'react';
import { X, ImageIcon, Loader2, ExternalLink } from 'lucide-react';
import { Investigation } from '../../types';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { isPdfPath } from '../../services/storageService';
import { getModality } from './modality';

const Lightbox: React.FC<{ inv: Investigation; onClose: () => void }> = ({ inv, onClose }) => {
  const cfg = getModality(inv.type);
  const signedUrl = useSignedUrl(inv.imageUrl);
  const fmtDate = new Date(inv.date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col" onClick={onClose}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/70 shrink-0" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded ${cfg.badge}`}>{inv.type}</span>
          <span className="text-white/50 text-xs">{fmtDate}</span>
          {inv.findings && <span className="text-white/70 text-xs truncate max-w-[180px]">{inv.findings}</span>}
        </div>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Image / PDF */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden" onClick={onClose}>
        {inv.imageUrl ? (
          signedUrl ? (
            isPdfPath(inv.imageUrl) ? (
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="flex flex-col items-center gap-3 text-white/80 hover:text-white transition-colors"
              >
                <ExternalLink className="w-12 h-12" />
                <span className="text-sm font-semibold">Open PDF in new tab</span>
              </a>
            ) : (
              <img
                src={signedUrl}
                alt={inv.type}
                className="max-w-full max-h-full object-contain select-none"
                style={{ touchAction: 'pinch-zoom' }}
                onClick={e => e.stopPropagation()}
                draggable={false}
              />
            )
          ) : (
            <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
          )
        ) : (
          <div className="text-white/30 text-center">
            <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No image available</p>
          </div>
        )}
      </div>

      <p className="text-center text-white/30 text-xs pb-3 shrink-0">Tap anywhere to close</p>
    </div>
  );
};

export default Lightbox;
