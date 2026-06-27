import React from 'react';
import { Wifi, WifiOff, Signal } from 'lucide-react';
import { useNetworkQuality } from '../hooks/useNetworkQuality';
import type { NetworkQuality } from '../hooks/useNetworkQuality';

const BANNER: Record<NetworkQuality, { bg: string; text: string; icon: typeof Wifi; label: string } | null> = {
  fast:    null,
  slow:    { bg: 'bg-amber-500', text: 'text-white', icon: Signal,  label: 'Poor connection — changes may be slow' },
  offline: { bg: 'bg-red-600',   text: 'text-white', icon: WifiOff, label: 'No network — working offline'          },
};

/** Shows a slim banner at the top of the page when network quality degrades. */
export function NetworkBanner() {
  const { quality } = useNetworkQuality();
  const cfg = BANNER[quality];
  if (!cfg) return null;

  const { bg, text, icon: Icon, label } = cfg;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium ${bg} ${text}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      {label}
    </div>
  );
}
