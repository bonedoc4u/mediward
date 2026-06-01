import React, { useState, useEffect } from 'react';
import { useConfig, useAuth } from '../../contexts/AppContext';
import { SpecialtyFieldGroup, SpecialtyField } from '../../types';
import { anonymizePatient, exportPatientData } from '../../services/patientService';
import { SPECIALTY_DISPLAY_NAMES } from '../../services/specialtyTemplates';
import { createIncident, updateIncidentStatus, deleteIncident, fetchIncidents, StatusIncident, IncidentSeverity, IncidentStatus } from '../../services/statusService';
import { getDeadLetterQueue, clearDeadLetterQueue, retryDeadLetterOp, DeadLetterOp } from '../../services/syncQueue';
import {
  Link2, Server, Globe, Radio, ShieldAlert, LayoutTemplate, UserX, Download,
  Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronUp, RotateCcw,
  CheckCircle2, AlertTriangle, XCircle, RefreshCw,
} from 'lucide-react';

// ─── DPDP Right-to-Erasure Panel ───
const DpdpErasurePanel: React.FC<{ hospitalId: string }> = ({ hospitalId }) => {
  const [ipNo, setIpNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleErase = async () => {
    if (!ipNo.trim()) return;
    if (!window.confirm(`Permanently anonymise ALL personal data for patient ${ipNo}? This cannot be undone.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await anonymizePatient(ipNo.trim(), hospitalId);
      setMsg({ ok: true, text: `Patient ${ipNo} — personal data anonymised per DPDP §13.` });
      setIpNo('');
    } catch (err: unknown) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Anonymisation failed.' });
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <UserX className="w-4 h-4 text-red-600" />
        <h2 className="font-bold text-slate-800">Patient Data Erasure (DPDP §13)</h2>
      </div>
      <div className="p-4 space-y-3 text-sm text-slate-700">
        <p className="text-xs text-slate-500">Right to erasure under the Digital Personal Data Protection Act, 2023. Anonymises name, mobile, ABHA ID, and all clinical notes for the specified patient. The anonymised record is retained for audit/billing continuity.</p>
        <div className="flex gap-2">
          <input type="text" value={ipNo} onChange={e => setIpNo(e.target.value)}
            placeholder="IP Number (e.g. IP/2024/1234)"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 outline-none" />
          <button onClick={handleErase} disabled={busy || !ipNo.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
            {busy ? 'Processing…' : 'Anonymise'}
          </button>
        </div>
        {msg && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-xs font-medium ${msg.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── DPDP Data Portability Panel ───
const DpdpPortabilityPanel: React.FC<{ hospitalId: string }> = ({ hospitalId }) => {
  const [ipNo, setIpNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleExport = async () => {
    if (!ipNo.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await exportPatientData(ipNo.trim(), hospitalId);
      setMsg({ ok: true, text: `Patient ${ipNo} data exported as JSON.` });
    } catch (err: unknown) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Export failed.' });
    } finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <Download className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-800">Patient Data Export (DPDP §16)</h2>
      </div>
      <div className="p-4 space-y-3 text-sm text-slate-700">
        <p className="text-xs text-slate-500">Right to data portability under the Digital Personal Data Protection Act, 2023. Downloads a complete JSON file of all data held for the specified patient.</p>
        <div className="flex gap-2">
          <input type="text" value={ipNo} onChange={e => setIpNo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleExport()}
            placeholder="IP Number (e.g. IP/2024/1234)"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none" />
          <button onClick={handleExport} disabled={busy || !ipNo.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
            <Download className="w-4 h-4" />
            {busy ? 'Exporting…' : 'Export JSON'}
          </button>
        </div>
        {msg && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-xs font-medium ${msg.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Advanced Settings panel ───
const AdvancedSettings: React.FC = () => {
  const { user } = useAuth();
  const { activeSpecialty, activeFieldGroups, templateOverride, saveTemplateOverride, resetTemplateOverride } = useConfig();
  const hospitalId = user?.hospitalId ?? '';

  // Department Template state
  const [editingTemplate, setEditingTemplate]     = useState(false);
  const [draftGroups, setDraftGroups]             = useState<SpecialtyFieldGroup[]>([]);
  const [savingTemplate, setSavingTemplate]       = useState(false);
  const [expandedGroups, setExpandedGroups]       = useState<Set<string>>(new Set());
  const [newGroupLabel, setNewGroupLabel]         = useState('');
  const [newFieldLabels, setNewFieldLabels]       = useState<Record<string, string>>({});

  useEffect(() => {
    if (editingTemplate) {
      setDraftGroups(JSON.parse(JSON.stringify(activeFieldGroups)));
      setExpandedGroups(new Set(activeFieldGroups.map(g => g.key)));
    }
  }, [editingTemplate, activeFieldGroups]);

  const toggleGroupExpand = (key: string) => {
    setExpandedGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const handleAddGroup = () => {
    const label = newGroupLabel.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/\s+/g, '_');
    if (draftGroups.some(g => g.key === key)) return;
    setDraftGroups(prev => [...prev, { key, label, fields: [] }]);
    setExpandedGroups(prev => new Set([...prev, key]));
    setNewGroupLabel('');
  };

  const handleAddField = (groupKey: string) => {
    const label = (newFieldLabels[groupKey] ?? '').trim();
    if (!label) return;
    const fieldKey = label.toLowerCase().replace(/\s+/g, '_');
    setDraftGroups(prev => prev.map(g =>
      g.key === groupKey
        ? { ...g, fields: [...g.fields, { key: fieldKey, label, type: 'text' as SpecialtyField['type'] }] }
        : g
    ));
    setNewFieldLabels(prev => ({ ...prev, [groupKey]: '' }));
  };

  const handleSaveTemplate = async () => {
    setSavingTemplate(true);
    try { await saveTemplateOverride(draftGroups); setEditingTemplate(false); }
    finally { setSavingTemplate(false); }
  };

  const handleResetTemplate = async () => {
    if (!window.confirm('Reset to system default template? Your customizations will be lost.')) return;
    await resetTemplateOverride();
    setEditingTemplate(false);
  };

  // Incident Management state
  const [incidents, setIncidents]         = useState<StatusIncident[]>([]);
  const [incLoading, setIncLoading]       = useState(false);
  const [incExpanded, setIncExpanded]     = useState(false);
  const [newIncTitle, setNewIncTitle]     = useState('');
  const [newIncSeverity, setNewIncSev]    = useState<IncidentSeverity>('minor');
  const [newIncStatus, setNewIncStatus]   = useState<IncidentStatus>('investigating');
  const [newIncDesc, setNewIncDesc]       = useState('');
  const [incSaving, setIncSaving]         = useState(false);
  const [updateMsg, setUpdateMsg]         = useState<Record<string, string>>({});

  const loadIncidents = async () => {
    setIncLoading(true);
    try { setIncidents(await fetchIncidents(20)); } finally { setIncLoading(false); }
  };

  const handleCreateIncident = async () => {
    if (!newIncTitle.trim()) return;
    setIncSaving(true);
    try {
      await createIncident(newIncTitle.trim(), newIncSeverity, newIncStatus, newIncDesc.trim() || undefined);
      setNewIncTitle(''); setNewIncDesc('');
      await loadIncidents();
    } finally { setIncSaving(false); }
  };

  const handleUpdateIncident = async (id: string, status: IncidentStatus) => {
    const msg = updateMsg[id]?.trim();
    if (!msg) return;
    await updateIncidentStatus(id, status, msg);
    setUpdateMsg(prev => ({ ...prev, [id]: '' }));
    await loadIncidents();
  };

  const handleDeleteIncident = async (id: string) => {
    if (!window.confirm('Delete this incident?')) return;
    await deleteIncident(id);
    await loadIncidents();
  };

  const INC_SEVERITY_COLORS: Record<IncidentSeverity, string> = {
    minor:    'bg-yellow-50 border-yellow-200 text-yellow-800',
    major:    'bg-orange-50 border-orange-200 text-orange-800',
    critical: 'bg-red-50   border-red-200   text-red-800',
  };

  // Dead-Letter Queue state
  const [dlqEntries, setDlqEntries] = useState<DeadLetterOp[]>(() => getDeadLetterQueue());
  const [dlqExpanded, setDlqExpanded] = useState(false);
  const refreshDlq = () => setDlqEntries(getDeadLetterQueue());

  return (
    <div className="space-y-6">

      {/* HIS Integration */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-slate-800">HIS / FHIR Integration</h2>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-slate-600">
            Connect MediWard to your Hospital Information System (HIS) or ABDM/NDHM FHIR server for patient
            data import/export. Leave blank if not configured.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">FHIR Server Base URL</label>
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-slate-400 shrink-0" />
                <input type="url" placeholder="https://fhir.yourhospital.in/R4"
                  className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  onChange={() => {/* Future: wire to hospitalConfig */}} />
              </div>
              <p className="text-xs text-slate-400 mt-1">HL7 FHIR R4 compatible endpoint. Used for patient import and ABHA linking.</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">ABDM Health Facility Registry ID</label>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                <input type="text" placeholder="IN0000000"
                  className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  onChange={() => {/* Future: wire to hospitalConfig */}} />
              </div>
              <p className="text-xs text-slate-400 mt-1">Your NHA Health Facility Registry identifier for ABHA / NDHM linkage.</p>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
            <p className="font-semibold mb-1">Integration status: Not configured</p>
            <p>Full HIS integration is available on the Pro plan. Contact <span className="font-semibold">support@mediward.in</span> to enable.</p>
          </div>
        </div>
      </div>

      {/* Department Template */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-800">Department Clinical Template</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${templateOverride ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
              {templateOverride ? 'Custom' : 'Default'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {templateOverride && !editingTemplate && (
              <button onClick={handleResetTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                <RotateCcw className="w-3.5 h-3.5" /> Reset to Default
              </button>
            )}
            {!editingTemplate ? (
              <button onClick={() => setEditingTemplate(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
                <Pencil className="w-3.5 h-3.5" /> Customize
              </button>
            ) : (
              <button onClick={() => setEditingTemplate(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            )}
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-slate-500">Active specialty:</span>
            <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold border border-indigo-100">
              {SPECIALTY_DISPLAY_NAMES[activeSpecialty] ?? activeSpecialty}
            </span>
            <span className="text-xs text-slate-400">(auto-detected from department)</span>
          </div>

          {!editingTemplate ? (
            <div className="space-y-2">
              {activeFieldGroups.map(group => (
                <div key={group.key} className="border border-slate-200 rounded-lg overflow-hidden">
                  <button onClick={() => toggleGroupExpand(group.key)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
                    <span className="text-sm font-semibold text-slate-700">{group.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{group.fields.length} fields</span>
                      {expandedGroups.has(group.key) ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>
                  {expandedGroups.has(group.key) && (
                    <div className="px-4 py-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {group.fields.map(f => (
                        <span key={f.key} className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded px-2 py-1">
                          {f.label} <span className="text-slate-400">({f.type})</span>
                        </span>
                      ))}
                      {group.fields.length === 0 && <span className="text-xs text-slate-400 col-span-3">No fields</span>}
                    </div>
                  )}
                </div>
              ))}
              {activeFieldGroups.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">No field groups configured.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {draftGroups.map(group => (
                <div key={group.key} className="border border-indigo-100 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50">
                    <button onClick={() => toggleGroupExpand(group.key)} className="shrink-0">
                      {expandedGroups.has(group.key) ? <ChevronUp className="w-4 h-4 text-indigo-400" /> : <ChevronDown className="w-4 h-4 text-indigo-400" />}
                    </button>
                    <input value={group.label}
                      onChange={e => setDraftGroups(prev => prev.map(g => g.key === group.key ? { ...g, label: e.target.value } : g))}
                      className="flex-1 text-sm font-semibold bg-transparent text-indigo-800 outline-none border-b border-indigo-200 focus:border-indigo-500" />
                    <span className="text-xs text-indigo-400">{group.fields.length} fields</span>
                    <button onClick={() => setDraftGroups(prev => prev.filter(g => g.key !== group.key))}
                      className="shrink-0 text-red-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {expandedGroups.has(group.key) && (
                    <div className="px-3 py-2 space-y-1.5">
                      {group.fields.map(field => (
                        <div key={field.key} className="flex items-center gap-2">
                          <span className="flex-1 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1">{field.label}</span>
                          <span className="text-[10px] text-slate-400 w-16 shrink-0">{field.type}</span>
                          <button onClick={() => setDraftGroups(prev => prev.map(g =>
                            g.key === group.key ? { ...g, fields: g.fields.filter(f => f.key !== field.key) } : g
                          ))} className="text-red-400 hover:text-red-600 shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 mt-1">
                        <input placeholder="Add field label..."
                          value={newFieldLabels[group.key] ?? ''}
                          onChange={e => setNewFieldLabels(prev => ({ ...prev, [group.key]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleAddField(group.key)}
                          className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                        <button onClick={() => handleAddField(group.key)} className="text-indigo-600 hover:text-indigo-800 shrink-0">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <input placeholder="New group name..."
                  value={newGroupLabel} onChange={e => setNewGroupLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
                  className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                <button onClick={handleAddGroup}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                  <Plus className="w-4 h-4" /> Add Group
                </button>
              </div>
              <div className="flex justify-end pt-2">
                <button onClick={handleSaveTemplate} disabled={savingTemplate}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                  <Save className="w-4 h-4" />
                  {savingTemplate ? 'Saving…' : 'Save Template'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Data Residency & Security */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-green-600" />
          <h2 className="font-bold text-slate-800">Data Residency &amp; Security</h2>
        </div>
        <div className="p-4 space-y-3 text-sm text-slate-700">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Data Region', value: 'Asia Pacific (Mumbai)', sub: 'ap-south-1 · AWS / Supabase India region', note: 'All patient data is stored within India, compliant with the DPDP Act, 2023.', color: 'green' },
              { label: 'Encryption', value: 'AES-256 at rest · TLS 1.3 in transit', note: 'Database-level encryption enforced by Supabase. All API traffic over HTTPS.', color: 'slate' },
              { label: 'Access Control', value: 'Row-Level Security (RLS)', note: 'Each hospital can only access its own data. Enforced at the database layer.', color: 'slate' },
              { label: 'Audit Trail', value: 'Full audit log enabled', note: 'Every create/update/delete/login action is logged with user, timestamp, and IP.', color: 'slate' },
            ].map(item => (
              <div key={item.label} className={`bg-${item.color}-50 border border-${item.color}-200 rounded-lg p-3`}>
                <p className={`font-semibold text-${item.color}-800 text-xs uppercase tracking-wide mb-1`}>{item.label}</p>
                <p className={`font-bold text-${item.color}-900`}>{item.value}</p>
                {item.sub && <p className={`text-xs text-${item.color}-700 mt-0.5`}>{item.sub}</p>}
                <p className={`text-xs text-${item.color}-600 mt-1`}>{item.note}</p>
              </div>
            ))}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <p className="font-semibold mb-0.5">Penetration Testing</p>
            <p>To request a security assessment or penetration test report, contact <span className="font-semibold">security@mediward.in</span>. SOC 2 Type II audit is planned for Q3 2026.</p>
          </div>
        </div>
      </div>

      {/* DPDP Data Rights */}
      <DpdpPortabilityPanel hospitalId={hospitalId} />
      <DpdpErasurePanel hospitalId={hospitalId} />

      {/* Incident Management */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button type="button"
          onClick={() => { setIncExpanded(v => !v); if (!incExpanded) loadIncidents(); }}
          className="w-full flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
          <Radio className="w-4 h-4 text-red-600" />
          <h2 className="font-bold text-slate-800">Incident Management</h2>
          <span className="text-xs text-slate-500 ml-1">· Public status page</span>
          <span className="ml-auto text-xs text-slate-400">{incExpanded ? '▲' : '▼'}</span>
        </button>

        {incExpanded && (
          <div className="p-4 space-y-5">
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Create New Incident</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Title</label>
                  <input type="text" placeholder="e.g. Elevated API response times"
                    value={newIncTitle} onChange={e => setNewIncTitle(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500 outline-none bg-white" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Severity</label>
                  <select value={newIncSeverity} onChange={e => setNewIncSev(e.target.value as IncidentSeverity)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-red-500 outline-none">
                    <option value="minor">Minor (partial degradation)</option>
                    <option value="major">Major (significant impact)</option>
                    <option value="critical">Critical (service down)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Initial Status</label>
                  <select value={newIncStatus} onChange={e => setNewIncStatus(e.target.value as IncidentStatus)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-red-500 outline-none">
                    <option value="investigating">Investigating</option>
                    <option value="identified">Identified</option>
                    <option value="monitoring">Monitoring</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Description (optional)</label>
                  <textarea rows={2} placeholder="Brief description visible on status page…"
                    value={newIncDesc} onChange={e => setNewIncDesc(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500 outline-none resize-none bg-white" />
                </div>
              </div>
              <button onClick={handleCreateIncident} disabled={incSaving || !newIncTitle.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors">
                <Plus className="w-4 h-4" /> {incSaving ? 'Creating…' : 'Create Incident'}
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Recent Incidents</p>
              {incLoading ? (
                <div className="h-16 bg-slate-100 rounded animate-pulse" />
              ) : incidents.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                  <CheckCircle2 className="w-4 h-4 shrink-0" /> No incidents on record.
                </div>
              ) : (
                incidents.map(inc => (
                  <div key={inc.id} className={`border rounded-xl p-3 space-y-2 ${INC_SEVERITY_COLORS[inc.severity]}`}>
                    <div className="flex items-start gap-2">
                      {inc.status === 'resolved'
                        ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                        : inc.severity === 'critical'
                          ? <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          : <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm">{inc.title}</span>
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-black/10">{inc.severity}</span>
                          <span className="text-[10px] font-semibold uppercase opacity-70">{inc.status}</span>
                        </div>
                        {inc.description && <p className="text-xs opacity-75 mt-0.5">{inc.description}</p>}
                        <p className="text-[10px] opacity-60 mt-1">
                          Started: {new Date(inc.createdAt).toLocaleString('en-IN')}
                          {inc.resolvedAt && ` · Resolved: ${new Date(inc.resolvedAt).toLocaleString('en-IN')}`}
                        </p>
                      </div>
                      <button onClick={() => handleDeleteIncident(inc.id)} className="p-1 hover:bg-black/10 rounded text-current opacity-50 hover:opacity-100 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {inc.status !== 'resolved' && (
                      <div className="flex gap-2 pt-1">
                        <input type="text" placeholder="Update message…"
                          value={updateMsg[inc.id] ?? ''}
                          onChange={e => setUpdateMsg(prev => ({ ...prev, [inc.id]: e.target.value }))}
                          className="flex-1 text-xs border border-current/30 rounded-lg px-2.5 py-1.5 bg-white/60 outline-none focus:bg-white" />
                        <select defaultValue={inc.status} id={`inc-status-${inc.id}`}
                          className="text-xs border border-current/30 rounded-lg px-2 py-1.5 bg-white/60 outline-none">
                          <option value="investigating">Investigating</option>
                          <option value="identified">Identified</option>
                          <option value="monitoring">Monitoring</option>
                          <option value="resolved">Resolved ✓</option>
                        </select>
                        <button
                          onClick={() => {
                            const sel = document.getElementById(`inc-status-${inc.id}`) as HTMLSelectElement;
                            handleUpdateIncident(inc.id, sel.value as IncidentStatus);
                          }}
                          disabled={!updateMsg[inc.id]?.trim()}
                          className="px-3 py-1.5 text-xs font-semibold bg-black/10 hover:bg-black/20 disabled:opacity-40 rounded-lg transition-colors">
                          Post
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dead-Letter Queue Viewer */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <button onClick={() => { setDlqExpanded(v => !v); refreshDlq(); }}
          className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors text-left">
          <div className="flex items-center gap-3">
            <div className="bg-red-100 p-2 rounded-lg"><XCircle className="w-5 h-5 text-red-600" /></div>
            <div>
              <h3 className="font-bold text-slate-800">Failed Sync Queue (Dead-Letter)</h3>
              <p className="text-xs text-slate-500 mt-0.5">Operations that permanently failed after {5} retries</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dlqEntries.length > 0 && (
              <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{dlqEntries.length}</span>
            )}
            {dlqExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </button>

        {dlqExpanded && (
          <div className="border-t border-slate-100 p-5 space-y-3">
            {dlqEntries.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg p-3">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                No failed operations — all syncs are healthy.
              </div>
            ) : (
              <>
                <div className="flex justify-end gap-2">
                  <button onClick={() => { clearDeadLetterQueue(); refreshDlq(); }}
                    className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
                    Clear All
                  </button>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {dlqEntries.map(op => {
                    const label = op.type === 'upsert_patient'
                      ? ((op.payload as Record<string, unknown>)?.name as string ?? (op.payload as Record<string, unknown>)?.ipNo as string ?? op.id)
                      : `${op.type} · ${op.id.slice(0, 8)}`;
                    return (
                      <div key={op.id} className="flex items-start justify-between gap-3 p-3 bg-red-50 border border-red-100 rounded-lg text-xs">
                        <div className="min-w-0">
                          <p className="font-semibold text-red-800 truncate">{label}</p>
                          <p className="text-red-600 mt-0.5">Reason: {op.reason}</p>
                          <p className="text-slate-500 mt-0.5">Failed: {new Date(op.failedAt).toLocaleString()}</p>
                        </div>
                        <button onClick={() => { retryDeadLetterOp(op.id); refreshDlq(); }}
                          className="shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                          <RefreshCw className="w-3 h-3" /> Retry
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

    </div>
  );
};

export default AdvancedSettings;
