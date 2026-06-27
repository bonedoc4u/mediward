/**
 * hooks/useConnectionStatus.ts — Task 6
 *
 * Tracks the Supabase Realtime socket state with reconnect attempt count and
 * a live countdown to the next retry (for the OfflineBanner in RoundMode).
 *
 * Derives from PatientContext's `realtimeStatus` which is already updated by
 * the exponential-backoff reconnect loop in PatientContext.tsx.
 */

import { useState, useEffect, useRef } from 'react';
import { usePatients } from '../contexts/AppContext';

export type SocketStatus = 'connected' | 'reconnecting' | 'offline';

export interface ConnectionStatus {
  status:      SocketStatus;
  attempt:     number;      // reconnect attempt count (resets on success)
  nextRetryIn: number;      // seconds until next retry (counts down)
  isOnline:    boolean;     // navigator.onLine / window online event
}

// Mirrors PatientContext's backoff: 2s → 4 → 8 → 16 → 30 (capped)
const BACKOFF_SCHEDULE = [2, 4, 8, 16, 30];

export function useConnectionStatus(): ConnectionStatus {
  const { realtimeStatus } = usePatients();

  const [isOnline,    setIsOnline]    = useState(navigator.onLine);
  const [attempt,     setAttempt]     = useState(0);
  const [nextRetryIn, setNextRetryIn] = useState(0);

  const prevStatusRef  = useRef(realtimeStatus);
  const countdownRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track network connectivity separately from Supabase socket state —
  // navigator.onLine can be true on captive portals where Supabase is blocked.
  useEffect(() => {
    const up   = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online',  up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online',  up);
      window.removeEventListener('offline', down);
    };
  }, []);

  // Detect transitions: connected→reconnecting/disconnected increments attempt,
  // reconnecting/disconnected→connected resets everything.
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = realtimeStatus;

    const isLost = realtimeStatus === 'reconnecting' || realtimeStatus === 'disconnected';
    if (prev === 'connected' && isLost) {
      setAttempt(n => n + 1);
    } else if (realtimeStatus === 'connected') {
      setAttempt(0);
      setNextRetryIn(0);
      if (countdownRef.current) clearInterval(countdownRef.current);
    }
  }, [realtimeStatus]);

  // Countdown timer — starts (or restarts) each time attempt increments.
  useEffect(() => {
    if (realtimeStatus === 'connected') return;

    const delaySec = BACKOFF_SCHEDULE[Math.min(attempt, BACKOFF_SCHEDULE.length - 1)];
    setNextRetryIn(delaySec);

    if (countdownRef.current) clearInterval(countdownRef.current);

    countdownRef.current = setInterval(() => {
      setNextRetryIn(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1_000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [attempt, realtimeStatus]);

  const status: SocketStatus =
    !isOnline                      ? 'offline'      :
    realtimeStatus === 'connected' ? 'connected'    : 'reconnecting';

  return { status, attempt, nextRetryIn, isOnline };
}
