import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Shield, Trash2, Edit2, Eye, EyeOff, Save, X, KeyRound, Loader2
} from 'lucide-react';
import { useApp, useConfig } from '../contexts/AppContext';
import { StoredUser, UserRole } from '../types';
import { ROLE_LABELS, ROLE_ACCESS_DESC, ROLE_COLORS } from '../utils/permissions';
import {
  fetchAllUsers, upsertAppUser, removeAppUser, createAuthUser
} from '../services/userService';
import { hashPassword } from '../utils/crypto';

const ALL_ROLES = Object.keys(ROLE_LABELS) as UserRole[];

interface AddFormState {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  unit: string;
}

const BLANK_FORM: AddFormState = { name: '', email: '', password: '', role: 'resident', unit: '' };

const TeamManagement: React.FC = () => {
  const { user } = useApp();
  const { unitOptions } = useConfig();

  const [users, setUsers] = useState<StoredUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<AddFormState>(BLANK_FORM);
  const [showPw, setShowPw] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('resident');
  const [editUnit, setEditUnit] = useState<string>('');

  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [showResetPw, setShowResetPw] = useState(false);

  const isAdmin = user?.role === 'admin';

  // ─── Load users from Supabase ───
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllUsers();
      setUsers(data);
    } catch (err) {
      console.error('[Supabase] fetchAllUsers failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin, loadUsers]);

  // ─── Add User ───
  const handleAdd = async () => {
    setFormError('');
    if (!form.name.trim()) return setFormError('Full name is required.');
    if (!form.email.trim() || !form.email.includes('@')) return setFormError('Valid email is required.');
    if (form.password.length < 6) return setFormError('Password must be at least 6 characters.');
    if (users.some(u => u.email.toLowerCase() === form.email.toLowerCase()))
      return setFormError('A user with this email already exists.');

    setSaving(true);
    try {
      const errMsg = await createAuthUser(
        form.email.trim().toLowerCase(),
        form.password,
        form.name.trim(),
        form.role,
        undefined,
        form.unit || undefined,
        user?.hospitalId,
      );
      if (errMsg) {
        setFormError(errMsg);
        return;
      }
      // Reload user list to get the new entry with correct Supabase Auth ID
      await loadUsers();
      setForm(BLANK_FORM);
      setShowAddForm(false);
    } catch (err) {
      setFormError('Failed to create user. Please try again.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Save Role + Unit Change ───
  const handleSaveRole = async (userId: string) => {
    const target = users.find(u => u.id === userId);
    if (!target) return;
    const updated = { ...target, role: editRole, unit: editUnit || undefined };
    try {
      await upsertAppUser(updated);
      setUsers(prev => prev.map(u => u.id === userId ? updated : u));
      setEditingId(null);
    } catch (err) {
      console.error('[Supabase] role/unit update failed:', err);
    }
  };

  // ─── Remove User ───
  const handleRemove = async (userId: string) => {
    if (userId === user?.id) return;
    if (!confirm('Remove this user? They will no longer be able to log in.')) return;
    try {
      await removeAppUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      console.error('[Supabase] removeAppUser failed:', err);
    }
  };

  // ─── Reset Password ───
  const handleResetPassword = async (userId: string) => {
    if (resetPw.length < 6) return;
    const target = users.find(u => u.id === userId);
    if (!target) return;
    try {
      const hash = await hashPassword(resetPw);
      const updated = { ...target, passwordHash: hash };
      await upsertAppUser(updated);
      setUsers(prev => prev.map(u => u.id === userId ? updated : u));
      setResetId(null);
      setResetPw('');
    } catch (err) {
      console.error('[Supabase] password reset failed:', err);
    }
  };

  // ─── Guard ───
  if (!isAdmin) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-10 text-center">
        <Shield className="w-10 h-10 text-yellow-500 mx-auto mb-3" />
        <h3 className="font-bold text-yellow-800 text-lg">Admin Access Required</h3>
        <p className="text-sm text-yellow-700 mt-1">Only administrators can manage team members and access levels.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span className="text-sm">Loading users from Supabase…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Access Level Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ALL_ROLES.map(role => (
          <div key={role} className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ROLE_COLORS[role]}`}>
              {ROLE_LABELS[role]}
            </span>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">{ROLE_ACCESS_DESC[role]}</p>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{users.length} user{users.length !== 1 ? 's' : ''} have access to this system</p>
        <button
          onClick={() => { setShowAddForm(v => !v); setForm(BLANK_FORM); setFormError(''); }}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {showAddForm ? <X className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          {showAddForm ? 'Cancel' : 'Add User'}
        </button>
      </div>

      {/* ─── Add User Form ─── */}
      {showAddForm && (
        <div className="bg-white border border-blue-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-600" /> New User
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Full Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(v => ({ ...v, name: e.target.value }))}
                placeholder="Dr. Jane Smith"
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(v => ({ ...v, email: e.target.value }))}
                placeholder="jane.smith@hospital.com"
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Password *</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(v => ({ ...v, password: e.target.value }))}
                  placeholder="Min. 6 characters"
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm pr-10 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Access Level *</label>
              <select
                value={form.role}
                onChange={e => setForm(v => ({ ...v, role: e.target.value as UserRole }))}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
              >
                {ALL_ROLES.map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]} — {ROLE_ACCESS_DESC[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Unit</label>
              <select
                value={form.unit}
                onChange={e => setForm(v => ({ ...v, unit: e.target.value }))}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
              >
                <option value="">— No unit (Admin / ICU — sees all) —</option>
                {unitOptions.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                Users with a unit only see their unit's patients. Leave blank for full access.
              </p>
            </div>
          </div>
          {formError && (
            <p className="text-red-600 text-xs mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
          )}
          <div className="mt-5 flex gap-3 justify-end">
            <button onClick={() => { setShowAddForm(false); setForm(BLANK_FORM); setFormError(''); }}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              Cancel
            </button>
            <button onClick={handleAdd} disabled={saving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </div>
      )}

      {/* ─── User Table ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-500" />
          <span className="font-semibold text-slate-700 text-sm">Current Users ({users.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Unit</th>
                <th className="px-6 py-3">What they can do</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(u => (
                <React.Fragment key={u.id}>
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">
                        {u.name}
                        {u.id === user?.id && (
                          <span className="ml-2 text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">you</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{u.email}</div>
                    </td>

                    <td className="px-6 py-4">
                      {editingId === u.id ? (
                        <select
                          value={editRole}
                          onChange={e => setEditRole(e.target.value as UserRole)}
                          className="p-1.5 border border-blue-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-200 outline-none"
                          autoFocus
                        >
                          {ALL_ROLES.map(r => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[u.role]}`}>
                          {ROLE_LABELS[u.role]}
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      {editingId === u.id ? (
                        <select
                          value={editUnit}
                          onChange={e => setEditUnit(e.target.value)}
                          className="p-1.5 border border-blue-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-200 outline-none"
                        >
                          <option value="">All units</option>
                          {unitOptions.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      ) : u.unit ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                          {u.unit}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">All units</span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-xs text-slate-500 max-w-xs">
                      {ROLE_ACCESS_DESC[editingId === u.id ? editRole : u.role]}
                    </td>

                    <td className="px-6 py-4 text-right">
                      {u.id === user?.id ? (
                        <span className="text-xs text-slate-400 flex items-center gap-1 justify-end">
                          <Shield className="w-3 h-3" /> Owner
                        </span>
                      ) : editingId === u.id ? (
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => handleSaveRole(u.id)}
                            className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg hover:bg-blue-700">
                            <Save className="w-3 h-3" /> Save
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 border border-slate-200 rounded-lg">
                            <X className="w-3 h-3" /> Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => { setEditingId(u.id); setEditRole(u.role); setEditUnit(u.unit ?? ''); }}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Change role / unit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setResetId(resetId === u.id ? null : u.id); setResetPw(''); }}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Reset password"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRemove(u.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove user"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Inline password reset row */}
                  {resetId === u.id && (
                    <tr className="bg-amber-50">
                      <td colSpan={4} className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <KeyRound className="w-4 h-4 text-amber-600 shrink-0" />
                          <span className="text-xs text-amber-700 font-medium">New password for {u.name}:</span>
                          <div className="relative flex-1 max-w-xs">
                            <input
                              type={showResetPw ? 'text' : 'password'}
                              value={resetPw}
                              onChange={e => setResetPw(e.target.value)}
                              placeholder="Min. 6 characters"
                              className="w-full p-2 border border-amber-300 rounded-lg text-xs pr-8 focus:ring-2 focus:ring-amber-200 outline-none"
                              autoFocus
                            />
                            <button type="button" onClick={() => setShowResetPw(v => !v)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                              {showResetPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <button
                            onClick={() => handleResetPassword(u.id)}
                            disabled={resetPw.length < 6}
                            className="flex items-center gap-1 text-xs bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700 disabled:opacity-40"
                          >
                            <Save className="w-3 h-3" /> Set Password
                          </button>
                          <button onClick={() => { setResetId(null); setResetPw(''); }}
                            className="text-slate-500 hover:text-slate-700">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TeamManagement;
