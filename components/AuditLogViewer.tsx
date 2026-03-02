import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { AuditEntry } from '../types';
import { can } from '../utils/permissions';
import { fetchAuditLog } from '../services/auditLog';
import { Shield, ShieldOff, RefreshCw, TrendingUp, Users, Trash2, Clock } from 'lucide-react';

type ActionFilter = 'ALL' | AuditEntry['action'];

const ACTION_FILTERS: ActionFilter[] = ['ALL', 'LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'VIEW'];

const ACTION_BADGE: Record<string, string> = {
  CREATE:  'bg-green-100 text-green-800 border-green-200',
  UPDATE:  'bg-blue-100 text-blue-800 border-blue-200',
  DELETE:  'bg-red-100 text-red-800 border-red-200',
  LOGIN:   'bg-slate-100 text-slate-700 border-slate-200',
  LOGOUT:  'bg-slate-100 text-slate-500 border-slate-200',
  EXPORT:  'bg-purple-100 text-purple-800 border-purple-200',
  VIEW:    'bg-sky-100 text-sky-700 border-sky-200',
};

const AuditLogViewer: React.FC = () => {
  const { user } = useApp();
  const [entries, setEntries]     = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [filter, setFilter]       = useState<ActionFilter>('ALL');

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAuditLog(300);
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() =>
    filter === 'ALL' ? entries : entries.filter(e => e.action === filter),
    [entries, filter]
  );

  const stats = useMemo(() => {
    const yesterday = Date.now() - 86_400_000;
    const todayCount = entries.filter(e => new Date(e.timestamp).getTime() > yesterday).length;
    const byAction: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    entries.forEach(e => {
      byAction[e.action] = (byAction[e.action] || 0) + 1;
      byUser[e.userName] = (byUser[e.userName] || 0) + 1;
    });
    const topUser = Object.entries(byUser).sort((a, b) => b[1] - a[1])[0];
    const maxCount = Math.max(...Object.values(byAction), 1);
    return { todayCount, total: entries.length, byAction, topUser, maxCount };
  }, [entries]);

  // ─── Access guard ───
  if (!can(user, 'team:manage')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
        <ShieldOff className="w-16 h-16 opacity-30" />
        <p className="text-lg font-semibold">Access Denied</p>
        <p className="text-sm">Only admins can view the audit log.</p>
      </div>
    );
  }

  return (
    <div>
      {/* ─── Analytics Stats Panel ─── */}
      {!isLoading && entries.length > 0 && (
        <div className="mb-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-3.5 h-3.5 text-blue-500" />
                <p className="text-xs text-blue-600 font-semibold uppercase">Last 24 h</p>
              </div>
              <p className="text-3xl font-bold text-blue-700">{stats.todayCount}</p>
              <p className="text-xs text-blue-400 mt-0.5">events</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                <p className="text-xs text-slate-500 font-semibold uppercase">Total Loaded</p>
              </div>
              <p className="text-3xl font-bold text-slate-700">{stats.total}</p>
              <p className="text-xs text-slate-400 mt-0.5">of last 300</p>
            </div>
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-3.5 h-3.5 text-purple-500" />
                <p className="text-xs text-purple-600 font-semibold uppercase">Most Active</p>
              </div>
              <p className="text-base font-bold text-purple-700 truncate">{stats.topUser?.[0] ?? '—'}</p>
              <p className="text-xs text-purple-400 mt-0.5">{stats.topUser?.[1] ?? 0} events</p>
            </div>
            <div className={`border rounded-xl p-4 ${(stats.byAction['DELETE'] ?? 0) > 0 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Trash2 className={`w-3.5 h-3.5 ${(stats.byAction['DELETE'] ?? 0) > 0 ? 'text-red-500' : 'text-slate-400'}`} />
                <p className={`text-xs font-semibold uppercase ${(stats.byAction['DELETE'] ?? 0) > 0 ? 'text-red-600' : 'text-slate-500'}`}>Deletions</p>
              </div>
              <p className={`text-3xl font-bold ${(stats.byAction['DELETE'] ?? 0) > 0 ? 'text-red-700' : 'text-slate-700'}`}>{stats.byAction['DELETE'] ?? 0}</p>
              <p className={`text-xs mt-0.5 ${(stats.byAction['DELETE'] ?? 0) > 0 ? 'text-red-400' : 'text-slate-400'}`}>records deleted</p>
            </div>
          </div>

          {/* Activity breakdown bars */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Activity Breakdown</p>
            <div className="space-y-2">
              {Object.entries(stats.byAction).sort((a, b) => b[1] - a[1]).map(([action, count]) => (
                <div key={action} className="flex items-center gap-3">
                  <span className="w-14 text-right text-xs font-semibold text-slate-500 shrink-0">{action}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        action === 'DELETE' ? 'bg-red-500'    :
                        action === 'CREATE' ? 'bg-green-500'  :
                        action === 'UPDATE' ? 'bg-blue-500'   :
                        action === 'LOGIN'  ? 'bg-slate-400'  :
                        action === 'EXPORT' ? 'bg-purple-500' : 'bg-slate-300'
                      }`}
                      style={{ width: `${Math.round((count / stats.maxCount) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 w-6 text-right shrink-0">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Header row ─── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-slate-500" />
          <span className="text-sm text-slate-500">
            {isLoading ? 'Loading…' : `${filtered.length} event${filtered.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        <button
          onClick={load}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ─── Action filter chips ─── */}
      <div className="flex flex-wrap gap-2 mb-5">
        {ACTION_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
              filter === f
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* ─── Error ─── */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* ─── Loading skeleton ─── */}
      {isLoading && (
        <div className="space-y-2">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* ─── Empty state ─── */}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <Shield className="w-12 h-12 opacity-20" />
          <p className="text-sm font-medium">No audit events found</p>
          {filter !== 'ALL' && (
            <button onClick={() => setFilter('ALL')} className="text-xs text-blue-500 hover:underline">
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* ─── Table ─── */}
      {!isLoading && filtered.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-44">Time</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Action</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-36">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-28">Entity</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(entry => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleString('en-IN', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${ACTION_BADGE[entry.action] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium truncate max-w-[140px]">
                      {entry.userName}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-500 text-xs">{entry.entity}</span>
                      {entry.entityId && (
                        <span className="ml-1 font-mono text-[10px] text-slate-400">#{entry.entityId.slice(0, 8)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{entry.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="md:hidden divide-y divide-slate-100">
            {filtered.map(entry => (
              <div key={entry.id} className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${ACTION_BADGE[entry.action] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                    {entry.action}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(entry.timestamp).toLocaleString('en-IN', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-sm font-medium text-slate-700">{entry.userName}</p>
                <p className="text-xs text-slate-500 mt-0.5">{entry.details}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Footer count ─── */}
      {!isLoading && filtered.length > 0 && (
        <p className="text-center text-xs text-slate-400 mt-4">
          Showing {filtered.length} of up to 300 most recent events
        </p>
      )}
    </div>
  );
};

export default AuditLogViewer;
