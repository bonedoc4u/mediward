import { supabase } from '../lib/supabase';

export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';
export type IncidentSeverity = 'minor' | 'major' | 'critical';

export interface IncidentUpdate {
  time: string;   // ISO timestamp
  message: string;
}

export interface StatusIncident {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  createdAt: string;
  resolvedAt?: string;
  description?: string;
  updates: IncidentUpdate[];
}

function rowToIncident(row: any): StatusIncident {
  return {
    id:          row.id,
    title:       row.title,
    status:      row.status,
    severity:    row.severity,
    createdAt:   row.created_at,
    resolvedAt:  row.resolved_at ?? undefined,
    description: row.description ?? undefined,
    updates:     (row.updates as IncidentUpdate[]) ?? [],
  };
}

/** Fetch recent incidents — public, no auth required. */
export async function fetchIncidents(limit = 30): Promise<StatusIncident[]> {
  const { data, error } = await supabase
    .from('status_incidents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(rowToIncident);
}

/** Create a new incident (superadmin only). */
export async function createIncident(
  title: string,
  severity: IncidentSeverity,
  status: IncidentStatus,
  description?: string,
): Promise<void> {
  const { error } = await supabase.from('status_incidents').insert({
    title, severity, status,
    description: description ?? null,
    updates: [],
  });
  if (error) throw error;
}

/** Update an existing incident's status (superadmin only). */
export async function updateIncidentStatus(
  id: string,
  status: IncidentStatus,
  updateMessage: string,
): Promise<void> {
  // Fetch current updates array first
  const { data, error: fetchErr } = await supabase
    .from('status_incidents')
    .select('updates')
    .eq('id', id)
    .single();
  if (fetchErr) throw fetchErr;

  const newUpdate: IncidentUpdate = { time: new Date().toISOString(), message: updateMessage };
  const updates = [...((data?.updates as IncidentUpdate[]) ?? []), newUpdate];

  const patch: Record<string, unknown> = { status, updates };
  if (status === 'resolved') patch.resolved_at = new Date().toISOString();

  const { error } = await supabase
    .from('status_incidents')
    .update(patch)
    .eq('id', id);
  if (error) throw error;
}

/** Delete an incident (superadmin only). */
export async function deleteIncident(id: string): Promise<void> {
  const { error } = await supabase.from('status_incidents').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Calculate uptime % for the past N days based on resolved incidents.
 * Unresolved incidents are assumed still ongoing (downtime continues).
 */
export function calcUptimePercent(incidents: StatusIncident[], days = 30): number {
  const windowStart = Date.now() - days * 24 * 60 * 60 * 1000;
  const windowMs = days * 24 * 60 * 60 * 1000;

  let downtimeMs = 0;
  for (const inc of incidents) {
    if (inc.severity === 'minor') continue; // minor = partial degradation, doesn't count as downtime
    const start = Math.max(new Date(inc.createdAt).getTime(), windowStart);
    const end = inc.resolvedAt
      ? new Date(inc.resolvedAt).getTime()
      : Date.now();
    if (end < windowStart) continue;
    downtimeMs += Math.max(0, end - start);
  }

  return Math.max(0, Math.min(100, ((windowMs - downtimeMs) / windowMs) * 100));
}
