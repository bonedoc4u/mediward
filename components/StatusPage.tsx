import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  fetchIncidents, calcUptimePercent,
  StatusIncident, IncidentSeverity, IncidentStatus,
} from '../services/statusService';
import {
  CheckCircle2, AlertTriangle, XCircle, RefreshCw,
  Clock, Stethoscope, ChevronLeft, Wifi, WifiOff,
} from 'lucide-react';

// ─── SLA config ─────────────────────────────────────────
const SLA_ITEMS = [
  { label: 'Monthly uptime target',      value: '99.5%' },
  { label: 'P1 (Critical) response SLA', value: '< 1 hour' },
  { label: 'P2 (Major) response SLA',    value: '< 4 hours' },
  { label: 'P3 (Minor) response SLA',    value: '< 8 hours' },
  { label: 'Scheduled maintenance',      value: 'Sun 2:00–4:00 AM IST' },
  { label: 'Data retention',             value: '7 years (ABDM compliant)' },
  { label: 'Data region',                value: 'Asia Pacific (Mumbai)' },
  { label: 'Encryption',                 value: 'AES-256 at rest · TLS 1.3 in transit' },
];

// ─── Helpers ────────────────────────────────────────────
type DbHealth = 'checking' | 'ok' | 'degraded' | 'down';

const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  minor:    'bg-yellow-50 border-yellow-200 text-yellow-800',
  major:    'bg-orange-50 border-orange-200 text-orange-800',
  critical: 'bg-red-50   border-red-200   text-red-800',
};
const SEVERITY_DOT: Record<IncidentSeverity, string> = {
  minor:    'bg-yellow-400',
  major:    'bg-orange-500',
  critical: 'bg-red-600',
};
const STATUS_LABEL: Record<IncidentStatus, string> = {
  investigating: 'Investigating',
  identified:    'Identified',
  monitoring:    'Monitoring',
  resolved:      'Resolved',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}
function fmtDuration(start: string, end?: string) {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Uptime bar (90 coloured segments, one per day) ─────
const UptimeBar: React.FC<{ incidents: StatusIncident[] }> = ({ incidents }) => {
  const days = 90;
  const segments: ('ok' | 'degraded' | 'down')[] = [];
  const now = Date.now();
  for (let d = days - 1; d >= 0; d--) {
    const dayStart = now - (d + 1) * 86_400_000;
    const dayEnd   = now - d * 86_400_000;
    const hasDown = incidents.some(i => {
      if (i.severity === 'minor') return false;
      const s = new Date(i.createdAt).getTime();
      const e = i.resolvedAt ? new Date(i.resolvedAt).getTime() : now;
      return s < dayEnd && e > dayStart;
    });
    const hasDeg = incidents.some(i => {
      if (i.severity !== 'minor') return false;
      const s = new Date(i.createdAt).getTime();
      const e = i.resolvedAt ? new Date(i.resolvedAt).getTime() : now;
      return s < dayEnd && e > dayStart;
    });
    segments.push(hasDown ? 'down' : hasDeg ? 'degraded' : 'ok');
  }
  return (
    <div>
      <div className="flex gap-0.5">
        {segments.map((s, i) => (
          <div
            key={i}
            className={`flex-1 h-8 rounded-sm ${
              s === 'down' ? 'bg-red-500' : s === 'degraded' ? 'bg-yellow-400' : 'bg-green-400'
            }`}
            title={`${days - i} days ago`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>90 days ago</span>
        <span>Today</span>
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────
const StatusPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [dbHealth, setDbHealth] = useState<DbHealth>('checking');
  const [latency, setLatency] = useState<number | null>(null);
  const [incidents, setIncidents] = useState<StatusIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState(new Date());

  const checkHealth = async () => {
    try {
      const t0 = Date.now();
      const { error } = await supabase.from('status_incidents').select('id').limit(1);
      const ms = Date.now() - t0;
      setLatency(ms);
      setDbHealth(error ? 'degraded' : ms > 3000 ? 'degraded' : 'ok');
    } catch {
      setDbHealth('down');
      setLatency(null);
    }
    setLastChecked(new Date());
  };

  const loadIncidents = async () => {
    try {
      const data = await fetchIncidents(50);
      setIncidents(data);
    } catch {
      // swallow — incidents might not exist yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    loadIncidents();
    const hInterval = setInterval(checkHealth, 60_000);
    return () => clearInterval(hInterval);
  }, []);

  const activeIncidents = incidents.filter(i => i.status !== 'resolved');
  const resolvedIncidents = incidents.filter(i => i.status === 'resolved');
  const uptime30 = calcUptimePercent(incidents, 30);

  // Overall status
  const overallStatus =
    dbHealth === 'down' ? 'down' :
    activeIncidents.some(i => i.severity === 'critical') ? 'down' :
    activeIncidents.some(i => i.severity === 'major') || dbHealth === 'degraded' ? 'degraded' :
    activeIncidents.length > 0 ? 'degraded' : 'ok';

  const STATUS_BANNER = {
    ok:       { bg: 'bg-green-50  border-green-200',  icon: CheckCircle2,    iconClass: 'text-green-600', text: 'All Systems Operational' },
    degraded: { bg: 'bg-yellow-50 border-yellow-200', icon: AlertTriangle,   iconClass: 'text-yellow-600', text: 'Partial System Degradation' },
    down:     { bg: 'bg-red-50    border-red-200',    icon: XCircle,         iconClass: 'text-red-600',   text: 'Service Disruption Detected' },
  }[overallStatus];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-slate-900 text-white px-4 py-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          aria-label="Back to login"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Stethoscope className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-sm">MediWard</span>
            <span className="ml-2 text-slate-400 text-sm">System Status</span>
          </div>
        </div>
        <button
          onClick={() => { checkHealth(); loadIncidents(); }}
          className="ml-auto p-2 hover:bg-white/10 rounded-lg transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Overall Status Banner */}
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${STATUS_BANNER.bg}`}>
          <STATUS_BANNER.icon className={`w-6 h-6 shrink-0 ${STATUS_BANNER.iconClass}`} />
          <div className="flex-1">
            <p className={`font-bold text-sm ${STATUS_BANNER.iconClass}`}>{STATUS_BANNER.text}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Last checked: {lastChecked.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              {latency !== null && <span className="ml-2">· API latency: {latency}ms</span>}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            {dbHealth === 'checking' ? (
              <span className="text-slate-400">Checking…</span>
            ) : dbHealth === 'ok' ? (
              <><Wifi className="w-4 h-4 text-green-600" /><span className="text-green-700">Connected</span></>
            ) : (
              <><WifiOff className="w-4 h-4 text-red-500" /><span className="text-red-700">Connectivity issue</span></>
            )}
          </div>
        </div>

        {/* Active Incidents */}
        {activeIncidents.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Active Incidents</h2>
            {activeIncidents.map(inc => (
              <div key={inc.id} className={`border rounded-xl p-4 ${SEVERITY_COLORS[inc.severity]}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${SEVERITY_DOT[inc.severity]}`} />
                  <span className="font-bold text-sm">{inc.title}</span>
                  <span className="ml-auto text-xs font-semibold uppercase tracking-wide opacity-70">{inc.severity}</span>
                </div>
                {inc.description && <p className="text-xs mt-1 opacity-80">{inc.description}</p>}
                <div className="flex items-center gap-3 mt-2 text-xs opacity-70">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Started {fmtDate(inc.createdAt)}</span>
                  <span>· {fmtDuration(inc.createdAt)} ongoing</span>
                  <span className="ml-auto font-semibold">{STATUS_LABEL[inc.status]}</span>
                </div>
                {inc.updates.length > 0 && (
                  <div className="mt-3 border-t border-current/20 pt-2 space-y-1">
                    {inc.updates.map((u, i) => (
                      <div key={i} className="text-xs">
                        <span className="opacity-60">{fmtDate(u.time)}</span>
                        <span className="ml-2">{u.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Uptime (30 days) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Uptime — Last 30 Days</h2>
            <span className={`text-lg font-black ${uptime30 >= 99.5 ? 'text-green-600' : uptime30 >= 99 ? 'text-yellow-600' : 'text-red-600'}`}>
              {uptime30.toFixed(2)}%
            </span>
          </div>
          {loading ? (
            <div className="h-8 bg-slate-100 rounded animate-pulse" />
          ) : (
            <UptimeBar incidents={incidents} />
          )}
          <div className="flex gap-4 mt-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-400 inline-block" />Operational</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-400 inline-block" />Degraded</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />Outage</span>
          </div>
        </div>

        {/* SLA Commitments */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">SLA Commitments</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {SLA_ITEMS.map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-slate-600">{label}</span>
                <span className="text-sm font-semibold text-slate-800">{value}</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-blue-50 border-t border-blue-100">
            <p className="text-xs text-blue-700">
              For SLA breach claims or support escalation, contact{' '}
              <span className="font-semibold">support@mediward.in</span> with your IP number and incident details.
            </p>
          </div>
        </div>

        {/* Incident History */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Incident History</h2>
          </div>
          {loading ? (
            <div className="p-6 space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />)}
            </div>
          ) : resolvedIncidents.length === 0 && activeIncidents.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No incidents recorded</p>
              <p className="text-xs text-slate-400 mt-1">All systems have been operating normally.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {resolvedIncidents.map(inc => (
                <div key={inc.id} className="px-5 py-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800">{inc.title}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          inc.severity === 'critical' ? 'bg-red-100 text-red-700' :
                          inc.severity === 'major'    ? 'bg-orange-100 text-orange-700' :
                                                        'bg-yellow-100 text-yellow-700'
                        }`}>{inc.severity}</span>
                      </div>
                      {inc.description && <p className="text-xs text-slate-500 mt-0.5">{inc.description}</p>}
                      <div className="text-xs text-slate-400 mt-1">
                        {fmtDate(inc.createdAt)}
                        {inc.resolvedAt && (
                          <> → Resolved in <span className="font-semibold text-green-700">{fmtDuration(inc.createdAt, inc.resolvedAt)}</span></>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 pb-4">
          MediWard · Powered by Supabase (ap-south-1) · Data stored in India
          <br />© {new Date().getFullYear()} MediWard. All rights reserved.
        </p>

      </div>
    </div>
  );
};

export default StatusPage;
