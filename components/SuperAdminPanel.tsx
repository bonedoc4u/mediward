/**
 * SuperAdminPanel.tsx
 * Master control panel for the MediWard platform owner.
 * Tabs: Hospitals (approve/reject/suspend) | Invites (create/revoke)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Stethoscope, LogOut, RefreshCw, CheckCircle, XCircle,
  PauseCircle, PlayCircle, Clock, Building2, Users,
  AlertTriangle, Loader2, LayoutDashboard, KeyRound,
  Copy, Check, Trash2, Plus, Mail,
} from 'lucide-react';
import { useAuth } from '../contexts/AppContext';
import {
  fetchAllHospitals, approveHospital, rejectHospital,
  toggleSuspendHospital, HospitalRow,
} from '../services/superAdminService';
import {
  fetchInvites, createInvite, deleteInvite, Invite,
} from '../services/inviteService';
import { KERALA_COLLEGES, DEPARTMENT_OPTIONS } from '../utils/colleges';
import { toast } from '../utils/toast';
import ToastContainer from './ToastContainer';

// ─── Status badge ─────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    pending:   { label: 'Pending',   cls: 'bg-amber-100 text-amber-700 border-amber-200',  icon: <Clock className="w-3 h-3" /> },
    active:    { label: 'Active',    cls: 'bg-green-100 text-green-700 border-green-200',   icon: <CheckCircle className="w-3 h-3" /> },
    rejected:  { label: 'Rejected',  cls: 'bg-red-100 text-red-700 border-red-200',         icon: <XCircle className="w-3 h-3" /> },
    suspended: { label: 'Suspended', cls: 'bg-slate-100 text-slate-600 border-slate-200',  icon: <PauseCircle className="w-3 h-3" /> },
  };
  const s = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600 border-slate-200', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${s.cls}`}>
      {s.icon}{s.label}
    </span>
  );
};

// ─── Copy button ──────────────────────────────────────────────────────────────
const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="p-1.5 rounded hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
      title="Copy code"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const SuperAdminPanel: React.FC<{
  onSwitchToApp?: () => void;
  onViewWorkspace?: (id: string, name: string) => void;
}> = ({ onSwitchToApp, onViewWorkspace }) => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'hospitals' | 'invites'>('hospitals');

  // ── Hospitals state ────────────────────────────────────────────────────────
  const [hospitals, setHospitals] = useState<HospitalRow[]>([]);
  const [isLoadingHospitals, setIsLoadingHospitals] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadHospitals = useCallback(async () => {
    setIsLoadingHospitals(true);
    try {
      setHospitals(await fetchAllHospitals());
    } catch (err) {
      toast.error('Failed to load hospitals');
      console.error(err);
    } finally {
      setIsLoadingHospitals(false);
    }
  }, []);

  useEffect(() => { loadHospitals(); }, [loadHospitals]);

  const handleHospital = async (
    id: string,
    fn: () => Promise<void>,
    successMsg: string,
  ) => {
    setActionId(id);
    try {
      await fn();
      toast.success(successMsg);
      await loadHospitals();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setActionId(null);
    }
  };

  // ── Invites state ──────────────────────────────────────────────────────────
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [inviteCollege, setInviteCollege] = useState('');
  const [inviteDept, setInviteDept] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [lastCreatedCode, setLastCreatedCode] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    setIsLoadingInvites(true);
    try {
      setInvites(await fetchInvites());
    } catch (err) {
      toast.error('Failed to load invites');
      console.error(err);
    } finally {
      setIsLoadingInvites(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'invites') loadInvites();
  }, [activeTab, loadInvites]);

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCollege.trim() || !inviteDept.trim()) {
      toast.error('Select a college and department first.');
      return;
    }
    setIsCreating(true);
    try {
      const newInvite = await createInvite(inviteCollege.trim(), inviteDept.trim());
      setInvites(prev => [newInvite, ...prev]);
      setLastCreatedCode(newInvite.code);
      toast.success('Invite code created');
    } catch (err) {
      toast.error(String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteInvite = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteInvite(id);
      setInvites(prev => prev.filter(i => i.id !== id));
      if (lastCreatedCode && invites.find(i => i.id === id)?.code === lastCreatedCode) {
        setLastCreatedCode(null);
      }
      toast.success('Invite revoked');
    } catch (err) {
      toast.error(String(err));
    } finally {
      setDeletingId(null);
    }
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const pending = hospitals.filter(h => h.status === 'pending').length;
  const active  = hospitals.filter(h => h.status === 'active').length;

  const pendingInvites = invites.filter(i => !i.used).length;
  const usedInvites    = invites.filter(i => i.used).length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
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
            onClick={() => { setLastCreatedCode(null); activeTab === 'hospitals' ? loadHospitals() : loadInvites(); }}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${(isLoadingHospitals || isLoadingInvites) ? 'animate-spin' : ''}`} />
          </button>
          {onSwitchToApp && (
            <button
              onClick={onSwitchToApp}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" /> Clinical App
            </button>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Hospitals', value: hospitals.length,  icon: Building2,   cls: 'text-blue-600  bg-blue-50'   },
            { label: 'Pending Approval', value: pending,          icon: Clock,        cls: 'text-amber-600 bg-amber-50'  },
            { label: 'Active',           value: active,           icon: CheckCircle,  cls: 'text-green-600 bg-green-50'  },
            { label: 'Open Invites',     value: pendingInvites,   icon: KeyRound,     cls: 'text-purple-600 bg-purple-50'},
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

        {/* ── Pending alert ── */}
        {pending > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-amber-700 text-sm font-medium">
              {pending} hospital{pending > 1 ? 's are' : ' is'} awaiting your approval.
            </p>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 shadow-sm border border-slate-100 w-fit">
          <button
            onClick={() => setActiveTab('hospitals')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'hospitals'
                ? 'bg-slate-900 text-white'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Users className="w-4 h-4" /> Hospitals
            {pending > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{pending}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('invites')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === 'invites'
                ? 'bg-slate-900 text-white'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <KeyRound className="w-4 h-4" /> Invites
            {pendingInvites > 0 && (
              <span className="bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{pendingInvites}</span>
            )}
          </button>
        </div>

        {/* ════════════════════ HOSPITALS TAB ════════════════════ */}
        {activeTab === 'hospitals' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <h2 className="font-semibold text-slate-800">Registered Hospitals</h2>
            </div>

            {isLoadingHospitals ? (
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
                                        onClick={() => handleHospital(h.id, () => approveHospital(h.id), `"${h.name}" approved`)}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors"
                                      >
                                        <CheckCircle className="w-3.5 h-3.5" /> Approve
                                      </button>
                                      <button
                                        onClick={() => handleHospital(h.id, () => rejectHospital(h.id), `"${h.name}" rejected`)}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold rounded-lg transition-colors"
                                      >
                                        <XCircle className="w-3.5 h-3.5" /> Reject
                                      </button>
                                    </>
                                  )}
                                  {(h.status === 'active' || h.status === 'suspended') && (
                                    <>
                                      {h.status === 'active' && onViewWorkspace && (
                                        <button
                                          onClick={() => { onViewWorkspace(h.id, h.name); onSwitchToApp?.(); }}
                                          className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-bold rounded-lg transition-colors"
                                        >
                                          <LayoutDashboard className="w-3.5 h-3.5" /> View
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleHospital(h.id, () => toggleSuspendHospital(h.id, h.status), h.status === 'suspended' ? `"${h.name}" reactivated` : `"${h.name}" suspended`)}
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
                                    </>
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
        )}

        {/* ════════════════════ INVITES TAB ════════════════════ */}
        {activeTab === 'invites' && (
          <div className="space-y-6">

            {/* Create invite form */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="bg-purple-100 p-1.5 rounded-lg">
                  <Plus className="w-4 h-4 text-purple-600" />
                </div>
                <h2 className="font-semibold text-slate-800">Create New Invite</h2>
              </div>

              <form onSubmit={handleCreateInvite} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* College */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase">Medical College</label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        list="sa-kerala-colleges"
                        required
                        placeholder="Type or select college…"
                        value={inviteCollege}
                        onChange={e => setInviteCollege(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm"
                      />
                      <datalist id="sa-kerala-colleges">
                        {KERALA_COLLEGES.map(c => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                  </div>

                  {/* Department */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 uppercase">Department</label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        list="sa-departments"
                        required
                        placeholder="Type or select department…"
                        value={inviteDept}
                        onChange={e => setInviteDept(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm"
                      />
                      <datalist id="sa-departments">
                        {DEPARTMENT_OPTIONS.map(d => <option key={d} value={d} />)}
                      </datalist>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm rounded-lg transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-purple-600/20"
                >
                  {isCreating
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><KeyRound className="w-4 h-4" /> Generate Invite Code</>
                  }
                </button>
              </form>

              {/* Last created code banner */}
              {lastCreatedCode && (
                <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-purple-600 uppercase mb-2 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> Invite Code Created — Share this with the department admin
                  </p>
                  <div className="flex items-center gap-3">
                    <code className="text-xl font-mono font-bold text-purple-800 tracking-widest bg-white px-4 py-2 rounded-lg border border-purple-200">
                      {lastCreatedCode}
                    </code>
                    <CopyButton text={lastCreatedCode} />
                  </div>
                  <p className="text-[11px] text-purple-500 mt-2 flex items-center gap-1">
                    <Mail className="w-3 h-3" /> Send this code to the admin via WhatsApp or email. It can only be used once.
                  </p>
                </div>
              )}
            </div>

            {/* Invites list */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-slate-500" />
                  <h2 className="font-semibold text-slate-800">All Invites</h2>
                </div>
                <div className="flex gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />{pendingInvites} pending</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />{usedInvites} used</span>
                </div>
              </div>

              {isLoadingInvites ? (
                <div className="flex justify-center items-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                </div>
              ) : invites.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <KeyRound className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No invites yet. Create one above.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left">
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Code</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">College</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Department</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Created</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {invites.map(inv => (
                        <tr key={inv.id} className={`transition-colors ${inv.used ? 'opacity-50' : 'hover:bg-slate-50/60'}`}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1">
                              <code className="font-mono font-bold text-slate-700 tracking-wider">{inv.code}</code>
                              {!inv.used && <CopyButton text={inv.code} />}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-600 max-w-[200px] truncate" title={inv.college}>
                            {inv.college}
                          </td>
                          <td className="px-6 py-4 text-slate-600">
                            {inv.department}
                          </td>
                          <td className="px-6 py-4">
                            {inv.used ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border bg-slate-100 text-slate-500 border-slate-200">
                                <CheckCircle className="w-3 h-3" /> Used
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border bg-purple-100 text-purple-700 border-purple-200">
                                <Clock className="w-3 h-3" /> Pending
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-slate-500 text-xs">
                            {new Date(inv.createdAt).toLocaleDateString('en-IN', {
                              day: '2-digit', month: 'short', year: 'numeric',
                            })}
                          </td>
                          <td className="px-6 py-4">
                            {!inv.used && (
                              <button
                                onClick={() => handleDeleteInvite(inv.id)}
                                disabled={deletingId === inv.id}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                                title="Revoke invite"
                              >
                                {deletingId === inv.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <><Trash2 className="w-3.5 h-3.5" /> Revoke</>
                                }
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-6">
          MediWard Platform Admin · Logged in as {user?.email}
        </p>
      </div>

      <ToastContainer />
    </div>
  );
};

export default SuperAdminPanel;
