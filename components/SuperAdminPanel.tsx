/**
 * SuperAdminPanel.tsx
 * Master control panel for the MediWard platform owner.
 * Only accessible to users with role = 'superadmin'.
 *
 * Shows all registered hospitals with their status and lets the
 * super-admin approve, reject, or suspend them.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Stethoscope, LogOut, RefreshCw, CheckCircle, XCircle,
  PauseCircle, PlayCircle, Clock, Building2, Users,
  AlertTriangle, Loader2,
} from 'lucide-react';
import { useAuth } from '../contexts/AppContext';
import {
  fetchAllHospitals, approveHospital, rejectHospital,
  toggleSuspendHospital, HospitalRow,
} from '../services/superAdminService';
import { toast } from '../utils/toast';
import ToastContainer from './ToastContainer';

// ─── Status badge ─────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    pending:   { label: 'Pending',   cls: 'bg-amber-100 text-amber-700 border-amber-200',   icon: <Clock className="w-3 h-3" /> },
    active:    { label: 'Active',    cls: 'bg-green-100 text-green-700 border-green-200',    icon: <CheckCircle className="w-3 h-3" /> },
    rejected:  { label: 'Rejected',  cls: 'bg-red-100 text-red-700 border-red-200',          icon: <XCircle className="w-3 h-3" /> },
    suspended: { label: 'Suspended', cls: 'bg-slate-100 text-slate-600 border-slate-200',   icon: <PauseCircle className="w-3 h-3" /> },
  };
  const s = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600 border-slate-200', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${s.cls}`}>
      {s.icon}{s.label}
    </span>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const SuperAdminPanel: React.FC = () => {
  const { user, logout } = useAuth();
  const [hospitals, setHospitals] = useState<HospitalRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setHospitals(await fetchAllHospitals());
    } catch (err) {
      toast.error('Failed to load hospitals');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handle = async (
    id: string,
    fn: () => Promise<void>,
    successMsg: string,
  ) => {
    setActionId(id);
    try {
      await fn();
      toast.success(successMsg);
      await load();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setActionId(null);
    }
  };

  // ─── Stats ─────────────────────────────────────────────────────────────────
  const pending   = hospitals.filter(h => h.status === 'pending').length;
  const active    = hospitals.filter(h => h.status === 'active').length;
  const suspended = hospitals.filter(h => h.status === 'suspended').length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ─── Header ─── */}
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none">MediWard</h1>
            <p className="text-xs text-slate-400 mt-0.5">Super Admin Console</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400 hidden sm:block">{user?.name}</span>
          <button
            onClick={load}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* ─── Stats ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total',     value: hospitals.length, icon: Building2,   cls: 'text-blue-600  bg-blue-50'  },
            { label: 'Pending',   value: pending,          icon: Clock,        cls: 'text-amber-600 bg-amber-50' },
            { label: 'Active',    value: active,           icon: CheckCircle,  cls: 'text-green-600 bg-green-50' },
            { label: 'Suspended', value: suspended,        icon: PauseCircle,  cls: 'text-slate-500 bg-slate-100'},
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.cls}`}>
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-800">{s.value}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ─── Pending alert ─── */}
        {pending > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-amber-700 text-sm font-medium">
              {pending} hospital{pending > 1 ? 's are' : ' is'} awaiting your approval.
            </p>
          </div>
        )}

        {/* ─── Hospitals table ─── */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" />
            <h2 className="font-semibold text-slate-800">Registered Hospitals</h2>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : hospitals.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No hospitals registered yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Hospital</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Admin</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Plan</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Registered</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {hospitals.map(h => {
                    const isActing = actionId === h.id;
                    return (
                      <tr key={h.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-800">{h.name}</div>
                          {h.slug && <div className="text-xs text-slate-400">{h.slug}</div>}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-700">{h.adminName ?? '—'}</div>
                          <div className="text-xs text-slate-400">{h.adminEmail ?? '—'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600 uppercase">
                            {h.plan}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500">
                          {new Date(h.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={h.status} />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {isActing ? (
                              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                            ) : (
                              <>
                                {h.status === 'pending' && (
                                  <>
                                    <button
                                      onClick={() => handle(h.id, () => approveHospital(h.id), `"${h.name}" approved`)}
                                      className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors"
                                    >
                                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                                    </button>
                                    <button
                                      onClick={() => handle(h.id, () => rejectHospital(h.id), `"${h.name}" rejected`)}
                                      className="flex items-center gap-1 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold rounded-lg transition-colors"
                                    >
                                      <XCircle className="w-3.5 h-3.5" /> Reject
                                    </button>
                                  </>
                                )}
                                {(h.status === 'active' || h.status === 'suspended') && (
                                  <button
                                    onClick={() => handle(h.id, () => toggleSuspendHospital(h.id, h.status), h.status === 'suspended' ? `"${h.name}" reactivated` : `"${h.name}" suspended`)}
                                    className={`flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                                      h.status === 'suspended'
                                        ? 'bg-green-100 hover:bg-green-200 text-green-700'
                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                    }`}
                                  >
                                    {h.status === 'suspended'
                                      ? <><PlayCircle className="w-3.5 h-3.5" /> Reactivate</>
                                      : <><PauseCircle className="w-3.5 h-3.5" /> Suspend</>
                                    }
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          MediWard Platform Admin · Logged in as {user?.email}
        </p>
      </div>

      <ToastContainer />
    </div>
  );
};

export default SuperAdminPanel;
