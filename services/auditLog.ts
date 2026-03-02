import { AuditEntry } from '../types';
import { saveToStorage, loadFromStorage } from './persistence';
import { supabase } from '../lib/supabase';

const AUDIT_KEY = 'audit_log';
const MAX_ENTRIES = 500;

export function getAuditLog(): AuditEntry[] {
  return loadFromStorage<AuditEntry[]>(AUDIT_KEY) || [];
}

export function logAuditEvent(
  userId: string,
  userName: string,
  action: AuditEntry['action'],
  entity: string,
  entityId: string,
  details: string
): void {
  const entry: AuditEntry = {
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substr(2, 12),
    timestamp: new Date().toISOString(),
    userId,
    userName,
    action,
    entity,
    entityId,
    details,
  };

  // Primary: write to Supabase (fire-and-forget — non-blocking)
  supabase.from('audit_log').insert({
    id:         entry.id,
    created_at: entry.timestamp,
    user_id:    entry.userId,
    user_name:  entry.userName,
    action:     entry.action,
    entity:     entry.entity,
    entity_id:  entry.entityId,
    details:    entry.details,
  }).then(({ error }) => {
    if (error) console.warn('[AuditLog] Supabase write failed, kept in localStorage:', error.message);
  });

  // Backup: also persist in localStorage (capped at MAX_ENTRIES)
  const log = getAuditLog();
  log.push(entry);
  const trimmed = log.length > MAX_ENTRIES ? log.slice(-MAX_ENTRIES) : log;
  saveToStorage(AUDIT_KEY, trimmed);
}

export function getAuditForEntity(entityId: string): AuditEntry[] {
  return getAuditLog().filter(e => e.entityId === entityId);
}

export function getRecentAudit(count: number = 50): AuditEntry[] {
  const log = getAuditLog();
  return log.slice(-count).reverse();
}

/** Fetch audit log from Supabase (newest first). Falls back to localStorage. */
export async function fetchAuditLog(limit = 200): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[AuditLog] Supabase fetch failed, using localStorage:', error.message);
    return getRecentAudit(limit);
  }

  return (data || []).map((row: {
    id: string; created_at: string; user_id: string; user_name: string;
    action: AuditEntry['action']; entity: string; entity_id: string; details: string;
  }) => ({
    id:        row.id,
    timestamp: row.created_at,
    userId:    row.user_id,
    userName:  row.user_name,
    action:    row.action,
    entity:    row.entity,
    entityId:  row.entity_id,
    details:   row.details,
  }));
}
