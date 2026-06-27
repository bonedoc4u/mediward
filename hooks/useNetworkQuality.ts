import { useState, useEffect, useRef } from 'react';
import { probeConnectivity } from '../utils/connectivity';

export type NetworkQuality = 'fast' | 'slow' | 'offline';

interface NetworkState {
  quality: NetworkQuality;
  rttMs: number | null;
}

const SLOW_RTT_THRESHOLD = 800;   // ms — matches 3G edge conditions on Indian hospital networks
const PROBE_INTERVAL    = 20_000; // re-probe every 20 s

/** Read the Network Information API effective type if available */
function getEffectiveType(): string | null {
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  return conn?.effectiveType ?? null;
}

function qualityFromEffectiveType(et: string): NetworkQuality {
  if (et === '4g') return 'fast';
  if (et === '3g') return 'slow';
  return 'slow'; // 2g, slow-2g
}

async function measureQuality(): Promise<NetworkState> {
  const online = await probeConnectivity();
  if (!online) return { quality: 'offline', rttMs: null };

  const et = getEffectiveType();
  if (et) {
    return { quality: qualityFromEffectiveType(et), rttMs: null };
  }

  // Fall back to RTT measurement via a HEAD request to Supabase
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
    const rttMs = performance.now() - start;
    return {
      quality: rttMs > SLOW_RTT_THRESHOLD ? 'slow' : 'fast',
      rttMs: Math.round(rttMs),
    };
  } catch {
    return { quality: 'offline', rttMs: null };
  }
}

export function useNetworkQuality(): NetworkState {
  const [state, setState] = useState<NetworkState>({ quality: 'fast', rttMs: null });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = async () => {
    const next = await measureQuality();
    setState(next);
    timerRef.current = setTimeout(() => void run(), PROBE_INTERVAL);
  };

  useEffect(() => {
    void run();

    const handleChange = () => void run();
    window.addEventListener('online', handleChange);
    window.addEventListener('offline', handleChange);

    // Network Information API change event
    const conn = (navigator as Navigator & { connection?: EventTarget }).connection;
    conn?.addEventListener('change', handleChange);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener('online', handleChange);
      window.removeEventListener('offline', handleChange);
      conn?.removeEventListener('change', handleChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
