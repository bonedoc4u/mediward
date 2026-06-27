import React from 'react';
import { Patient, PacStatus, PacFlowData } from '../types';
import { sortByBed } from '../utils/calculations';
import { Check, HeartPulse } from 'lucide-react';
import PacFlowChart from './PacFlowChart';

interface Props {
  patients: Patient[];
  onUpdatePatient: (patient: Patient) => void;
}

const getStatusBadge = (status: PacStatus) => {
  switch (status) {
    case PacStatus.Fit:     return 'bg-green-100  text-green-700  border-green-200';
    case PacStatus.Pending: return 'bg-amber-50   text-amber-700  border-amber-200';
    case PacStatus.Unfit:   return 'bg-red-100    text-red-700    border-red-200';
    case PacStatus.Review:  return 'bg-purple-100 text-purple-700 border-purple-200';
    default:                return 'bg-slate-100  text-slate-700';
  }
};

const PacManagement: React.FC<Props> = ({ patients, onUpdatePatient }) => {
  // Show patients awaiting surgery (no DOS yet, not discharged)
  const pendingPatients = patients
    .filter(p => !p.dos && p.patientStatus !== 'Discharged')
    .sort(sortByBed);

  const handleFlowChange = (patient: Patient, updated: PacFlowData) => {
    // Auto-derive PAC status from flowchart state:
    //   All branches cleared  → PAC Fit
    //   Anaesthesia seen but pending branches → PAC Pending
    //   Not seen yet          → keep existing status
    let newPacStatus = patient.pacStatus;
    if (updated.seenByAnaesthesia) {
      const allDone = updated.branches.length > 0 && updated.branches.every(b => b.isDone);
      // Auto-promote to Fit when all clear; leave Review/Unfit untouched if manually set
      if (allDone) newPacStatus = PacStatus.Fit;
      else if (newPacStatus === PacStatus.Fit) newPacStatus = PacStatus.Pending;
    }
    onUpdatePatient({ ...patient, pacFlow: updated, pacStatus: newPacStatus });
  };

  const handleStatusChange = (patient: Patient, newStatus: string) =>
    onUpdatePatient({ ...patient, pacStatus: newStatus as PacStatus });

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg flex items-start gap-3">
        <HeartPulse className="w-5 h-5 text-teal-600 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-sm font-bold text-blue-800">Anaesthesia Clearance Dashboard</h3>
          <p className="text-xs text-teal-600 mt-0.5">
            Click "Anaesthesia Seen" to activate the flowchart, then mark each clearance branch as done.
            All branches cleared → status auto-updates to PAC Fit.
            Add consultation branches (e.g. Cardiology, Nephrology) with the + button.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {pendingPatients.map(patient => (
          <div
            key={patient.ipNo}
            className={`bg-white rounded-xl shadow-sm border overflow-hidden ${
              patient.pacStatus === PacStatus.Fit ? 'border-green-300' : 'border-slate-200'
            }`}
          >
            {/* Card Header */}
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-800">{patient.name}</span>
                  <span className="bg-slate-800 text-white px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap">
                    {patient.ward} · Bed {patient.bed}
                  </span>
                  <span className="text-xs text-slate-500">{patient.age}y / {patient.gender}</span>
                </div>
                <p className="text-xs font-medium text-slate-700 mt-0.5 truncate">{patient.diagnosis}</p>
              </div>

              <select
                value={patient.pacStatus}
                onChange={e => handleStatusChange(patient, e.target.value)}
                className={`text-xs font-bold px-2 py-1.5 rounded-lg border outline-none cursor-pointer shrink-0 ${getStatusBadge(patient.pacStatus)}`}
              >
                <option value={PacStatus.Fit}>FIT</option>
                <option value={PacStatus.Pending}>PENDING</option>
                <option value={PacStatus.Review}>REVIEW</option>
                <option value={PacStatus.Unfit}>UNFIT</option>
              </select>
            </div>

            {/* PAC Flowchart */}
            <div className="p-4">
              <PacFlowChart
                pacFlow={patient.pacFlow}
                onChange={updated => handleFlowChange(patient, updated)}
                patientIpNo={patient.ipNo}
              />
            </div>

            {/* Status Footer */}
            <div className={`px-4 py-2 text-center text-xs border-t font-semibold ${
              patient.pacStatus === PacStatus.Fit
                ? 'bg-green-50 text-green-700'
                : patient.pacStatus === PacStatus.Unfit
                ? 'bg-red-50 text-red-700'
                : 'bg-slate-50 text-slate-500'
            }`}>
              {patient.pacStatus === PacStatus.Fit
                ? '✓ Patient is Ready for Surgery'
                : patient.pacStatus === PacStatus.Unfit
                ? '✗ Unfit for Surgery'
                : 'Clearance In Progress'}
            </div>
          </div>
        ))}

        {pendingPatients.length === 0 && (
          <div className="p-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
            <Check className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No patients pending surgery clearance.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PacManagement;
