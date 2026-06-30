import { useState, useEffect, useRef } from 'react';
import { probeConnectivity } from '../utils/connectivity';

export type NetworkQuality = 'fast' | 'slow' | 'offline';

interface NetworkState {
  quality: NetworkQuality;
  rttMs: number | null;
}

// RTT threshold: 1500ms gives room for Supabase (US servers) on Indian hospital
// networks where healthy 4G connections often measure 900–1200ms.
const SLOW_RTT_THRESHOLD  = 1500;
const PROBE_INTERVAL      = 30_000; // re-probe every 30 s
// Require this many consecutive slow readings before showing the banner.
// 1 transient blip (DNS, background download) won't trigger the warning.
const SLOW_COUNT_REQUIRED = 2;

async function measureQuality(): Promise<NetworkState> {
  const online = await probeConnectivity();
  if (!online) return { quality: 'offline', rttMs: null };

  // Always do a real RTT probe — the Network Information API's effectiveType
  // is notoriously unreliable on Android (reports '3g' on 5G, '2g' on LTE).
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  try {
    const start = performance.now();
    await fetch(`${url}/rest/v1/`, {
      method: 'HEAD',
      headers: { apikey: key },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    const rttMs = Math.round(performance.now() - start);
    return {
      quality: rttMs > SLOW_RTT_THRESHOLD ? 'slow' : 'fast',
      rttMs,
    };
  } catch {
    return { quality: 'offline', rttMs: null };
  }
}

export function useNetworkQuality(): NetworkState {
  const [state, setState] = useState<NetworkState>({ quality: 'fast', rttMs: null });
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slowCountRef = useRef(0);

  const run = async () => {
    const next = await measureQuality();

    setState(prev => {
      if (next.quality === 'offline') {
        slowCountRef.current = 0;
        return next;
      }
      if (next.quality === 'slow') {
        slowCountRef.current += 1;
        // Only degrade to 'slow' after SLOW_COUNT_REQUIRED consecutive readings
        if (slowCountRef.current >= SLOW_COUNT_REQUIRED) {
          return next;
        }
        // Not enough consecutive slow readings yet — keep current quality
        return prev;
      }
      // fast reading: clear counter and upgrade immediately
      slowCountRef.current = 0;
      return next;
    });

    timerRef.current = setTimeout(() => void run(), PROBE_INTERVAL);
  };

  useEffect(() => {
    void run();

    const handleChange = () => {
      slowCountRef.current = 0; // reset hysteresis on network change event
      void run();
    };
    window.addEventListener('online',  handleChange);
    window.addEventListener('offline', handleChange);

    const conn = (navigator as Navigator & { connection?: EventTarget }).connection;
    conn?.addEventListener('change', handleChange);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener('online',  handleChange);
      window.removeEventListener('offline', handleChange);
      conn?.removeEventListener('change', handleChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
