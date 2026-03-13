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
import { enqueue, getRetryableQueue, dequeue, incrementAttempts } from '../services/syncQueue';
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
  const [patients, setPatients] = useState<Patient[]>(() => {
    const cached = loadActiveCache();
    return cached ? enrichPatientData(cached.patients) : [];
  });

  // Show spinner only when there is no cache to fall back on.
  const [isLoadingPatients, setIsLoadingPatients] = useState(() => !loadActiveCache());

  // isStale = we are serving cached data; cleared once fresh data arrives.
  const [isStale, setIsStale] = useState(() => !!loadActiveCache());

  // ISO timestamp of the cache currently on screen (shown in the banner).
  const [cacheTimestamp, setCacheTimestamp] = useState<string | null>(
    () => loadActiveCache()?.cachedAt ?? null,
  );

  const [hasLoadedAll, setHasLoadedAll] = useState(false);

  // ─── Concurrent edit conflict state ───
  const [concurrentEditConflict, setConcurrentEditConflict] = useState<ConcurrentEditConflict | null>(null);

  // ─── Pagination state ───
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { viewingHospitalId } = useAuth();

  // Debounced cache write — avoids serialising the full patient array on every realtime event.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSaveActiveCache = useCallback(
    debounce((pts: Patient[]) => saveActiveCache(pts), 2000),
    [],
  );

  // Ref so the online-reconnect handler (useEffect with [] deps) always reads
  // the latest hospitalId even if it changed after the effect was registered.
  const hospitalIdRef = useRef<string | undefined>(viewingHospitalId ?? undefined);
  useEffect(() => { hospitalIdRef.current = viewingHospitalId ?? undefined; }, [viewingHospitalId]);

  // ─── Background Fetch — paginated (cache-first then network) ───
  // user.unit filters patients to only this unit; admins (no unit) see all.
  useEffect(() => {
    fetchActivePatientsPage(user?.unit, 0, PATIENT_PAGE_SIZE, viewingHospitalId ?? undefined)
      .then(({ patients: data, hasMore: more }) => {
        const enriched = enrichPatientData(data);
        setPatients(enriched);
        setHasMore(more);
        setCurrentPage(0);
        saveActiveCache(data);       // update cache with fresh data
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
  }, [user?.unit, viewingHospitalId]);

  // ─── Offline Sync Queue — replay on reconnect ───
  useEffect(() => {
    const handleOnline = async () => {
      // Only replay ops whose backoff window has elapsed
      const queue = getRetryableQueue();
      if (queue.length === 0) return;

      toast.info(`Syncing ${queue.length} offline change${queue.length > 1 ? 's' : ''}…`);

      for (const op of queue) {
        try {
          if (op.type === 'upsert_patient') {
            await upsertPatient(op.payload as Patient);
          } else if (op.type === 'insert_lab') {
            const { patientId, result } = op.payload as { patientId: string; result: LabResult };
            await insertLab(patientId, result);
          } else if (op.type === 'insert_imaging') {
            const { patientId, inv } = op.payload as { patientId: string; inv: Investigation };
            await insertImaging(patientId, inv);
          } else if (op.type === 'delete_imaging') {
            await deleteImaging(op.payload as string);
          } else if (op.type === 'upsert_round') {
            const p = op.payload as { patient_ip_no: string; hospital_id: string | null; date: string; note: string; todos: unknown[] };
            await supabase.from('rounds').upsert(p, { onConflict: 'patient_ip_no,date' });
          } else if (op.type === 'insert_vital') {
            await supabase.from('patient_vitals').insert(op.payload);
          }
          dequeue(op.id);
        } catch {
          const { dropped, opType, label } = incrementAttempts(op.id);
          if (dropped) {
            // Surface permanent failure — data could not be saved after max retries
            const what = opType === 'upsert_patient'
              ? `Patient record${label ? ` for ${label}` : ''}`
              : 'An offline change';
            toast.error(`${what} could not be saved after repeated attempts. Please re-enter the data.`);
          }
        }
      }

      // Count ALL remaining ops (including those still in backoff)
      const remaining = getRetryableQueue().length;
      if (remaining === 0) {
        toast.success('All offline changes synced');
        fetchActivePatients(user?.unit, hospitalIdRef.current)
          .then(data => {
            const enriched = enrichPatientData(data);
            setPatients(enriched);
            saveActiveCache(data);
            setIsStale(false);
            setCacheTimestamp(null);
          })
          .catch(() => {/* stay on current state */});
      } else {
        toast.warning(`${remaining} change${remaining > 1 ? 's' : ''} couldn't sync. Will retry later.`);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // ─── Supabase Realtime with Exponential-Backoff Reconnection ───
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let destroyed = false;
    let retryTimer: ReturnType<typeof setTimeout>;
    let retryDelay = 2000;

    const connect = () => {
      // hospital_id filter pushes server-side scoping — only events for this
      // hospital are delivered, preventing cross-tenant realtime leakage.
      const hospitalFilter = user?.hospitalId
        ? `hospital_id=eq.${user.hospitalId}`
        : undefined;

      const ch = supabase
        .channel(`patients-realtime-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'patients', ...(hospitalFilter ? { filter: hospitalFilter } : {}) },
          async (payload) => {
            // Secondary unit-scoped client-side filter (belt-and-suspenders)
            const userUnit = user?.unit;
            if (payload.eventType === 'INSERT') {
              const newPatient = parsePatientRow(payload.new);
              if (userUnit && newPatient.unit !== userUnit) return;
              setPatients(prev => {
                if (prev.some(p => p.ipNo === newPatient.ipNo)) return prev;
                const next = enrichPatientData([newPatient, ...prev]);
                debouncedSaveActiveCache(next);
                return next;
              });
            } else if (payload.eventType === 'UPDATE') {
              const ipNo = (payload.new as { ip_no?: string })?.ip_no;
              const rowUnit = (payload.new as { unit?: string })?.unit;
              if (userUnit && rowUnit && rowUnit !== userUnit) return;
              if (ipNo) {
                const fromPayload = parsePatientRow(payload.new);
                setPatients(prev => {
                  const next = enrichPatientData(
                    prev.map(p => {
                      if (p.ipNo !== fromPayload.ipNo) return p;
                      return {
                        ...fromPayload,
                        labResults:     p.labResults,
                        investigations: p.investigations,
                        dailyRounds:    p.dailyRounds,
                        vitals:         p.vitals,
                      };
                    }),
                  );
                  debouncedSaveActiveCache(next);
                  return next;
                });
              }
            } else if (payload.eventType === 'DELETE') {
              const deletedIpNo = (payload.old as { ip_no?: string })?.ip_no;
              if (deletedIpNo) {
                setPatients(prev => {
                  const next = prev.filter(p => p.ipNo !== deletedIpNo);
                  debouncedSaveActiveCache(next);
                  return next;
                });
              }
            }
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            retryDelay = 2000; // reset backoff on success
          }
          if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !destroyed) {
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

    connect();

    return () => {
      destroyed = true;
      clearTimeout(retryTimer);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  // ─── Load More (next page of active patients) ───
  const loadMorePatients = useCallback(async () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const { patients: data, hasMore: more } = await fetchActivePatientsPage(
        user?.unit, nextPage, PATIENT_PAGE_SIZE,
      );
      const enriched = enrichPatientData(data);
      setPatients(prev => {
        // Deduplicate in case a realtime event already added some rows
        const existingIds = new Set(prev.map(p => p.ipNo));
        const newOnes = enriched.filter(p => !existingIds.has(p.ipNo));
        const combined = [...prev, ...newOnes];
        saveActiveCache(combined);
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
  }, [hasMore, isLoadingMore, currentPage, user?.unit]);

  // ─── Load All Patients (lazy — Master/Discharge views) ───
  const loadAllPatients = useCallback(async () => {
    if (hasLoadedAll) return;

    // Serve all-patients cache immediately if available
    const cached = loadAllCache();
    if (cached) {
      setPatients(enrichPatientData(cached.patients));
      setIsStale(true);
      setCacheTimestamp(cached.cachedAt);
    }

    try {
      const data = await fetchAllPatients(user?.unit);
      const enriched = enrichPatientData(data);
      setPatients(enriched);
      saveAllCache(data);
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
    setPatients(prev => {
      const next = enrichPatientData(
        prev.map(p => p.ipNo === updatedPatient.ipNo ? updatedPatient : p),
      );
      saveActiveCache(next);
      return next;
    });
    const isDischarge = updatedPatient.patientStatus === 'Discharged';
    upsertPatient(updatedPatient)
      .then(() => { toast.success(`${updatedPatient.name} updated`); if (isDischarge) hapticSuccess(); })
      .catch(err => {
        console.error('[Patients] updatePatient failed:', err);
        if (err instanceof Error && err.message.startsWith('CONCURRENT_EDIT:')) {
          // Fetch the remote version so the user can compare and decide
          fetchPatientById(updatedPatient.ipNo, user?.hospitalId).then(remote => {
            if (remote) {
              setConcurrentEditConflict({ localPatient: updatedPatient, remotePatient: remote });
            } else {
              toast.error(`${updatedPatient.name} was modified by another user. Reload to see latest.`);
            }
          }).catch(() => {
            toast.error(`${updatedPatient.name} was modified by another user. Reload to see latest.`);
          });
          return; // do NOT enqueue a stale overwrite
        }
        if (isAuthError(err)) {
          toast.error('Session expired — please log in again.');
          return; // do NOT enqueue; op will fail again after re-login when user re-submits
        }
        enqueue('upsert_patient', updatedPatient);
        toast.warning('Saved locally — will sync when online.');
      });
    if (user) {
      logAuditEvent(user.id, user.name, 'UPDATE', 'patient', updatedPatient.ipNo,
        `Updated: ${updatedPatient.name} (Bed ${updatedPatient.bed})`);
    }
  }, [user]);

  const addPatient = useCallback((patient: Patient) => {
    const p = {
      ...patient,
      name:      sanitizeInput(patient.name),
      diagnosis: sanitizeInput(patient.diagnosis),
      procedure: patient.procedure ? sanitizeInput(patient.procedure) : undefined,
    };
    setPatients(prev => {
      const next = enrichPatientData([p, ...prev]);
      saveActiveCache(next);
      return next;
    });
    upsertPatient(p)
      .then(() => { toast.success(`${p.name} admitted to Bed ${p.bed}`); hapticSuccess(); })
      .catch(err => {
        console.error('[Patients] addPatient failed:', err);
        if (isAuthError(err)) {
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
      saveActiveCache(next);
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
      saveActiveCache(next);
      return next;
    });
    insertLab(patientId, result).catch(err => {
      console.error('[Patients] addLabResult sync failed:', err);
      enqueue('insert_lab', { patientId, result });
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
      saveActiveCache(next);
      return next;
    });
    insertImaging(patientId, inv).catch(err => {
      console.error('[Patients] addInvestigation sync failed:', err);
      enqueue('insert_imaging', { patientId, inv });
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
      saveActiveCache(next);
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
      saveActiveCache(next);
      return next;
    });
    // Persist to normalized rounds table
    upsertRound(patientIpNo, user?.hospitalId, round).catch(err => {
      console.error('[Patients] saveRound sync failed:', err);
      toast.error('Round note may not have synced — check your connection.');
    });
    if (user) {
      logAuditEvent(user.id, user.name, 'CREATE', 'round', patientIpNo,
        `Round note saved for ${round.date}`);
    }
  }, [user]);

  const addVitalSign = useCallback(async (patientIpNo: string, vital: Omit<VitalSigns, 'id'>) => {
    // Write to normalized table first so we get the server-generated UUID
    const created = await insertVital(patientIpNo, user?.hospitalId, vital);
    // Optimistic local update
    setPatients(prev => {
      const next = prev.map(p =>
        p.ipNo !== patientIpNo ? p
          : { ...p, vitals: [created, ...(p.vitals ?? [])] },
      );
      saveActiveCache(next);
      return next;
    });
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
      // Force-save: strip updatedAt to bypass the optimistic-lock check
      const forced = { ...localPatient, updatedAt: undefined };
      upsertPatient(forced)
        .then(() => toast.success(`${forced.name} saved (overwrite).`))
        .catch(() => toast.error('Force-save failed. Please try again.'));
    } else {
      // Keep remote: update local state to the server's version
      setPatients(prev => {
        const next = enrichPatientData(
          prev.map(p => p.ipNo === remotePatient.ipNo ? remotePatient : p),
        );
        saveActiveCache(next);
        return next;
      });
      toast.success(`Showing latest version of ${remotePatient.name}.`);
    }
  }, [concurrentEditConflict]);

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
  }), [
    patients, isLoadingPatients, isStale, cacheTimestamp,
    hasMore, isLoadingMore, loadMorePatients,
    hasLoadedAll, loadAllPatients, updatePatient, addPatient, deletePatient,
    addLabResult, addInvestigation, deleteInvestigation, getPatient,
    saveRound, addVitalSign, concurrentEditConflict, resolveConcurrentEdit,
  ]);

  return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>;
};
