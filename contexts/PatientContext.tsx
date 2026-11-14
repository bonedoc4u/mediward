/**
 * PatientContext.tsx
 * Owns all patient state: loading, CRUD, realtime sync, and offline queue.
 * Isolated so patient-list updates don't re-render auth or nav consumers.
 *
 * Cache-first loading strategy:
 *  1. Read localStorage cache synchronously → patients visible immediately
 *  2. Fetch from Supabase in background → overwrite cache on success
 *  3. Supabase failure → keep showing cached data with isStale=true banner
 *     instead of a blank screen
 *
 * Realtime: exponential-backoff reconnection on CHANNEL_ERROR / TIMED_OUT.
 */

import React, {
  createContext, useContext, useState, useEffect,
  useCallback, useMemo, useRef,
} from 'react';

// Simple debounce utility — avoids serialising the full patient array on every realtime event
function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}
import { Patient, LabResult, Investigation, DailyRound, VitalSigns } from '../types';
import { enrichPatientData, buildSurgeryUpdate } from '../utils/calculations';
import { resolveEffectiveUnit } from '../utils/effectiveUnit';
import { applyPatientInsert, applyPatientUpdate, removePatientsFromList } from '../utils/patientRealtime';
import { sanitizeInput } from '../utils/sanitize';
import { logAuditEvent } from '../services/auditLog';
import {
  fetchActivePatients, fetchActivePatientsPage, fetchAllPatients,
  upsertPatient, removePatient, PATIENT_PAGE_SIZE,
  fetchPatientById, renamePatientIpNo as renamePatientIpNoService,
  describePatientChange,
} from '../services/patientService';
import { insertLab } from '../services/labsService';
import { insertImaging, deleteImaging } from '../services/imagingService';
import { saveRoundChecked, roundToRow, type RoundNoteStamp } from '../services/roundsService';
import { insertVital } from '../services/vitalsService';
import { enqueue, getRetryableQueue, getQueue, getDeadLetterQueue, removeFromDeadLetterQueue, setQueueOwner, type QueuedOp } from '../services/syncQueue';
import { drainQueue, replaySimpleOp, isSimpleOp, isAuthError, isRoleRefusal } from '../services/syncReplay';
import { can, canChangePatient, isOrdersOnlyChange, ORDER_COLUMNS, PERMISSION_DENIED_MESSAGE } from '../utils/permissions';
import { queuePatientSave, readQueuedPatientSave } from '../services/patientSaveQueue';
import {
  registerServiceWorker,
  requestNotificationPermission,
  checkAndNotifyAlerts,
} from '../services/pushNotifications';
import {
  saveActiveCache, loadActiveCache,
  saveAllCache, loadAllCache,
} from '../services/patientCache';
import { supabase } from '../lib/supabase';
import { toast } from '../utils/toast';
import { hapticSuccess } from '../utils/capacitorInit';
import { useAuth } from './AuthContext';

/** Where a round is after saveRound(). See PatientContextType.saveRound. */
export type RoundSaveResult =
  | { status: 'saved' }
  | { status: 'queued' }
  | { status: 'conflict'; server: RoundNoteStamp };

// ─── Context Shape ───
export interface ConcurrentEditConflict {
  localPatient: Patient;
  remotePatient: Patient;
}

interface PatientContextType {
  patients: Patient[];
  isLoadingPatients: boolean;
  /** True when patients are being served from cache (Supabase fetch pending or failed). */
  isStale: boolean;
  /** ISO timestamp of the cached data currently being shown, or null when fresh. */
  cacheTimestamp: string | null;
  /** True when more active patients exist on the server beyond the current page. */
  hasMore: boolean;
  /** True while loadMorePatients() is in flight. */
  isLoadingMore: boolean;
  /** Fetch the next page of active patients and append to the current list. */
  loadMorePatients: () => Promise<void>;
  hasLoadedAll: boolean;
  loadAllPatients: () => Promise<void>;
  /** `quiet` skips the "<name> updated" toast (Round Mode ticks orders many times per patient). Failures are always shown. */
  updatePatient: (patient: Patient, opts?: { quiet?: boolean }) => void;
  /** Records a new (possibly second) surgery: archives the current procedure/dos
   *  into priorSurgeries (if one exists), sets the new ones as current, clears
   *  plannedDos. No-op if the patient isn't found. */
  addSurgery: (ipNo: string, newProcedure: string, newDos: string) => void;
  addPatient: (patient: Patient) => void;
  deletePatient: (ipNo: string) => void;
  /** Corrects a patient's IP number after the fact (e.g. a typo caught after
   *  admission). Unlike other mutations, this awaits the server result before
   *  touching local state — a duplicate/permission failure must not appear
   *  to succeed. Throws with a user-displayable message on failure. Returns
   *  the patient's new `version` — callers holding their own snapshot of the
   *  patient (e.g. an open edit form) MUST apply it before their next save,
   *  or that save will be misreported as a conflict with another user. */
  renamePatientIpNo: (oldIpNo: string, newIpNo: string) => Promise<number | undefined>;
  addLabResult: (patientId: string, result: LabResult) => void;
  addInvestigation: (patientId: string, inv: Investigation) => void;
  deleteInvestigation: (patientId: string, invId: string) => void;
  getPatient: (ipNo: string) => Patient | undefined;
  /** Emergency (break-glass) lookup of a patient outside the caller's normal
   *  unit scope — hospital-scoped only (never crosses hospital_id, the real
   *  tenant boundary), logs a distinct justified audit entry, and does NOT
   *  merge the result into `patients` state so it never leaks into ward
   *  views/counts. Returns null if no patient with that IP number exists in
   *  this hospital. */
  fetchEmergencyPatient: (ipNo: string, reason: string) => Promise<Patient | null>;
  /** Persist a daily round note to the normalized rounds table + update local state. */
  /**
   * Save one day's round. Never rejects. Resolves with where the round is now:
   *  - saved:    the server has confirmed it;
   *  - queued:   kept on the phone, to be sent later;
   *  - conflict: NOT saved — someone else changed the note after `baseNoteAt`.
   *              `server` is their note; the caller must let the doctor choose.
   * `baseNoteAt` is the round_note_at the writer started from (null = there
   * was no note). `quiet` suppresses the "kept on this phone" toast for
   * screens that show the save state themselves (Round Mode).
   */
  saveRound: (
    patientIpNo: string, round: DailyRound, opts?: { quiet?: boolean; baseNoteAt?: string | null },
  ) => Promise<RoundSaveResult>;
  /** Insert a new vitals observation to the normalized table + update local state. */
  addVitalSign: (patientIpNo: string, vital: Omit<VitalSigns, 'id'>) => Promise<void>;
  /** Non-null when a concurrent edit conflict needs user resolution. */
  concurrentEditConflict: ConcurrentEditConflict | null;
  /** Resolve a concurrent edit: 'local' force-saves the user's version, 'remote' discards it. */
  resolveConcurrentEdit: (choice: 'local' | 'remote') => void;
  /** Realtime connection status for UI indicators. */
  realtimeStatus: 'connected' | 'reconnecting' | 'disconnected';
  /** Force an immediate reconnect — useful for the manual Retry button in RoundMode. */
  forceReconnect: () => void;
  /** True if any operation failed due to JWT expiry. */
  sessionExpired: boolean;
}

const PatientContext = createContext<PatientContextType | null>(null);

export function usePatients(): PatientContextType {
  const ctx = useContext(PatientContext);
  if (!ctx) throw new Error('usePatients must be used within PatientProvider');
  return ctx;
}

// ─── Provider ───
export const PatientProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  // ─── Cache-first initialization ───
  // Read the cache synchronously during render so the first paint shows real data,
  // not a loading spinner. localStorage reads are ~0.1 ms — safe to call in state
  // initializers without any noticeable cost.
  // hospitalId used for cache scoping — available synchronously from localStorage-backed auth
  const _initHid = user?.hospitalId ?? '';

  const [patients, _setPatients] = useState<Patient[]>(() => {
    const cached = loadActiveCache(_initHid);
    return cached ? enrichPatientData(cached.patients) : [];
  });

  // Wrapper that guarantees no duplicate ipNo entries survive in state.
  // All realtime/fetch/optimistic paths funnel through here, so a race
  // between cache load + initial fetch + realtime INSERT can never accumulate
  // duplicates in the patients array (last entry for a given ipNo wins).
  const setPatients = useCallback(
    (updater: Patient[] | ((prev: Patient[]) => Patient[])) => {
      _setPatients(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (next === prev) return prev;
        const seen = new Map<string, Patient>();
        for (const p of next) seen.set(p.ipNo, p);
        return seen.size === next.length ? next : [...seen.values()];
      });
    },
    [],
  );

  // Show spinner only when there is no cache to fall back on.
  const [isLoadingPatients, setIsLoadingPatients] = useState(() => !loadActiveCache(_initHid));

  // isStale = we are serving cached data; cleared once fresh data arrives.
  const [isStale, setIsStale] = useState(() => !!loadActiveCache(_initHid));

  // ISO timestamp of the cache currently on screen (shown in the banner).
  const [cacheTimestamp, setCacheTimestamp] = useState<string | null>(
    () => loadActiveCache(_initHid)?.cachedAt ?? null,
  );

  // Realtime connection status for the sidebar indicator (Bug #15)
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('disconnected');

  // Track if any operation failed due to session expiry (Bug #10)
  const [sessionExpired, setSessionExpired] = useState(false);

  const [hasLoadedAll, setHasLoadedAll] = useState(false);

  // ─── Concurrent edit conflict state ───
  const [concurrentEditConflict, setConcurrentEditConflict] = useState<ConcurrentEditConflict | null>(null);

  // ─── Pagination state ───
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { viewingHospitalId, selectedUnit } = useAuth();

  // Effective hospitalId for cache scoping: superadmin viewing another hospital uses their target.
  const effectiveHospitalId = viewingHospitalId ?? user?.hospitalId ?? '';

  // For admins, the unit picker result overrides user.unit (which is null for admin = all units).
  // 'all' → no filter; a specific unit string → filter to that unit.
  const effectiveUnit = resolveEffectiveUnit(user?.role, selectedUnit, user?.unit);

  // Debounced cache write — reduced to 300ms so a backgrounded/killed app loses
  // at most 300ms of realtime events rather than 2000ms.
   
  const debouncedSaveActiveCache = useCallback(
    debounce((pts: Patient[], hid: string) => saveActiveCache(pts, hid), 300),
    [],
  );

  // Flush the cache immediately when the app is backgrounded (visibilitychange)
  // so Android/iOS process-kill doesn't lose the debounce window.
  const latestPatientsRef  = useRef<Patient[]>([]);
  const latestHospitalRef  = useRef<string>('');
  useEffect(() => { latestPatientsRef.current  = patients;           }, [patients]);
  useEffect(() => { latestHospitalRef.current  = effectiveHospitalId; }, [effectiveHospitalId]);

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden' && latestPatientsRef.current.length > 0) {
        saveActiveCache(latestPatientsRef.current, latestHospitalRef.current);
      }
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, []);

  // Ref so the online-reconnect handler (useEffect with [] deps) always reads
  // the latest hospitalId even if it changed after the effect was registered.
  const hospitalIdRef = useRef<string | undefined>(viewingHospitalId ?? undefined);
  useEffect(() => { hospitalIdRef.current = viewingHospitalId ?? undefined; }, [viewingHospitalId]);

  // Track the effective unit in a ref so the realtime handler (which runs inside
  // the channel effect with [] deps) can always read the latest value.
  const effectiveUnitRef = useRef<string | undefined>(effectiveUnit);
  useEffect(() => { effectiveUnitRef.current = effectiveUnit; }, [effectiveUnit]);

  // Shared between the paginated background fetch and loadAllPatients:
  // whichever fetch was issued MOST RECENTLY should win, regardless of which
  // one finishes first. Without this, loadAllPatients()'s very first call
  // (fired on mount, before an admin has chosen a unit in UnitPicker — see
  // AuthContext's selectedUnit, null until then) can still be in flight when
  // the admin picks a unit and the paginated effect below re-fetches for it;
  // if the slow, unit-unfiltered load-all resolves after the fast, correctly
  // scoped paginated fetch, it silently overwrites it — the admin would see
  // every unit's patients instead of just the one they selected. Every fetch
  // below increments this before issuing a request and checks it hasn't
  // changed before applying the result.
  const patientsFetchGenerationRef = useRef(0);

  // ─── Background Fetch — paginated (cache-first then network) ───
  // user.unit filters patients to only this unit; admins (no unit) see all.
  // user?.id is intentionally in the dep array so the fetch re-runs after login
  // even for admin/ICU users whose unit is undefined both before and after login.
  useEffect(() => {
    // Don't fetch until the user is authenticated — the pre-login Supabase query
    // runs unauthenticated (no JWT) so RLS returns nothing, wasting a round-trip
    // and hiding the spinner before real data can arrive.
    if (!user) {
      setIsLoadingPatients(false);
      return;
    }

    // If there's no cached data at all, show the skeleton while the first
    // authenticated fetch is in flight (e.g. fresh device after login).
    if (!loadActiveCache(effectiveHospitalId)) {
      setIsLoadingPatients(true);
    }

    const generation = ++patientsFetchGenerationRef.current;

    fetchActivePatientsPage(effectiveUnit, 0, PATIENT_PAGE_SIZE, viewingHospitalId ?? undefined)
      .then(({ patients: data, hasMore: more }) => {
        // A newer fetch (paginated or loadAllPatients) has started since —
        // applying this response now would overwrite it with a stale scope.
        if (generation !== patientsFetchGenerationRef.current) return;
        const enriched = enrichPatientData(data);
        setPatients(enriched);
        setHasMore(more);
        setCurrentPage(0);
        saveActiveCache(data, effectiveHospitalId);       // update cache with fresh data
        setIsStale(false);
        setCacheTimestamp(null);

        registerServiceWorker()
          .then(() => requestNotificationPermission())
          .then(granted => { if (granted) checkAndNotifyAlerts(enriched); });
      })
      .catch(err => {
        console.error('[Patients] Failed to load from Supabase — serving cache:', err);
        // isStale remains true; patients already set from cache above.
        // If there was no cache, patients is [] and isLoadingPatients will
        // become false showing an empty (but not broken) dashboard.
      })
      .finally(() => setIsLoadingPatients(false));
  }, [user?.id, user?.unit, viewingHospitalId, selectedUnit]);

  // ─── Offline Sync Queue — whose changes are these? (audit DATA-05) ───
  // Unsent changes belong to the doctor who made them. This effect MUST stay
  // above the one below that starts a replay on sign-in: effects run in the
  // order they are written, and the replay must already see the new owner.
  // Another user's waiting changes are shown by <OtherUsersPendingNotice />.
  const queueOwnerId = user?.id;
  const queueOwnerName = user?.name;
  useEffect(() => {
    setQueueOwner(queueOwnerId ? { id: queueOwnerId, name: queueOwnerName } : null);
  }, [queueOwnerId, queueOwnerName]);

  // ─── Offline Sync Queue — replay on reconnect ───
  // Ref so the handler always reads the current user without a stale closure
  const userRef = useRef(user);
  useEffect(() => {
    const wasNull = !userRef.current;
    userRef.current = user;
    // If user just became available (login completed after mount), kick off a sync
    // that was skipped on mount due to the "no user yet" guard.
    if (wasNull && user) {
      handleOnlineRef.current();
    }
  }, [user]);

  // Keep a ref so the visibilitychange and startup handlers always call the
  // latest version without stale closures (the effect deps array stays []).
  const handleOnlineRef = useRef<() => Promise<void>>(async () => {});
  // Show the DLQ alert at most once per session so it doesn't re-fire on every tab-focus.
  const dlqAlertedRef = useRef(false);

  useEffect(() => {
    const handleOnline = async () => {
      if (!navigator.onLine) return;
      // Don't attempt sync before the user session is loaded — hospitalId would
      // be undefined, causing every queued op to fail immediately.
      if (!userRef.current) return;

      // Only replay ops whose backoff window has elapsed
      const queue = getRetryableQueue();

      // Show DLQ alert once per session, regardless of whether there are pending ops.
      // First, silently remove any duplicate-key entries — they are false alarms.
      // A duplicate-key means the insert already succeeded server-side; the patient IS saved.
      getDeadLetterQueue()
        .filter(d => d.reason?.includes('duplicate key') || d.reason?.includes('unique constraint'))
        .forEach(d => removeFromDeadLetterQueue(d.id));

      const dlq = getDeadLetterQueue();
      if (dlq.length > 0 && !dlqAlertedRef.current) {
        dlqAlertedRef.current = true;
        const concurrentCount = dlq.filter(d => d.reason?.includes('CONCURRENT_EDIT')).length;
        const otherCount = dlq.length - concurrentCount;
        if (concurrentCount > 0 && otherCount === 0) {
          // All failures are concurrent-edit — not a data-loss situation, just stale offline edits
          toast.warning(
            `${concurrentCount} offline edit${concurrentCount > 1 ? 's were' : ' was'} overridden by changes made on another device. Go to Settings → Advanced to review.`,
          );
        } else {
          // Build a user-friendly reason: strip technical prefixes and translate
          // common machine strings into plain language.
          const rawReason = dlq[0]?.reason ?? '';
          const isGenericMaxAttempts = /^max_attempts_exceeded\s*\(/i.test(rawReason);
          const friendlyReason = isGenericMaxAttempts
            ? 'connection was too weak to sync'
            : rawReason
                .replace(/^max_attempts_exceeded:\s*/i, '')
                .replace(/CONCURRENT_EDIT:\S+/g, 'record modified on another device')
                .replace(/\[object Object\]/g, 'server error')
                .slice(0, 80);
          const detail = friendlyReason ? ` — ${friendlyReason}` : '';
          toast.error(
            `⚠️ ${dlq.length} offline change${dlq.length > 1 ? 's' : ''} could not be saved${detail}. Go to Settings → Advanced to review.`,
          );
        }
      }

      if (queue.length === 0) return;

      toast.info(`Syncing ${queue.length} offline change${queue.length > 1 ? 's' : ''}…`);

      // Sends one queued change. MUST throw unless the server confirmed it —
      // drainQueue() removes a change from the phone only when this resolves.
      const executeOp = async (op: QueuedOp): Promise<void> => {
        if (op.type === 'upsert_patient') {
          // `onlyColumns` is set for an orders-only save: send just those columns.
          const { patient: qp, onlyColumns } = readQueuedPatientSave(op.payload);
          // Patch hospitalId in case the op was queued before this fix landed
          // (pre-fix ops have hospitalId = undefined, causing the re-insert to fail again).
          const withHid: Patient = qp.hospitalId
            ? qp
            : { ...qp, hospitalId: userRef.current?.hospitalId };
          try {
            await upsertPatient(withHid, false, onlyColumns);
          } catch (qErr) {
            // CONCURRENT_EDIT in queue: another device updated the record while we were offline.
            // Auto-resolve: if no meaningful field changed, adopt the remote timestamp and retry.
            // This prevents 5× pointless retries → DLQ for a trivially resolvable conflict.
            if (qErr instanceof Error && qErr.message.startsWith('CONCURRENT_EDIT:')) {
              const remote = await fetchPatientById(withHid.ipNo, withHid.hospitalId ?? undefined);
              if (remote) {
                const MKEYS = ['bed', 'ward', 'diagnosis', 'patientStatus', 'pacStatus',
                  'procedure', 'dos', 'dod', 'pod', 'management', 'unit'] as const;
                // An orders-only save sends no other column, so a change to
                // the other columns elsewhere is not a conflict for it.
                const hasRealDiff = !onlyColumns && MKEYS.some(
                  k => String((withHid as unknown as Record<string, unknown>)[k] ?? '') !==
                       String((remote  as unknown as Record<string, unknown>)[k] ?? ''),
                );
                if (!hasRealDiff) {
                  await upsertPatient({ ...withHid, version: remote.version, updatedAt: remote.updatedAt }, false, onlyColumns);
                } else {
                  throw new Error(
                    `${withHid.name || withHid.ipNo}: offline edit not applied — record was changed on another device.`,
                  );
                }
              } else {
                throw qErr;
              }
            } else if (
              qErr instanceof Error &&
              (qErr.message.includes('duplicate key') || qErr.message.includes('unique constraint')) &&
              !withHid.updatedAt
            ) {
              // The first insert attempt succeeded server-side before the auth error was returned.
              // The row already exists in the DB — silently treat as success and dequeue.
              console.info('[SyncQueue] new-patient insert already landed for', withHid.ipNo, '— deduplicating');
            } else {
              throw qErr;
            }
          }
        } else if (op.type === 'insert_lab') {
          const { patientId, hospitalId: labHid, result } = op.payload as { patientId: string; hospitalId?: string; result: LabResult };
          await insertLab(patientId, result, labHid);
        } else if (op.type === 'insert_imaging') {
          const { patientId, hospitalId: imgHid, inv } = op.payload as { patientId: string; hospitalId?: string; inv: Investigation };
          // Patch hospitalId in case the op was queued before hospitalId was populated
          const resolvedImgHid = imgHid ?? userRef.current?.hospitalId;
          await insertImaging(patientId, inv, resolvedImgHid);
        } else if (op.type === 'delete_imaging') {
          await deleteImaging(op.payload as string);
        } else if (isSimpleOp(op.type)) {
          // Round notes, vitals, nursing notes, medication records. These
          // used to be awaited without checking the answer, so a refused or
          // failed request was deleted from the queue as if it had saved.
          await replaySimpleOp(op);
        } else {
          // A change type this version does not know. Never delete it
          // silently — let it fail into the dead-letter queue where it shows.
          throw new Error(`Unknown queued change type "${op.type}"`);
        }
      };

      const result = await drainQueue(executeOp);

      if (result.stoppedBy === 'auth') {
        // Auth errors (expired JWT, invalid token) will never succeed on retry.
        // The remaining changes stay queued for the next sign-in.
        setSessionExpired(true);
        toast.error('Session expired — please log out and log in again to save offline changes.');
      }
      for (const { opType, label, reason } of result.dropped) {
        const what = opType === 'upsert_patient'
          ? `Patient record${label ? ` for ${label}` : ''}`
          : 'An offline change';
        toast.error(reason === 'role'
          ? `${what} was not saved: ${PERMISSION_DENIED_MESSAGE} It is kept under Settings → Advanced.`
          : `${what} could not be saved after repeated attempts. Please re-enter the data.`);
      }

      // Use getQueue() (all ops) not getRetryableQueue() (only due ops) so backoff ops are counted
      const remaining = getQueue().length;
      if (remaining === 0) {
        toast.success('All offline changes synced');
        // effectiveUnitRef, not userRef.current?.unit: for an admin, user.unit
        // is always undefined ("sees all" is only the default) — that field
        // ignores whatever unit the admin has picked via UnitPicker, the
        // exact bug already fixed in loadAllPatients (see effectiveUnit's
        // definition above). This effect has [] deps, so it needs the ref
        // (kept fresh by its own effect), not the plain variable.
        const generation = ++patientsFetchGenerationRef.current;
        fetchActivePatients(effectiveUnitRef.current, hospitalIdRef.current)
          .then(data => {
            // A newer fetch (paginated, loadAllPatients, or another sync/
            // cross-tab refresh) has started since — applying this response
            // now would overwrite it with a stale scope.
            if (generation !== patientsFetchGenerationRef.current) return;
            const enriched = enrichPatientData(data);
            setPatients(enriched);
            saveActiveCache(data, hospitalIdRef.current ?? '');
            setIsStale(false);
            setCacheTimestamp(null);
            // Notify other open tabs that a sync just completed
            try {
              bc?.postMessage({ type: 'SYNC_COMPLETE', hospitalId: hospitalIdRef.current });
            } catch { /* BroadcastChannel not supported (iOS 14-) */ }
          })
          .catch(() => {/* stay on current state */});
      } else {
        toast.warning(`${remaining} change${remaining > 1 ? 's' : ''} couldn't sync. Will retry later.`);
      }
    };

    handleOnlineRef.current = handleOnline;

    // Also sync when app returns to foreground (covers the case where the
    // device was already online — the 'online' event never fires then).
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleOnlineRef.current();
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    // Attempt sync immediately on mount in case ops were queued in a prior
    // session while the device was online (e.g. a transient Supabase error).
    handleOnline();

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // ─── BroadcastChannel: sync across tabs on the same device ───
  // When one tab successfully syncs (comes back online), notify other open
  // tabs so they also re-fetch fresh data instead of showing stale cache.
  const bc = useMemo(() => {
    try { return new BroadcastChannel('mediward_patient_sync'); }
    catch { return null; } // BroadcastChannel not available (some older Safari)
  }, []);

  useEffect(() => {
    if (!bc) return;
    const handler = (e: MessageEvent) => {
      if (
        e.data?.type === 'SYNC_COMPLETE' &&
        e.data?.hospitalId === (hospitalIdRef.current ?? effectiveHospitalId)
      ) {
        // Another tab synced — quietly refresh this tab's patient list.
        // effectiveUnitRef, not userRef.current?.unit — same reasoning as the
        // handleOnline sync-drain refetch above.
        const generation = ++patientsFetchGenerationRef.current;
        fetchActivePatients(effectiveUnitRef.current, hospitalIdRef.current)
          .then(data => {
            if (generation !== patientsFetchGenerationRef.current) return; // superseded
            const enriched = enrichPatientData(data);
            setPatients(enriched);
            saveActiveCache(data, hospitalIdRef.current ?? '');
            setIsStale(false);
            setCacheTimestamp(null);
          })
          .catch(() => {}); // silently ignore — this is a best-effort refresh
      }
    };
    bc.addEventListener('message', handler);
    return () => { bc.removeEventListener('message', handler); bc.close(); };
  }, [bc]);

  // ─── Supabase Realtime with Exponential-Backoff Reconnection ───
  const channelRef    = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const connectRef    = useRef<(() => void) | null>(null);
  const clearTimerRef = useRef<(() => void) | null>(null);

  const forceReconnect = useCallback(() => {
    // Tear down existing channel + cancel pending retry timer, then reconnect now.
    clearTimerRef.current?.();
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    connectRef.current?.();
  }, []);

  useEffect(() => {
    let destroyed = false;
    let retryTimer: ReturnType<typeof setTimeout>;
    let retryDelay = 2000;

    clearTimerRef.current = () => clearTimeout(retryTimer);

    const connect = () => {
      // Refuse to open an unscoped realtime channel — without a hospital_id
      // filter, every patient INSERT/UPDATE across ALL hospitals would be
      // broadcast to this subscriber, breaking tenant isolation.
      if (!effectiveHospitalId) return;

      const hospitalFilter = `hospital_id=eq.${effectiveHospitalId}`;

      const ch = supabase
        .channel(`patients-realtime-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'patients', filter: hospitalFilter },
          async (payload) => {
            // PHI-safe realtime (Task 5):
            // We only read non-PHI fields (ip_no, unit) from the payload to
            // decide what to do, then fetch the full row via SELECT which is
            // RLS-protected. This prevents PHI leakage even if the realtime
            // channel were misconfigured or Supabase Realtime auth is bypassed.
            // Only INSERT and UPDATE arrive: deletion events are switched off in
            // the database (they bypass access rules). See utils/patientRealtime.ts.
            if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;
            const ipNo    = (payload.new as { ip_no?: string })?.ip_no;
            const rowUnit = (payload.new as { unit?: string })?.unit;
            if (!ipNo) return;
            // patients.ip_no is the primary key; REPLICA IDENTITY DEFAULT means
            // an UPDATE that changes it carries the OLD ip_no in payload.old.
            const oldIpNo = payload.eventType === 'UPDATE'
              ? (payload.old as { ip_no?: string } | null)?.ip_no
              : undefined;

            const commit = (change: (prev: Patient[]) => Patient[] | null, enrich: boolean) =>
              setPatients(prev => {
                const changed = change(prev);
                if (!changed) return prev;
                const next = enrich ? enrichPatientData(changed) : changed;
                debouncedSaveActiveCache(next, effectiveHospitalId);
                return next;
              });
            // An UPDATE that leaves the patient invisible here (removed, moved
            // to another unit, or no longer readable) takes it off this list.
            const dropIfUpdate = () => {
              if (payload.eventType === 'UPDATE') commit(prev => removePatientsFromList(prev, [ipNo, oldIpNo]), false);
            };

            // Client-side unit filter (belt-and-suspenders — DB filter is primary)
            const activeUnit = effectiveUnitRef.current;
            if (activeUnit && rowUnit && rowUnit !== activeUnit) { dropIfUpdate(); return; }

            // Fetch full row through RLS — ensures we can only see authorised data.
            // null: soft-deleted, or RLS hides it (wrong hospital or unit).
            const fresh = await fetchPatientById(ipNo, hospitalIdRef.current ?? undefined);
            if (!fresh) { dropIfUpdate(); return; }

            if (payload.eventType === 'INSERT') commit(prev => applyPatientInsert(prev, fresh), true);
            else commit(prev => applyPatientUpdate(prev, fresh, oldIpNo), true);
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            retryDelay = 2000; // reset backoff on success
            setRealtimeStatus('connected');
            toast.dismiss('rt-conn'); // clear any "connection lost" banner
          }
          if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !destroyed) {
            setRealtimeStatus('reconnecting');
            toast.warning('Realtime connection lost — reconnecting…', 'rt-conn');
            supabase.removeChannel(ch);
            channelRef.current = null;
            retryTimer = setTimeout(() => {
              if (!destroyed) connect();
            }, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 30_000);
          }
        });

      channelRef.current = ch;
    };

    connectRef.current = connect;
    connect();

    return () => {
      destroyed = true;
      clearTimeout(retryTimer);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setRealtimeStatus('disconnected');
    };
  // Re-subscribe whenever the effective hospital changes (superadmin hospital switch)
  }, [effectiveHospitalId]);

  // ─── Load More (next page of active patients) ───
  const loadMorePatients = useCallback(async () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const { patients: data, hasMore: more } = await fetchActivePatientsPage(
        effectiveUnit, nextPage, PATIENT_PAGE_SIZE, viewingHospitalId ?? undefined,
      );
      const enriched = enrichPatientData(data);
      setPatients(prev => {
        // Deduplicate in case a realtime event already added some rows
        const existingIds = new Set(prev.map(p => p.ipNo));
        const newOnes = enriched.filter(p => !existingIds.has(p.ipNo));
        const combined = [...prev, ...newOnes];
        saveActiveCache(combined, effectiveHospitalId);
        return combined;
      });
      setHasMore(more);
      setCurrentPage(nextPage);
    } catch (err) {
      console.error('[Patients] loadMorePatients failed:', err);
      toast.error('Failed to load more patients.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, currentPage, effectiveUnit, viewingHospitalId]);

  // ─── Load All Patients (lazy — Master/Discharge views) ───
  // Tracks which unit scope the last successful full load covered, so a
  // later change of effectiveUnit (admin picks a different unit) correctly
  // triggers a fresh, re-scoped fetch instead of the hasLoadedAll guard
  // silently freezing the list at whatever was loaded first.
  const loadedAllUnitRef = useRef<string | undefined>(undefined);
  const loadAllPatients = useCallback(async () => {
    if (hasLoadedAll && loadedAllUnitRef.current === effectiveUnit) return;
    const generation = ++patientsFetchGenerationRef.current;

    // Serve all-patients cache immediately if available
    const cached = loadAllCache(effectiveHospitalId);
    if (cached) {
      setPatients(enrichPatientData(cached.patients));
      setIsStale(true);
      setCacheTimestamp(cached.cachedAt);
    }

    try {
      // effectiveUnit, not user?.unit: for an admin, user.unit is always
      // undefined ("sees all patients" is only the *default*) — using it
      // here ignored the admin's UnitPicker selection entirely, so Master
      // List (and, since dashboard/pending/wenthome also call this, the
      // regular dashboard too) always showed every unit's patients no
      // matter which unit was selected.
      const data = await fetchAllPatients(effectiveUnit);
      if (generation !== patientsFetchGenerationRef.current) return; // superseded
      const enriched = enrichPatientData(data);
      setPatients(enriched);
      saveAllCache(data, effectiveHospitalId);
      setIsStale(false);
      setCacheTimestamp(null);
      setHasLoadedAll(true);
      loadedAllUnitRef.current = effectiveUnit;
    } catch (err) {
      if (generation !== patientsFetchGenerationRef.current) return; // superseded
      console.error('[Patients] Failed to load all — serving cache:', err);
      if (!cached) throw err; // no fallback — propagate so caller can handle
    }
  }, [hasLoadedAll, effectiveUnit, effectiveHospitalId]);

  // ─── Patient CRUD ───

  // Every successful save MUST refresh the cached patient's version — the DB
  // bumps `version` on every UPDATE via trigger, and upsertPatient's optimistic
  // lock compares against this cached value. Skipping this step means the NEXT
  // save (even seconds later, same user, same session) compares against a
  // stale version and gets misreported as a peer conflict against no one.
  const applyServerVersion = useCallback((ipNo: string, version: number | undefined) => {
    if (version == null) return;
    setPatients(prev => {
      const next = prev.map(p => p.ipNo === ipNo ? { ...p, version } : p);
      saveActiveCache(next, effectiveHospitalId);
      return next;
    });
  }, [effectiveHospitalId]);

  // ─── Role limits (audit SEC-06) ───
  // Every save below first asks the role table. The database enforces the
  // same table; these checks only spare the user a save that would be refused.
  // They read userRef, not `user`: several of these callbacks have fixed
  // dependency lists and would otherwise keep the user from the first render.
  const patientsRef = useRef(patients);
  useEffect(() => { patientsRef.current = patients; }, [patients]);

  const refuse = useCallback((): false => {
    toast.error(PERMISSION_DENIED_MESSAGE);
    return false;
  }, []);

  /** The database refused a save because of the role: say so and show what the server really holds. */
  const revertAfterRefusal = useCallback((ipNo: string) => {
    toast.error(PERMISSION_DENIED_MESSAGE);
    fetchPatientById(ipNo, user?.hospitalId)
      .then(remote => setPatients(prev => enrichPatientData(
        remote ? prev.map(p => (p.ipNo === ipNo ? remote : p)) : prev.filter(p => p.ipNo !== ipNo),
      )))
      .catch(() => { /* offline: the next refresh corrects the list */ });
  }, [user?.hospitalId]);

  const updatePatient = useCallback((updatedPatient: Patient, opts?: { quiet?: boolean }) => {
    const before = patientsRef.current.find(p => p.ipNo === updatedPatient.ipNo);
    const change = describePatientChange(before, updatedPatient);
    if (!canChangePatient(userRef.current, change)) { refuse(); return; }
    // Orders are stored inside the patient record. When nothing but the orders
    // changed, only that column is sent: a user who may write orders but not
    // edit the patient must not send the other columns at all.
    const only = isOrdersOnlyChange(change) ? ORDER_COLUMNS : undefined;
    // Sanitize user-editable text fields (same protection as addPatient)
    const sanitized = {
      ...updatedPatient,
      name:      sanitizeInput(updatedPatient.name),
      diagnosis: sanitizeInput(updatedPatient.diagnosis),
      procedure: updatedPatient.procedure ? sanitizeInput(updatedPatient.procedure) : undefined,
    };
    setPatients(prev => {
      const next = enrichPatientData(
        prev.map(p => p.ipNo === sanitized.ipNo ? sanitized : p),
      );
      saveActiveCache(next, effectiveHospitalId);
      return next;
    });
    const isDischarge = sanitized.patientStatus === 'Discharged';
    upsertPatient(sanitized, false, only)
      .then(newVersion => {
        applyServerVersion(sanitized.ipNo, newVersion);
        if (!opts?.quiet) toast.success(`${sanitized.name} updated`);
        if (isDischarge) hapticSuccess();
      })
      .catch(err => {
        console.error('[Patients] updatePatient failed:', err);
        if (err instanceof Error && err.message.startsWith('CONCURRENT_EDIT:')) {
          // Fetch remote to compare; if only the version/timestamp diverged (no real
          // field change) silently adopt the server's version and retry — no dialog needed.
          const MEANINGFUL_KEYS = [
            'bed', 'ward', 'diagnosis', 'patientStatus', 'pacStatus',
            'procedure', 'dos', 'dod', 'pod', 'management', 'unit',
          ] as const;
          fetchPatientById(sanitized.ipNo, user?.hospitalId).then(remote => {
            if (!remote) {
              toast.error(`${sanitized.name} was modified by another user. Reload to see latest.`);
              return;
            }
            // An orders-only save sends no other column, so a change to the
            // other columns elsewhere is not a conflict for it.
            const hasRealDiff = !only && MEANINGFUL_KEYS.some(
              k => String(sanitized[k] ?? '') !== String(remote[k] ?? ''),
            );
            if (!hasRealDiff) {
              // Only the version/timestamp diverged (e.g. our own prior save on this
              // patient bumped it and our cache was never refreshed). Re-save with the
              // server's version so the conditional check passes.
              upsertPatient({ ...sanitized, version: remote.version, updatedAt: remote.updatedAt }, false, only)
                .then(newVersion => {
                  applyServerVersion(sanitized.ipNo, newVersion);
                  toast.success(`${sanitized.name} updated`);
                  if (isDischarge) hapticSuccess();
                })
                .catch(() => {
                  // Enqueue with the remote's version so the next replay passes the conditional check
                  queuePatientSave({ ...sanitized, version: remote.version, updatedAt: remote.updatedAt }, only);
                  toast.warning('Saved locally — will sync when online.');
                });
              return;
            }
            // Real conflict — show the dialog so the user can decide
            setConcurrentEditConflict({ localPatient: sanitized, remotePatient: remote });
          }).catch(() => {
            toast.error(`${sanitized.name} was modified by another user. Reload to see latest.`);
          });
          return; // do NOT enqueue a stale overwrite
        }
        if (isRoleRefusal(err)) {
          revertAfterRefusal(sanitized.ipNo);
          return; // do NOT enqueue: the answer would be the same every time
        }
        if (isAuthError(err)) {
          setSessionExpired(true);
          // Enqueue so the edit is not silently lost — will replay with a fresh session
          // after the user logs back in.
          queuePatientSave(sanitized, only);
          toast.error('Session expired — log in again. Your edit is saved locally and will sync after login.');
          return;
        }
        queuePatientSave(sanitized, only);
        toast.warning('Saved locally — will sync when online.');
      });
    if (user) {
      logAuditEvent(user.id, user.name, 'UPDATE', 'patient', sanitized.ipNo,
        `Updated: ${sanitized.name} (Bed ${sanitized.bed})`);
    }
  }, [user, applyServerVersion, refuse, revertAfterRefusal]);

  const addSurgery = useCallback((ipNo: string, newProcedure: string, newDos: string) => {
    const patient = patients.find(p => p.ipNo === ipNo);
    if (!patient) return;
    updatePatient({ ...patient, ...buildSurgeryUpdate(patient, newProcedure, newDos) });
  }, [patients, updatePatient]);

  const addPatient = useCallback((patient: Patient) => {
    if (!can(userRef.current, 'patient:add')) { refuse(); return; }
    const p = {
      ...patient,
      // Always stamp the current user's hospitalId so the row reaches Supabase
      // with the correct tenant — without this, the insert has hospital_id = NULL
      // and the patient is invisible to every user (admin's fetch filters by hospitalId).
      hospitalId: patient.hospitalId ?? user?.hospitalId,
      name:      sanitizeInput(patient.name),
      diagnosis: sanitizeInput(patient.diagnosis),
      procedure: patient.procedure ? sanitizeInput(patient.procedure) : undefined,
    };
    setPatients(prev => {
      const next = enrichPatientData([p, ...prev]);
      saveActiveCache(next, effectiveHospitalId);
      return next;
    });
    upsertPatient(p)
      .then(newVersion => {
        applyServerVersion(p.ipNo, newVersion);
        toast.success(`${p.name} admitted to Bed ${p.bed}`);
        hapticSuccess();
      })
      .catch(err => {
        console.error('[Patients] addPatient failed:', err);
        if (isRoleRefusal(err)) {
          revertAfterRefusal(p.ipNo);
          return;
        }
        if (isAuthError(err)) {
          setSessionExpired(true);
          // Still enqueue so the record is not lost — the queue replay will use the
          // fresh session after the user logs back in.
          enqueue('upsert_patient', p);
          toast.error('Session expired — log in again. Patient saved locally and will sync after login.');
          return;
        }
        // Duplicate-key: the patient already exists in the DB (first insert reached the
        // server before an auth error was returned, or the user re-entered a known IP).
        // Remove the ghost optimistic entry and show the real DB record instead.
        if (err instanceof Error && (err.message.includes('duplicate key') || err.message.includes('unique constraint'))) {
          setPatients(prev => prev.filter(pt => pt.ipNo !== p.ipNo));
          fetchPatientById(p.ipNo, p.hospitalId ?? undefined)
            .then(existing => {
              if (existing) {
                setPatients(prev => {
                  if (prev.some(pt => pt.ipNo === existing.ipNo)) return prev;
                  return enrichPatientData([existing, ...prev]);
                });
                toast.info(`IP ${p.ipNo} is already in the system — showing existing record. Use the edit (✏️) button if you need to update it.`);
              }
            })
            .catch(() => {
              toast.warning(`IP ${p.ipNo} already exists — check the ward list for the existing record.`);
            });
          return;
        }
        enqueue('upsert_patient', p);
        toast.warning('Saved locally — will sync when online.');
      });
    if (user) {
      logAuditEvent(user.id, user.name, 'CREATE', 'patient', p.ipNo,
        `Admitted: ${p.name} to Bed ${p.bed}`);
    }
  }, [user, applyServerVersion, refuse, revertAfterRefusal]);

  const deletePatient = useCallback((ipNo: string) => {
    if (!can(userRef.current, 'patient:delete')) { refuse(); return; }
    const p = patients.find(pt => pt.ipNo === ipNo);
    // Deliberately NOT optimistic. This used to take the patient off the ward
    // list first and only show a message if the server refused — the patient
    // then stayed hidden although still admitted. A patient leaves the list
    // only after the server has confirmed the removal.
    removePatient(ipNo)
      .then(() => {
        setPatients(prev => {
          const next = prev.filter(pt => pt.ipNo !== ipNo);
          saveActiveCache(next, effectiveHospitalId);
          return next;
        });
        if (p) toast.success(`${p.name} removed`);
        if (user && p) {
          logAuditEvent(user.id, user.name, 'DELETE', 'patient', ipNo, `Removed: ${p.name}`);
        }
      })
      .catch(err => {
        console.error('[Patients] deletePatient failed:', err);
        toast.error(`${p?.name ?? 'Patient'} was NOT removed. Check your connection and try again.`);
      });
  }, [user, patients, effectiveHospitalId]);

  const renamePatientIpNo = useCallback(async (oldIpNo: string, newIpNo: string) => {
    if (!can(userRef.current, 'patient:edit')) throw new Error(PERMISSION_DENIED_MESSAGE);
    // Await the server result first — a duplicate/permission failure must
    // reject cleanly, not appear to have applied. The RPC logs its own audit
    // entry server-side (atomic with the rename), so no client-side
    // logAuditEvent call here — that would double-log.
    const newVersion = await renamePatientIpNoService(oldIpNo, newIpNo);
    setPatients(prev => {
      const next = enrichPatientData(
        prev.map(p => p.ipNo === oldIpNo ? { ...p, ipNo: newIpNo, version: newVersion ?? p.version } : p),
      );
      saveActiveCache(next, effectiveHospitalId);
      return next;
    });
    // The caller (e.g. AddPatientModal, still holding a pre-rename snapshot
    // in its own local state) MUST apply this too — otherwise its next Save
    // sends the stale version and gets a false "modified by another user"
    // conflict, since the DB's version was just bumped by this rename.
    return newVersion;
  }, [effectiveHospitalId]);

  const addLabResult = useCallback((patientId: string, result: LabResult) => {
    if (!can(userRef.current, 'labs:write')) { refuse(); return; }
    setPatients(prev => {
      const next = prev.map(p =>
        p.ipNo !== patientId ? p : { ...p, labResults: [...p.labResults, result] },
      );
      saveActiveCache(next, effectiveHospitalId);
      return next;
    });
    insertLab(patientId, result, user?.hospitalId).catch(err => {
      console.error('[Patients] addLabResult sync failed:', err);
      enqueue('insert_lab', { patientId, hospitalId: user?.hospitalId, result });
    });
    if (user) {
      logAuditEvent(user.id, user.name, 'CREATE', 'lab_result', patientId,
        `Added ${result.type}: ${result.value} on ${result.date}`);
    }
  }, [user]);

  const addInvestigation = useCallback((patientId: string, inv: Investigation) => {
    if (!can(userRef.current, 'investigations:write')) { refuse(); return; }
    setPatients(prev => {
      const next = prev.map(p =>
        p.ipNo !== patientId ? p : { ...p, investigations: [inv, ...p.investigations] },
      );
      saveActiveCache(next, effectiveHospitalId);
      return next;
    });
    insertImaging(patientId, inv, user?.hospitalId).catch(err => {
      console.error('[Patients] addInvestigation sync failed:', err);
      enqueue('insert_imaging', { patientId, hospitalId: user?.hospitalId, inv });
    });
    if (user) {
      logAuditEvent(user.id, user.name, 'CREATE', 'investigation', patientId,
        `Uploaded ${inv.type} for patient ${patientId}`);
    }
  }, [user]);

  const deleteInvestigation = useCallback((patientId: string, invId: string) => {
    if (!can(userRef.current, 'investigations:write')) { refuse(); return; }
    setPatients(prev => {
      const next = prev.map(p =>
        p.ipNo !== patientId ? p
          : { ...p, investigations: p.investigations.filter(inv => inv.id !== invId) },
      );
      saveActiveCache(next, effectiveHospitalId);
      return next;
    });
    deleteImaging(invId).catch(err => {
      console.error('[Patients] deleteInvestigation sync failed:', err);
      enqueue('delete_imaging', invId);
    });
  }, []);

  const saveRound = useCallback((
    patientIpNo: string, round: DailyRound, opts?: { quiet?: boolean; baseNoteAt?: string | null },
  ): Promise<RoundSaveResult> => {
    // Merge into the same day's round instead of replacing it: a save that
    // only carries orders must not drop the note (and its author/time) from
    // the screen. `patch` is applied on top of whatever is there now.
    const mergeLocal = (patch: Partial<DailyRound>) => setPatients(prev => {
      const next = prev.map(p => {
        if (p.ipNo !== patientIpNo) return p;
        const sameDay = p.dailyRounds.find(r => r.date === round.date);
        const others = p.dailyRounds.filter(r => r.date !== round.date);
        return { ...p, dailyRounds: [{ ...sameDay, ...round, ...patch }, ...others] };
      });
      saveActiveCache(next, effectiveHospitalId);
      return next;
    });
    const asPatch = (stamp: RoundNoteStamp): Partial<DailyRound> =>
      ({ roundNote: stamp.roundNote, roundNoteBy: stamp.roundNoteBy, roundNoteAt: stamp.roundNoteAt });

    // Optimistic local update. Only the keys this save actually sets.
    const sent: Partial<DailyRound> = { ...round };
    if (round.roundNote === undefined) delete sent.roundNote;
    mergeLocal(sent);

    if (user) {
      logAuditEvent(user.id, user.name, 'CREATE', 'round', patientIpNo,
        `Round note saved for ${round.date}`);
    }

    const baseNoteAt = opts?.baseNoteAt ?? null;
    return saveRoundChecked(patientIpNo, user?.hospitalId, round, baseNoteAt)
      .then((outcome): RoundSaveResult => {
        if (outcome.status === 'conflict') {
          // Nothing was written. Show THEIR note as the stored one — ours is
          // still in the caller's hands (and in its draft) until the doctor decides.
          mergeLocal(asPatch(outcome.server));
          return { status: 'conflict', server: outcome.server };
        }
        // Show the author and time the database recorded, not a local guess.
        mergeLocal(asPatch(outcome.stamp));
        return { status: 'saved' };
      })
      .catch((err): RoundSaveResult => {
        console.error('[Patients] saveRound sync failed:', err);
        // Queue exactly once, whatever the reason — including an expired
        // sign-in, so the round is sent after the next login. The base stamp
        // travels with it so the later send is still checked for a conflict.
        enqueue('upsert_round', roundToRow(patientIpNo, user?.hospitalId, round, baseNoteAt));
        if (isAuthError(err)) {
          setSessionExpired(true);
          toast.error('Session expired — log in again. Your round is kept on this phone and will be sent after login.');
        } else if (!opts?.quiet) {
          // A warning, not an error: nothing is lost, it is waiting to be sent.
          toast.warning('Round kept on this phone — it will be sent when the connection returns.');
        }
        return { status: 'queued' };
      });
  }, [user, effectiveHospitalId]);

  const addVitalSign = useCallback(async (patientIpNo: string, vital: Omit<VitalSigns, 'id'>) => {
    if (!can(userRef.current, 'charting:write')) { refuse(); return; }
    try {
      // Write to normalized table first so we get the server-generated UUID
      const created = await insertVital(patientIpNo, user?.hospitalId, vital);
      // Optimistic local update
      setPatients(prev => {
        const next = prev.map(p =>
          p.ipNo !== patientIpNo ? p
            : { ...p, vitals: [created, ...(p.vitals ?? [])] },
        );
        saveActiveCache(next, effectiveHospitalId);
        return next;
      });
    } catch (err) {
      console.error('[Patients] addVitalSign sync failed:', err);
      // Enqueue for offline retry (matches addLabResult pattern)
      enqueue('insert_vital', {
        patient_ip_no: patientIpNo,
        hospital_id: user?.hospitalId ?? null,
        ...vital,
      });
      // Optimistic local update with a temporary ID so the UI isn't blank
      const tempVital = { ...vital, id: `temp-${Date.now()}` } as VitalSigns;
      setPatients(prev => {
        const next = prev.map(p =>
          p.ipNo !== patientIpNo ? p
            : { ...p, vitals: [tempVital, ...(p.vitals ?? [])] },
        );
        saveActiveCache(next, effectiveHospitalId);
        return next;
      });
      toast.warning('Vitals saved locally — will sync when online.');
    }
    if (user) {
      logAuditEvent(user.id, user.name, 'CREATE', 'vital', patientIpNo,
        `Vitals recorded at ${vital.timestamp}`);
    }
  }, [user]);

  const getPatient = useCallback((ipNo: string) =>
    patients.find(p => p.ipNo === ipNo),
  [patients]);

  // Emergency (break-glass) lookup — see PatientContextType's doc comment.
  const fetchEmergencyPatient = useCallback(async (ipNo: string, reason: string): Promise<Patient | null> => {
    const found = await fetchPatientById(ipNo, user?.hospitalId);
    if (found && user) {
      logAuditEvent(
        user.id, user.name, 'VIEW', 'patient', found.ipNo,
        `EMERGENCY ACCESS (reason: ${reason}): viewed ${found.name}, outside home unit "${user.unit ?? 'none'}" (patient unit: "${found.unit ?? 'none'}")`,
      );
    }
    return found;
  }, [user]);

  const resolveConcurrentEdit = useCallback((choice: 'local' | 'remote') => {
    if (!concurrentEditConflict) return;
    const { localPatient, remotePatient } = concurrentEditConflict;
    setConcurrentEditConflict(null);

    if (choice === 'local') {
      // Force-save: unconditional UPDATE (forceUpdate=true bypasses the updated_at match)
      const forced = localPatient;
      upsertPatient(forced, true)
        .then(async () => {
          toast.success(`${forced.name} saved (overwrite).`);
          // Re-fetch to restore the server's version/updated_at, preventing
          // subsequent saves from comparing against a stale lock value (Bug #3 fix)
          try {
            const refreshed = await fetchPatientById(forced.ipNo, user?.hospitalId);
            if (refreshed) {
              setPatients(prev => {
                const next = enrichPatientData(
                  prev.map(p => p.ipNo === refreshed.ipNo ? refreshed : p),
                );
                saveActiveCache(next, effectiveHospitalId);
                return next;
              });
            }
          } catch { /* non-blocking — local state will still work */ }
        })
        .catch(err => {
          if (err instanceof Error && err.message.startsWith('FORCE_SAVE_BLOCKED:')) {
            // RLS rejected the write (e.g. session no longer resolves to a hospital) —
            // nothing was saved. Say so plainly instead of the generic retry message,
            // since "try again" won't help without a fresh login.
            toast.error(`${forced.name} was NOT saved — your session may have expired. Log out and back in, then retry.`);
            return;
          }
          toast.error('Force-save failed. Please try again.');
        });
    } else {
      // Keep remote: update local state to the server's version
      setPatients(prev => {
        const next = enrichPatientData(
          prev.map(p => p.ipNo === remotePatient.ipNo ? remotePatient : p),
        );
        saveActiveCache(next, effectiveHospitalId);
        return next;
      });
      toast.success(`Showing latest version of ${remotePatient.name}.`);
    }
  }, [concurrentEditConflict, user?.hospitalId]);

  const value = useMemo<PatientContextType>(() => ({
    patients,
    isLoadingPatients,
    isStale,
    cacheTimestamp,
    hasMore,
    isLoadingMore,
    loadMorePatients,
    hasLoadedAll,
    loadAllPatients,
    updatePatient,
    addSurgery,
    addPatient,
    deletePatient,
    renamePatientIpNo,
    addLabResult,
    addInvestigation,
    deleteInvestigation,
    getPatient,
    fetchEmergencyPatient,
    saveRound,
    addVitalSign,
    concurrentEditConflict,
    resolveConcurrentEdit,
    realtimeStatus,
    forceReconnect,
    sessionExpired,
  }), [
    patients, isLoadingPatients, isStale, cacheTimestamp,
    hasMore, isLoadingMore, loadMorePatients,
    hasLoadedAll, loadAllPatients, updatePatient, addSurgery, addPatient, deletePatient,
    renamePatientIpNo, addLabResult, addInvestigation, deleteInvestigation, getPatient,
    fetchEmergencyPatient, saveRound, addVitalSign, concurrentEditConflict, resolveConcurrentEdit,
    realtimeStatus, forceReconnect, sessionExpired,
  ]);

  return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>;
};
