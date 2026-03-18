/**
 * patientCache.ts
 * localStorage-based cache for patient data, scoped per hospital.
 *
 * Keys are prefixed with hospitalId so multiple hospitals on a shared
 * tablet can never read each other's cached patient data.
 *
 * Used for cache-first loading in PatientContext:
 *  1. On startup → serve cached patients instantly (no spinner)
 *  2. Background fetch from Supabase → overwrite cache on success
 *  3. On Supabase failure → keep serving cache with a staleness banner
 *
 * Storage estimate: ~60 patients × ~5 KB JSON ≈ 300 KB — well within
 * the 5–10 MB localStorage limit.
 */

import { Patient } from '../types';
import { saveToStorage, loadFromStorage, removeFromStorage } from './persistence';

const activeKey = (hospitalId: string) => `patients_active_cache_${hospitalId}`;
const allKey    = (hospitalId: string) => `patients_all_cache_${hospitalId}`;

interface PatientCache {
  patients: Patient[];
  cachedAt: string; // ISO timestamp
}

// ─── Active patients cache (non-discharged, loaded at startup) ───

export function saveActiveCache(patients: Patient[], hospitalId: string): void {
  saveToStorage<PatientCache>(activeKey(hospitalId), {
    patients,
    cachedAt: new Date().toISOString(),
  });
}

export function loadActiveCache(hospitalId: string): PatientCache | null {
  return loadFromStorage<PatientCache>(activeKey(hospitalId));
}

// ─── All patients cache (loaded on Master/Discharge views) ───

export function saveAllCache(patients: Patient[], hospitalId: string): void {
  saveToStorage<PatientCache>(allKey(hospitalId), {
    patients,
    cachedAt: new Date().toISOString(),
  });
}

export function loadAllCache(hospitalId: string): PatientCache | null {
  return loadFromStorage<PatientCache>(allKey(hospitalId));
}

/** Clear all patient caches for a specific hospital (call on logout). */
export function clearPatientCache(hospitalId: string): void {
  removeFromStorage(activeKey(hospitalId));
  removeFromStorage(allKey(hospitalId));
}

// ─── Helpers ───

/**
 * Returns a human-readable staleness string, e.g. "2 minutes ago".
 * Returns null if timestamp is invalid.
 */
export function formatCacheAge(cachedAt: string): string | null {
  const delta = Date.now() - new Date(cachedAt).getTime();
  if (isNaN(delta)) return null;
  // Tolerate up to 30 s of clock skew (device clock ahead of server)
  if (delta < 0 && delta > -30_000) return 'just now';
  if (delta < 0) return null;

  const seconds = Math.floor(delta / 1000);
  if (seconds < 60)  return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)  return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
