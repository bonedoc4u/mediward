/**
 * connectivity.ts
 *
 * Replaces `navigator.onLine` which is unreliable on hospital networks:
 *   - Returns true on captive portals (HMIS login walls)
 *   - Returns true on metered/throttled connections that block Supabase
 *   - Never reflects actual API reachability
 *
 * This module probes the Supabase REST endpoint directly and fires the
 * standard 'online'/'offline' window events so existing listeners (including
 * PatientContext's reconnect handler) work without any other changes.
 */

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const PROBE_TIMEOUT = 3_000;   // 3 s — fast enough for ward Wi-Fi
const POLL_INTERVAL = 30_000;  // re-probe every 30 s while app is open

let _isOnline = navigator.onLine;

/** Returns the last known connectivity state (synchronous, no network call). */
export function isOnline(): boolean {
  return _isOnline;
}

/** Performs a real network probe against Supabase. Updates internal state
 *  and fires window 'online'/'offline' events if the state changed. */
export async function probeConnectivity(): Promise<boolean> {
  // Quick short-circuit: if the browser reports offline, trust it
  if (!navigator.onLine) {
    updateState(false);
    return false;
  }

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT);
    await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'HEAD',
      signal: ctrl.signal,
      headers: { apikey: SUPABASE_KEY },
      cache: 'no-store',
    });
    clearTimeout(timeout);
    updateState(true);
    return true;
  } catch {
    updateState(false);
    return false;
  }
}

function updateState(next: boolean): void {
  if (next === _isOnline) return;
  _isOnline = next;
  // Fire standard events so all existing window.addEventListener('online'/'offline')
  // listeners are notified without any other code changes
  window.dispatchEvent(new Event(next ? 'online' : 'offline'));
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
// Run once on import to get the initial state, then poll periodically.
// The interval is cleared if the module is ever torn down (e.g. in tests).
probeConnectivity();

let _pollInterval: ReturnType<typeof setInterval> | null = null;

export function startConnectivityPolling(): void {
  if (_pollInterval) return;
  _pollInterval = setInterval(probeConnectivity, POLL_INTERVAL);
}

export function stopConnectivityPolling(): void {
  if (_pollInterval) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
}

// Also probe immediately on the browser's own online event (covers waking
// from airplane mode) but re-verify rather than trusting it blindly
window.addEventListener('online',  () => probeConnectivity());
window.addEventListener('offline', () => updateState(false));
