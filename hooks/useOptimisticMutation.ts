/**
 * hooks/useOptimisticMutation.ts — Task 4
 *
 * Generic optimistic-UI hook using React 19's useTransition so the network
 * call runs at a lower priority and never blocks user input.
 *
 * Pattern:
 *   1. onMutate() fires immediately — applies the local state change and
 *      returns a rollback function (close over the previous state snapshot).
 *   2. mutationFn() runs in the background inside startTransition.
 *   3. On failure: rollback() is called + an error toast is shown.
 *   4. isPending stays true while the network call is in flight (React 19
 *      tracks async transitions automatically).
 *
 * Usage:
 *   const { mutate, isPending } = useOptimisticMutation({
 *     mutationFn: (p: Patient) => upsertPatient(p),
 *     onMutate:   (p) => {
 *       const prev = patients;
 *       setPatients(ps => ps.map(x => x.ipNo === p.ipNo ? p : x));
 *       return () => setPatients(prev);  // rollback
 *     },
 *   });
 *   mutate(updatedPatient);
 */

import { useCallback, useTransition } from 'react';
import { toast } from '../utils/toast';

interface Options<TData> {
  mutationFn: (data: TData) => Promise<void>;
  /** Apply optimistic update to local state; return a function that reverts it. */
  onMutate: (data: TData) => () => void;
  /** Called after rollback — use for custom error UI beyond the default toast. */
  onError?: (err: Error) => void;
  /** Override the default "Save failed" toast message. */
  errorMessage?: string;
}

export function useOptimisticMutation<TData>({
  mutationFn,
  onMutate,
  onError,
  errorMessage,
}: Options<TData>): {
  mutate: (data: TData) => void;
  isPending: boolean;
} {
  // useTransition: the async mutation runs at "transition" priority so React
  // can still respond to urgent events (typing, scrolling) while it's in flight.
  const [isPending, startTransition] = useTransition();

  const mutate = useCallback(
    (data: TData) => {
      // Apply optimistic update synchronously BEFORE the transition so the
      // user sees the change immediately (not deferred to the transition flush).
      const rollback = onMutate(data);

      startTransition(async () => {
        try {
          await mutationFn(data);
        } catch (err) {
          // Revert the optimistic update and surface the error.
          rollback();
          const message = errorMessage ?? (err instanceof Error ? err.message : 'Save failed');
          toast.error(message);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },
    // startTransition is stable; mutationFn/onMutate/onError are caller deps.
     
    [mutationFn, onMutate, onError, errorMessage],
  );

  return { mutate, isPending };
}
