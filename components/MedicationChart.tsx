/**
 * MedicationChart.tsx
 * Medication Administration Record (MAR) for a single patient.
 * Residents add/stop prescriptions; nurses mark doses as given/held/refused.
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AppContext';
import { PrescribedMedication, MedAdministration, MedAdminStatus, MedRoute } from '../types';
import { fetchMedications, addMedicationPrescription, stopMedication, recordAdministration, fetchAdministrations } from '../services/marService';
import { Plus, X, CheckCircle2, Clock, AlertCircle, XCircle, Pill, Save } from 'lucide-react';

const ROUTES: MedRoute[] = ['Oral','IV','IM','SC','Topical','Inhaled','PR','SL'];
const FREQUENCIES = ['Once daily','Twice daily','Three times daily','Four times daily','Every 6h','Every 8h','Every 12h','Once (stat)','At bedtime','As needed (PRN)'];

const STATUS_CONFIG: Record<MedAdminStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: 'Due',     color: 'bg-blue-50 text-blue-700 border-blue-200',    icon: <Clock className="w-3.5 h-3.5" /> },
  given:    { label: 'Given',   color: 'bg-green-50 text-green-700 border-green-200', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  held:     { label: 'Held',    color: 'bg-amber-50 text-amber-700 border-amber-200', icon: <AlertCircle className="w-3.5 h-3.5" /> },
  refused:  { label: 'Refused', color: 'bg-red-50 text-red-700 border-red-200',      icon: <XCircle className="w-3.5 h-3.5" /> },
  not_due:  { label: 'Not Due', color: 'bg-slate-50 text-slate-500 border-slate-200', icon: null },
};

interface Props {
  patientIpNo: string;
  hospitalId: string;
}

const MedicationChart: React.FC<Props> = ({ patientIpNo, hospitalId }) => {
  const { user } = useAuth();
  const [medications, setMedications] = useState<PrescribedMedication[]>([]);
  const [admins, setAdmins] = useState<MedAdministration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().split('T')[0];

  const [newMed, setNewMed] = useState({
    drugName: '', dose: '', route: 'Oral' as MedRoute, frequency: 'Once daily', notes: '',
  });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchMedications(patientIpNo),
      fetchAdministrations(patientIpNo, today),
    ]).then(([meds, adminRecords]) => {
      setMedications(meds);
      setAdmins(adminRecords);
    }).finally(() => setLoading(false));
  }, [patientIpNo, today]);

  const handleAddMed = async () => {
    if (!newMed.drugName.trim() || !newMed.dose.trim()) return;
    setSaving(true);
    try {
      const added = await addMedicationPrescription({
        hospitalId, patientIpNo,
        drugName: newMed.drugName.trim(),
        dose: newMed.dose.trim(),
        route: newMed.route,
        frequency: newMed.frequency,
        prescribedBy: user?.name ?? user?.email,
        startDate: today,
        active: true,
        notes: newMed.notes.trim() || undefined,
      });
      if (added) setMedications(prev => [added, ...prev]);
      setNewMed({ drugName: '', dose: '', route: 'Oral', frequency: 'Once daily', notes: '' });
      setShowAdd(false);
    } finally { setSaving(false); }
  };

  const handleRecord = async (med: PrescribedMedication, status: MedAdminStatus) => {
    await recordAdministration({
      hospitalId, medicationId: med.id, patientIpNo,
      administeredAt: status === 'given' ? new Date().toISOString() : undefined,
      administeredBy: status === 'given' ? (user?.name ?? user?.email) : undefined,
      status,
    });
    // Refresh admins
    const updated = await fetchAdministrations(patientIpNo, today);
    setAdmins(updated);
  };

  const getLatestAdmin = (medId: string) =>
    admins.filter(a => a.medicationId === medId).sort((a, b) =>
      (b.administeredAt ?? b.scheduledTime ?? '').localeCompare(a.administeredAt ?? a.scheduledTime ?? '')
    )[0];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pill className="w-4 h-4 text-violet-600" />
          <h3 className="font-bold text-slate-800 text-sm">Medication Chart</h3>
          <span className="text-xs text-slate-400">Today: {today}</span>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAdd ? 'Cancel' : 'Prescribe'}
        </button>
      </div>

      {/* Add Medication Form */}
      {showAdd && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">New Prescription</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-slate-600 mb-1 block">Drug Name *</label>
              <input
                value={newMed.drugName}
                onChange={e => setNewMed(p => ({ ...p, drugName: e.target.value }))}
                placeholder="e.g. Inj. Cefuroxime"
                className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-violet-400 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Dose *</label>
              <input
                value={newMed.dose}
                onChange={e => setNewMed(p => ({ ...p, dose: e.target.value }))}
                placeholder="e.g. 1.5g"
                className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-violet-400 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Route</label>
              <select
                value={newMed.route}
                onChange={e => setNewMed(p => ({ ...p, route: e.target.value as MedRoute }))}
                className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-violet-400 outline-none bg-white"
              >
                {ROUTES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-600 mb-1 block">Frequency</label>
              <select
                value={newMed.frequency}
                onChange={e => setNewMed(p => ({ ...p, frequency: e.target.value }))}
                className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-violet-400 outline-none bg-white"
              >
                {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slate-600 mb-1 block">Notes (optional)</label>
              <input
                value={newMed.notes}
                onChange={e => setNewMed(p => ({ ...p, notes: e.target.value }))}
                placeholder="Special instructions..."
                className="w-full p-2 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-violet-400 outline-none"
              />
            </div>
          </div>
          <button
            onClick={handleAddMed}
            disabled={saving || !newMed.drugName.trim() || !newMed.dose.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" /> {saving ? 'Prescribing…' : 'Prescribe'}
          </button>
        </div>
      )}

      {/* Medication List */}
      {loading ? (
        <div className="text-center py-8 text-slate-400 text-sm">Loading medications…</div>
      ) : medications.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <Pill className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No active medications</p>
          <p className="text-xs mt-0.5">Prescribe medications using the button above</p>
        </div>
      ) : (
        <div className="space-y-2">
          {medications.map(med => {
            const latestAdmin = getLatestAdmin(med.id);
            const todayStatus = latestAdmin?.status ?? 'pending';
            const cfg = STATUS_CONFIG[todayStatus];
            return (
              <div key={med.id} className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{med.drugName}</p>
                    <p className="text-xs text-slate-500">
                      {med.dose} · {med.route} · {med.frequency}
                      {med.prescribedBy && <span className="ml-1 text-slate-400">by {med.prescribedBy}</span>}
                    </p>
                    {med.notes && <p className="text-xs text-slate-400 italic mt-0.5">{med.notes}</p>}
                  </div>
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${cfg.color}`}>
                    {cfg.icon}
                    {cfg.label}
                  </div>
                </div>
                {/* Administration buttons */}
                <div className="flex gap-1.5 flex-wrap">
                  {(['given','held','refused'] as MedAdminStatus[]).map(status => (
                    <button
                      key={status}
                      onClick={() => handleRecord(med, status)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                        todayStatus === status
                          ? STATUS_CONFIG[status].color + ' font-bold'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {STATUS_CONFIG[status].label}
                    </button>
                  ))}
                  <button
                    onClick={() => stopMedication(med.id).then(() =>
                      setMedications(prev => prev.filter(m => m.id !== med.id))
                    )}
                    className="ml-auto px-2 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-colors"
                  >
                    Stop
                  </button>
                </div>
                {latestAdmin?.administeredAt && (
                  <p className="text-[10px] text-slate-400">
                    Last: {new Date(latestAdmin.administeredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    {latestAdmin.administeredBy && ` by ${latestAdmin.administeredBy}`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MedicationChart;
