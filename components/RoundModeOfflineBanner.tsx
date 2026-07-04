/**
 * components/RoundModeOfflineBanner.tsx — Task 6
 *
 * A connection-status indicator specific to RoundMode. Shows the Supabase
 * Realtime socket state (not just navigator.onLine) so doctors know whether
 * their round notes are syncing live. Includes attempt counter, countdown to
 * next retry, and a manual Retry button for when auto-reconnect feels slow.
 *
 * Usage: drop inside RoundMode below the header.
 *   <RoundModeOfflineBanner onRetry={reconnect} />
 */

import React, { useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle, Signal } from 'lucide-react';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
import type { NetworkQuality } from '../hooks/useNetworkQuality';

interface Props {
  onRetry?: () => void;
  networkQuality?: NetworkQuality;
}

export const RoundModeOfflineBanner: React.FC<Props> = ({ onRetry, networkQuality = 'fast' }) => {
  const { status, attempt, nextRetryIn } = useConnectionStatus();

  const handleRetry = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  // ─── Slow network warning (show even when WS is connected) ───
  if (status === 'connected' && networkQuality === 'slow') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mx-4 mt-2 mb-1 flex items-center gap-2 rounded-xl px-4 py-2.5
                   bg-amber-50 border border-amber-200 text-amber-800 text-sm"
      >
        <Signal size={16} className="shrink-0 text-amber-500" />
        <span className="flex-1">
          <span className="font-medium">Slow connection</span>
          <span className="ml-1 text-amber-700">— notes save locally and sync when signal improves.</span>
        </span>
      </div>
    );
  }

  // ─── Fully connected on good network — show nothing ───
  if (status === 'connected') return null;

  // ─── No network ───
  if (status === 'offline') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="mx-4 mt-2 mb-1 flex items-center gap-2 rounded-xl px-4 py-2.5
                   bg-amber-50 border border-amber-200 text-amber-800 text-sm"
      >
        <WifiOff size={16} className="shrink-0 text-amber-500" />
        <span className="flex-1 font-medium">
          No network — round notes will sync when you&apos;re back online.
        </span>
      </div>
    );
  }

  // ─── Online but Supabase Realtime socket disconnected ───
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-4 mt-2 mb-1 flex items-center gap-2 rounded-xl px-4 py-2.5
                 bg-slate-100 border border-slate-200 text-slate-700 text-sm"
    >
      {attempt === 0 ? (
        <Wifi size={16} className="shrink-0 text-slate-400 animate-pulse" />
      ) : (
        <AlertCircle size={16} className="shrink-0 text-orange-400" />
      )}

      <span className="flex-1">
        {attempt === 0 ? (
          <span className="font-medium text-slate-600">Connecting to live updates…</span>
        ) : (
          <>
            <span className="font-medium text-slate-700">
              Live updates disconnected
            </span>
            <span className="text-slate-500 ml-1">
              (attempt {attempt}
              {nextRetryIn > 0 ? ` · retrying in ${nextRetryIn}s` : ' · retrying…'})
            </span>
          </>
        )}
      </span>

      {onRetry && attempt > 0 && (
        <button
          onClick={handleRetry}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg
                     bg-white border border-slate-300 text-slate-600 text-xs font-medium
                     hover:bg-slate-50 hover:border-slate-400 transition-colors"
          aria-label="Retry connection"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      )}
    </div>
  );
};
