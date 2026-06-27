import { useState, useEffect, useRef, useCallback } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: PostgrestError | null;
  isStale: boolean;
}

interface Options<T> {
  /** localStorage cache key. When set, stale-while-revalidate is active. */
  cacheKey?: string;
  /** Initial data to show immediately (e.g. from parent context). */
  initialData?: T | null;
}

/**
 * Generic Supabase query hook.
 * - Shows stale cache immediately, fetches in background, updates silently.
 * - On error shows stale data + error simultaneously so the UI stays usable.
 */
export function useSupabaseQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: PostgrestError | null }>,
  deps: unknown[],
  options: Options<T> = {},
): QueryState<T> & { refetch: () => void } {
  const { cacheKey, initialData = null } = options;

  const getCache = (): T | null => {
    if (!cacheKey) return null;
    try {
      const raw = localStorage.getItem(`sq_cache::${cacheKey}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  };

  const setCache = (data: T) => {
    if (!cacheKey) return;
    try { localStorage.setItem(`sq_cache::${cacheKey}`, JSON.stringify(data)); } catch { /* quota */ }
  };

  const cached = getCache();
  const [state, setState] = useState<QueryState<T>>({
    data: initialData ?? cached,
    loading: !(initialData ?? cached),
    error: null,
    isStale: !!(initialData ?? cached),
  });

  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const run = useCallback(async () => {
    setState(prev => ({ ...prev, loading: !prev.data, error: null }));
    const { data, error } = await queryFn();
    if (!mountedRef.current) return;
    if (error) {
      setState(prev => ({ ...prev, loading: false, error, isStale: !!prev.data }));
    } else {
      if (data && cacheKey) setCache(data);
      setState({ data, loading: false, error: null, isStale: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps]);

  useEffect(() => { void run(); }, [run]);

  return { ...state, refetch: run };
}
