/**
 * patientCache.ts
 * localStorage-based cache for patient data.
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
import { saveToStorage, loadFromStorage } from './persistence';

const ACTIVE_CACHE_KEY = 'patients_active_cache';
const ALL_CACHE_KEY    = 'patients_all_cache';

interface PatientCache {
  patients: Patient[];
  cachedAt: string; // ISO timestamp
}

// ─── Active patients cache (non-discharged, loaded at startup) ───

export function saveActiveCache(patients: Patient[]): void {
  saveToStorage<PatientCache>(ACTIVE_CACHE_KEY, {
    patients,
    cachedAt: new Date().toISOString(),
  });
}

export function loadActiveCache(): PatientCache | null {
  return loadFromStorage<PatientCache>(ACTIVE_CACHE_KEY);
}

// ─── All patients cache (loaded on Master/Discharge views) ───

export function saveAllCache(patients: Patient[]): void {
  saveToStorage<PatientCache>(ALL_CACHE_KEY, {
    patients,
    cachedAt: new Date().toISOString(),
  });
}

export function loadAllCache(): PatientCache | null {
  return loadFromStorage<PatientCache>(ALL_CACHE_KEY);
}

// ─── Helpers ───

/**
 * Returns a human-readable staleness string, e.g. "2 minutes ago".
 * Returns null if timestamp is invalid.
 */
export function formatCacheAge(cachedAt: string): string | null {
  const delta = Date.now() - new Date(cachedAt).getTime();
  if (isNaN(delta) || delta < 0) return null;

  const seconds = Math.floor(delta / 1000);
  if (seconds < 60)  return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)  return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
