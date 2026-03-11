// ─── Persistence Layer ───
// localStorage (synchronous, fast) + Capacitor Preferences (durable iOS fallback)
//
// iOS WKWebView can evict localStorage under memory pressure.
// Critical keys (session, patient-cache) are written through to @capacitor/preferences
// (backed by NSUserDefaults) so they survive memory purges.
//
// API surface is identical to before — callers do not need to change.

import { Preferences } from '@capacitor/preferences';

const STORAGE_PREFIX = 'mediward_';
const SCHEMA_VERSION = 1;

// Keys that must survive iOS memory pressure — written to Capacitor Preferences too
const DURABLE_KEYS = new Set(['session', 'patients_cache']);

interface StorageEnvelope<T> {
  version: number;
  timestamp: string;
  data: T;
}

function getKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

function makeEnvelope<T>(data: T): StorageEnvelope<T> {
  return { version: SCHEMA_VERSION, timestamp: new Date().toISOString(), data };
}

function unwrapEnvelope<T>(raw: string, key: string): T | null {
  try {
    const envelope: StorageEnvelope<T> = JSON.parse(raw);
    if (envelope.version !== SCHEMA_VERSION) {
      console.warn(`[Persistence] Schema version mismatch for "${key}". Expected ${SCHEMA_VERSION}, got ${envelope.version}`);
    }
    return envelope.data;
  } catch {
    return null;
  }
}

// ─── Sync localStorage (primary path) ───────────────────────────────────────

export function saveToStorage<T>(key: string, data: T): boolean {
  try {
    const serialized = JSON.stringify(makeEnvelope(data));
    localStorage.setItem(getKey(key), serialized);

    // Durable keys also go to Capacitor Preferences (async, non-blocking)
    if (DURABLE_KEYS.has(key)) {
      Preferences.set({ key: getKey(key), value: serialized }).catch(() => {/* web — no-op */});
    }

    return true;
  } catch (err) {
    console.error(`[Persistence] Failed to save "${key}":`, err);
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      try {
        const auditKey = getKey('audit_log');
        const raw = localStorage.getItem(auditKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 100) {
            parsed.data = parsed.data.slice(-50);
            localStorage.setItem(auditKey, JSON.stringify(parsed));
            const serialized2 = JSON.stringify(makeEnvelope(data));
            localStorage.setItem(getKey(key), serialized2);
            if (DURABLE_KEYS.has(key)) {
              Preferences.set({ key: getKey(key), value: serialized2 }).catch(() => {});
            }
            return true;
          }
        }
      } catch { /* ignore */ }
    }
    return false;
  }
}

export function loadFromStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(getKey(key));
    if (raw) return unwrapEnvelope<T>(raw, key);
    return null;
  } catch (err) {
    console.error(`[Persistence] Failed to load "${key}":`, err);
    return null;
  }
}

export function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(getKey(key));
    if (DURABLE_KEYS.has(key)) {
      Preferences.remove({ key: getKey(key) }).catch(() => {});
    }
  } catch (err) {
    console.error(`[Persistence] Failed to remove "${key}":`, err);
  }
}

export function clearAllStorage(): void {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
    keys.forEach(k => localStorage.removeItem(k));
    // Also clear durable keys from Preferences
    DURABLE_KEYS.forEach(k => {
      Preferences.remove({ key: getKey(k) }).catch(() => {});
    });
  } catch (err) {
    console.error(`[Persistence] Failed to clear storage:`, err);
  }
}

export function getStorageUsage(): { used: string; items: number } {
  let totalSize = 0;
  let count = 0;
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(STORAGE_PREFIX)) {
      totalSize += (localStorage.getItem(key) || '').length * 2; // UTF-16
      count++;
    }
  }
  const kb = (totalSize / 1024).toFixed(1);
  return { used: `${kb} KB`, items: count };
}

// ─── iOS recovery: call once on app start ────────────────────────────────────
// If localStorage was purged by iOS, restore durable keys from Capacitor Preferences.
// Must be called BEFORE reading session (before React tree mounts).

export async function recoverDurableStorage(): Promise<void> {
  for (const k of DURABLE_KEYS) {
    const storageKey = getKey(k);
    if (localStorage.getItem(storageKey) !== null) continue; // already present
    try {
      const { value } = await Preferences.get({ key: storageKey });
      if (value) {
        localStorage.setItem(storageKey, value);
      }
    } catch { /* web environment — Preferences not available */ }
  }
}
