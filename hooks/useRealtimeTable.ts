/**
 * hooks/useRealtimeTable.ts — Task 1
 *
 * Generic Supabase Realtime subscription with automatic exponential-backoff
 * reconnection. Wraps the pattern used manually in PatientContext so every
 * future table subscription gets reconnect and cleanup for free.
 *
 * Usage:
 *   useRealtimeTable<PatientRow>({
 *     table: 'patients',
 *     filter: `hospital_id=eq.${hospitalId}`,
 *     enabled: !!hospitalId,          // ← never open an unscoped channel
 *     onInsert: row => ...,
 *     onUpdate: row => ...,
 *     onDelete: row => ...,
 *   });
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type PgEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export interface UseRealtimeTableOptions<T extends Record<string, unknown>> {
  table: string;
  /** e.g. 'hospital_id=eq.abc123' — always provide this for tenant safety */
  filter?: string;
  event?: PgEvent;
  onInsert?: (row: T) => void;
  onUpdate?: (row: T) => void;
  onDelete?: (row: Partial<T>) => void;
  /** Set to false while required values (hospitalId, userId) are not yet known.
   *  Prevents opening an unscoped channel that leaks cross-tenant events. */
  enabled?: boolean;
}

const MAX_BACKOFF_MS = 30_000;

export function useRealtimeTable<T extends Record<string, unknown>>(
  opts: UseRealtimeTableOptions<T>,
): void {
  // Store opts in a ref so reconnect callbacks always use current values
  // without needing them in the effect dep array.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const channelRef  = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const retryMsRef  = useRef(2_000);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destroyedRef = useRef(false);

  useEffect(() => {
    destroyedRef.current = false;
    retryMsRef.current   = 2_000;

    function connect(): void {
      const { table, filter, event = '*', onInsert, onUpdate, onDelete, enabled = true } = optsRef.current;

      if (!enabled || destroyedRef.current) return;

      // Each reconnect gets a fresh channel name — avoids Supabase's 30s
      // "duplicate channel" debounce which would silently drop the subscription.
      const ch = supabase
        .channel(`rt-${table}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event, schema: 'public', table, ...(filter ? { filter } : {}) },
          (payload: RealtimePostgresChangesPayload<T>) => {
            if (payload.eventType === 'INSERT') optsRef.current.onInsert?.(payload.new as T);
            if (payload.eventType === 'UPDATE') optsRef.current.onUpdate?.(payload.new as T);
            if (payload.eventType === 'DELETE') optsRef.current.onDelete?.(payload.old as Partial<T>);
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            retryMsRef.current = 2_000; // reset backoff on success
          }
          if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !destroyedRef.current) {
            supabase.removeChannel(ch);
            channelRef.current = null;
            timerRef.current = setTimeout(() => {
              if (!destroyedRef.current) connect();
            }, retryMsRef.current);
            retryMsRef.current = Math.min(retryMsRef.current * 2, MAX_BACKOFF_MS);
          }
        });

      channelRef.current = ch;
    }

    connect();

    return () => {
      destroyedRef.current = true;
      if (timerRef.current)    clearTimeout(timerRef.current);
      if (channelRef.current)  supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  // Re-subscribe when the table, filter, event, or enabled flag changes.
  // Callback refs (onInsert etc.) are excluded — they update via optsRef.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.table, opts.filter, opts.event, opts.enabled]);
}
