// ─── Persistence Layer ───
// Provides localStorage abstraction with versioning, compression, and error handling

const STORAGE_PREFIX = 'mediward_';
const SCHEMA_VERSION = 1;

interface StorageEnvelope<T> {
  version: number;
  timestamp: string;
  data: T;
}

function getKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

export function saveToStorage<T>(key: string, data: T): boolean {
  try {
    const envelope: StorageEnvelope<T> = {
      version: SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      data,
    };
    localStorage.setItem(getKey(key), JSON.stringify(envelope));
    return true;
  } catch (err) {
    console.error(`[Persistence] Failed to save "${key}":`, err);
    // Handle quota exceeded
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      // Try to clear old audit logs to free space
      try {
        const auditKey = getKey('audit_log');
        const raw = localStorage.getItem(auditKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 100) {
            parsed.data = parsed.data.slice(-50); // Keep last 50
            localStorage.setItem(auditKey, JSON.stringify(parsed));
            // Retry original save
            localStorage.setItem(getKey(key), JSON.stringify({
              version: SCHEMA_VERSION,
              timestamp: new Date().toISOString(),
              data,
            }));
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
    if (!raw) return null;

    const envelope: StorageEnvelope<T> = JSON.parse(raw);

    // Version migration could go here
    if (envelope.version !== SCHEMA_VERSION) {
      console.warn(`[Persistence] Schema version mismatch for "${key}". Expected ${SCHEMA_VERSION}, got ${envelope.version}`);
    }

    return envelope.data;
  } catch (err) {
    console.error(`[Persistence] Failed to load "${key}":`, err);
    return null;
  }
}

export function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(getKey(key));
  } catch (err) {
    console.error(`[Persistence] Failed to remove "${key}":`, err);
  }
}

export function clearAllStorage(): void {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
    keys.forEach(k => localStorage.removeItem(k));
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
