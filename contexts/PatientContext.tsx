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
import { enrichPatientData } from '../utils/calculations';
import { sanitizeInput } from '../utils/sanitize';
import { logAuditEvent } from '../services/auditLog';
import {
  fetchActivePatients, fetchActivePatientsPage, fetchAllPatients,
  upsertPatient, removePatient, parsePatientRow, PATIENT_PAGE_SIZE,
  fetchPatientById,
} from '../services/patientService';
import { insertLab } from '../services/labsService';
import { insertImaging, deleteImaging } from '../services/imagingService';
import { upsertRound } from '../services/roundsService';
import { insertVital } from '../services/vitalsService';
import { enqueue, getRetryableQueue, getQueue, dequeue, incrementAttempts, getDeadLetterQueue } from '../services/syncQueue';
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
  updatePatient: (patient: Patient) => void;
  addPatient: (patient: Patient) => void;
  deletePatient: (ipNo: string) => void;
  addLabResult: (patientId: string, result: LabResult) => void;
  addInvestigation: (patientId: string, inv: Investigation) => void;
  deleteInvestigation: (patientId: string, invId: string) => void;
  getPatient: (ipNo: string) => Patient | undefined;
  /** Persist a daily round note to the normalized rounds table + update local state. */
  saveRound: (patientIpNo: string, round: DailyRound) => void;
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

/** Returns true when the error indicates an expired/invalid JWT session. */
function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes('jwt') || msg.includes('expired') || msg.includes('unauthorized') || msg.includes('pgrst301');
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

  const [patients, setPatients] = useState<Patient[]>(() => {
    const cached = loadActiveCache(_initHid);
    return cached ? enrichPatientData(cached.patients) : [];
  });

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
  const effectiveUnit: string | undefined =
    user?.role === 'admin' && selectedUnit && selectedUnit !== 'all'
      ? selectedUnit
      : user?.unit ?? undefined;

  // Debounced cache write — reduced to 300ms so a backgrounded/killed app loses
  // at most 300ms of realtime events rather than 2000ms.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

    fetchActivePatientsPage(effectiveUnit, 0, PATIENT_PAGE_SIZE, viewingHospitalId ?? undefined)
      .then(({ patients: data, hasMore: more }) => {
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
      const dlq = getDeadLetterQueue();
      if (dlq.length > 0 && !dlqAlertedRef.current) {
        dlqAlertedRef.current = true;
        toast.error(
          `⚠️ ${dlq.length} update${dlq.length > 1 ? 's' : ''} failed permanently and need re-entry. Go to Settings → Advanced to review.`,
        );
      }

      if (queue.length === 0) return;

      toast.info(`Syncing ${queue.length} offline change${queue.length > 1 ? 's' : ''}…`);

      for (const op of queue) {
        try {
          if (op.type === 'upsert_patient') {
            const qp = op.payload as Patient;
            // Patch hospitalId in case the op was queued before this fix landed
            // (pre-fix ops have hospitalId = undefined, causing the re-insert to fail again).
            const withHid: Patient = qp.hospitalId
              ? qp
              : { ...qp, hospitalId: userRef.current?.hospitalId };
            await upsertPatient(withHid);
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
          } else if (op.type === 'upsert_round') {
            const p = op.payload as { patient_ip_no: string; hospital_id: string | null; date: string; note: string; todos: unknown[] };
            await supabase.from('rounds').upsert(p, { onConflict: 'patient_ip_no,date' });
          } else if (op.type === 'insert_vital') {
            await supabase.from('patient_vitals').insert(op.payload as Record<string, unknown>);
          } else if (op.type === 'insert_nursing_note') {
            await supabase.from('nursing_notes').insert(op.payload as Record<string, unknown>);
          } else if (op.type === 'record_med_administration') {
            await supabase.from('medication_administrations').insert(op.payload as Record<string, unknown>);
          }
          dequeue(op.id);
        } catch {
          const { dropped, opType, label } = incrementAttempts(op.id);
          if (dropped) {
            const what = opType === 'upsert_patient'
              ? `Patient record${label ? ` for ${label}` : ''}`
              : 'An offline change';
            toast.error(`${what} could not be saved after repeated attempts. Please re-enter the data.`);
          }
        }
      }

      // Use getQueue() (all ops) not getRetryableQueue() (only due ops) so backoff ops are counted
      const remaining = getQueue().length;
      if (remaining === 0) {
        toast.success('All offline changes synced');
        // Read from ref to avoid stale closure capturing pre-login user
        const currentUser = userRef.current;
        fetchActivePatients(currentUser?.unit, hospitalIdRef.current)
          .then(data => {
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
        // Another tab synced — quietly refresh this tab's patient list
        const currentUser = userRef.current;
        fetchActivePatients(currentUser?.unit, hospitalIdRef.current)
          .then(data => {
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
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const ipNo    = (payload.new as { ip_no?: string })?.ip_no;
              const rowUnit = (payload.new as { unit?: string })?.unit;
              if (!ipNo) return;

              // Client-side unit filter (belt-and-suspenders — DB filter is primary)
              const activeUnit = effectiveUnitRef.current;
              if (activeUnit && rowUnit && rowUnit !== activeUnit) return;

              // Fetch full row through RLS — ensures we can only see authorised data
              const fresh = await fetchPatientById(ipNo, hospitalIdRef.current ?? undefined);
              if (!fresh) return; // RLS blocked it (wrong hospital or unit)

              if (payload.eventType === 'INSERT') {
                setPatients(prev => {
                  if (prev.some(p => p.ipNo === fresh.ipNo)) return prev;
                  const next = enrichPatientData([fresh, ...prev]);
                  debouncedSaveActiveCache(next, effectiveHospitalId);
                  return next;
                });
              } else {
                setPatients(prev => {
                  const next = enrichPatientData(
                    prev.map(p => {
                      if (p.ipNo !== fresh.ipNo) return p;
                      // Merge: keep locally-loaded sub-records (labs, imaging, rounds)
                      return {
                        ...fresh,
                        labResults:     p.labResults,
                        investigations: p.investigations,
                        dailyRounds:    p.dailyRounds,
                        vitals:         p.vitals,
                      };
                    }),
                  );
                  debouncedSaveActiveCache(next, effectiveHospitalId);
                  return next;
                });
              }
            } else if (payload.eventType === 'DELETE') {
              const deletedIpNo = (payload.old as { ip_no?: string })?.ip_no;
              if (deletedIpNo) {
                setPatients(prev => {
                  const next = prev.filter(p => p.ipNo !== deletedIpNo);
                  debouncedSaveActiveCache(next, effectiveHospitalId);
                  return next;
                });
              }
            }
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            retryDelay = 2000; // reset backoff on success
            setRealtimeStatus('connected');
          }
          if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !destroyed) {
            setRealtimeStatus('reconnecting');
            toast.warning('Realtime connection lost — reconnecting…');
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
  const loadAllPatients = useCallback(async () => {
    if (hasLoadedAll) return;

    // Serve all-patients cache immediately if available
    const cached = loadAllCache(effectiveHospitalId);
    if (cached) {
      setPatients(enrichPatientData(cached.patients));
      setIsStale(true);
      setCacheTimestamp(cached.cachedAt);
    }

    try {
      const data = await fetchAllPatients(user?.unit);
      const enriched = enrichPatientData(data);
      setPatients(enriched);
      saveAllCache(data, effectiveHospitalId);
      setIsStale(false);
      setCacheTimestamp(null);
      setHasLoadedAll(true);
    } catch (err) {
      console.error('[Patients] Failed to load all — serving cache:', err);
      if (!cached) throw err; // no fallback — propagate so caller can handle
    }
  }, [hasLoadedAll, user?.unit]);

  // ─── Patient CRUD ───
  const updatePatient = useCallback((updatedPatient: Patient) => {
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
    upsertPatient(sanitized)
      .then(() => { toast.success(`${sanitized.name} updated`); if (isDischarge) hapticSuccess(); })
      .catch(err => {
        console.error('[Patients] updatePatient failed:', err);
        if (err instanceof Error && err.message.startsWith('CONCURRENT_EDIT:')) {
          // Fetch remote to compare; if only the timestamp diverged (no real field change)
          // silently adopt the server's updatedAt and retry — no dialog needed.
          const MEANINGFUL_KEYS = [
            'bed', 'ward', 'diagnosis', 'patientStatus', 'pacStatus',
            'procedure', 'dos', 'dod', 'pod', 'management', 'unit',
          ] as const;
          fetchPatientById(sanitized.ipNo, user?.hospitalId).then(remote => {
            if (!remote) {
              toast.error(`${sanitized.name} was modified by another user. Reload to see latest.`);
              return;
            }
            const hasRealDiff = MEANINGFUL_KEYS.some(
              k => String(sanitized[k] ?? '') !== String(remote[k] ?? ''),
            );
            if (!hasRealDiff) {
              // Only timestamps diverged (e.g. trigger or background sync touched updated_at).
              // Re-save with the server's updatedAt so the conditional check passes.
              upsertPatient({ ...sanitized, updatedAt: remote.updatedAt })
                .then(() => { toast.success(`${sanitized.name} updated`); if (isDischarge) hapticSuccess(); })
                .catch(() => { enqueue('upsert_patient', sanitized); toast.warning('Saved locally — will sync when online.'); });
              return;
            }
            // Real conflict — show the dialog so the user can decide
            setConcurrentEditConflict({ localPatient: sanitized, remotePatient: remote });
          }).catch(() => {
            toast.error(`${sanitized.name} was modified by another user. Reload to see latest.`);
          });
          return; // do NOT enqueue a stale overwrite
        }
        if (isAuthError(err)) {
          setSessionExpired(true);
          toast.error('Session expired — please log in again.');
          return; // do NOT enqueue; op will fail again after re-login when user re-submits
        }
        enqueue('upsert_patient', sanitized);
        toast.warning('Saved locally — will sync when online.');
      });
    if (user) {
      logAuditEvent(user.id, user.name, 'UPDATE', 'patient', sanitized.ipNo,
        `Updated: ${sanitized.name} (Bed ${sanitized.bed})`);
    }
  }, [user]);

  const addPatient = useCallback((patient: Patient) => {
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
      .then(() => { toast.success(`${p.name} admitted to Bed ${p.bed}`); hapticSuccess(); })
      .catch(err => {
        console.error('[Patients] addPatient failed:', err);
        if (isAuthError(err)) {
          setSessionExpired(true);
          toast.error('Session expired — please log in again.');
          return;
        }
        enqueue('upsert_patient', p);
        toast.warning('Saved locally — will sync when online.');
      });
    if (user) {
      logAuditEvent(user.id, user.name, 'CREATE', 'patient', p.ipNo,
        `Admitted: ${p.name} to Bed ${p.bed}`);
    }
  }, [user]);

  const deletePatient = useCallback((ipNo: string) => {
    const p = patients.find(pt => pt.ipNo === ipNo);
    setPatients(prev => {
      const next = prev.filter(pt => pt.ipNo !== ipNo);
      saveActiveCache(next, effectiveHospitalId);
      return next;
    });
    removePatient(ipNo)
      .then(() => p && toast.success(`${p.name} removed`))
      .catch(err => {
        console.error('[Patients] deletePatient failed:', err);
        toast.error('Failed to delete patient. Check your connection.');
      });
    if (user && p) {
      logAuditEvent(user.id, user.name, 'DELETE', 'patient', ipNo, `Removed: ${p.name}`);
    }
  }, [user, patients]);

  const addLabResult = useCallback((patientId: string, result: LabResult) => {
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

  const saveRound = useCallback((patientIpNo: string, round: DailyRound) => {
    // Optimistic local update
    setPatients(prev => {
      const next = prev.map(p => {
        if (p.ipNo !== patientIpNo) return p;
        const existing = p.dailyRounds.filter(r => r.date !== round.date);
        return { ...p, dailyRounds: [round, ...existing] };
      });
      saveActiveCache(next, effectiveHospitalId);
      return next;
    });
    // Persist to normalized rounds table; enqueue for offline retry on failure
    upsertRound(patientIpNo, user?.hospitalId, round).catch(err => {
      console.error('[Patients] saveRound sync failed:', err);
      if (isAuthError(err)) {
        setSessionExpired(true);
        toast.error('Session expired — please log in again.');
        return;
      }
      enqueue('upsert_round', {
        patient_ip_no: patientIpNo,
        hospital_id: user?.hospitalId ?? null,
        date: round.date,
        note: round.note,
        todos: round.todos,
      });
      toast.error('Round note queued for sync when connection is restored.');
    });
    if (user) {
      logAuditEvent(user.id, user.name, 'CREATE', 'round', patientIpNo,
        `Round note saved for ${round.date}`);
    }
  }, [user]);

  const addVitalSign = useCallback(async (patientIpNo: string, vital: Omit<VitalSigns, 'id'>) => {
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
          // Re-fetch to restore the server's updated_at, preventing
          // subsequent saves from bypassing optimistic locking (Bug #3 fix)
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
        .catch(() => toast.error('Force-save failed. Please try again.'));
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
    addPatient,
    deletePatient,
    addLabResult,
    addInvestigation,
    deleteInvestigation,
    getPatient,
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
    hasLoadedAll, loadAllPatients, updatePatient, addPatient, deletePatient,
    addLabResult, addInvestigation, deleteInvestigation, getPatient,
    saveRound, addVitalSign, concurrentEditConflict, resolveConcurrentEdit,
    realtimeStatus, forceReconnect, sessionExpired,
  ]);

  return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>;
};
