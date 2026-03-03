import React, { useState, useMemo } from 'react';
import { Patient, PacChecklistItem } from '../types';
import { useConfig } from '../contexts/ConfigContext';
import { Calendar, CheckSquare, Square, UserCheck, AlertCircle } from 'lucide-react';

interface Props {
  patients: Patient[];
  onUpdatePatient: (patient: Patient) => void;
}

const PreOpPrep: React.FC<Props> = ({ patients, onUpdatePatient }) => {
  const { preOpChecklistTemplate } = useConfig();

  const preOpPatients = useMemo(
    () => patients.filter(p => !p.dos && p.patientStatus !== 'Discharged'),
    [patients],
  );

  const [filterDate, setFilterDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });

  const getPatientsForDate = () => preOpPatients.filter(p => p.plannedDos === filterDate);
  const getUnscheduledPatients = () => preOpPatients.filter(p => !p.plannedDos);

  /** Ensure checklist is initialized from template before toggling. */
  function ensureChecklist(patient: Patient): PacChecklistItem[] {
    if (Array.isArray(patient.preOpChecklist) && patient.preOpChecklist.length > 0) {
      return patient.preOpChecklist;
    }
    return preOpChecklistTemplate.map((task, i) => ({ id: String(i), task, isDone: false }));
  }

  const handleToggleItem = (patient: Patient, itemId: string) => {
    const checklist = ensureChecklist(patient).map(item =>
      item.id === itemId ? { ...item, isDone: !item.isDone } : item,
    );
    onUpdatePatient({ ...patient, preOpChecklist: checklist });
  };

  const handleDateAssignment = (patient: Patient, date: string) => {
    // Initialize checklist when scheduling for the first time
    const update: Partial<Patient> = { plannedDos: date || undefined };
    if (date && !patient.preOpChecklist?.length) {
      update.preOpChecklist = preOpChecklistTemplate.map((task, i) => ({
        id: String(i), task, isDone: false,
      }));
    }
    onUpdatePatient({ ...patient, ...update });
  };

  const renderChecklistItem = (patient: Patient, item: PacChecklistItem) => (
    <div
      key={item.id}
      onClick={() => handleToggleItem(patient, item.id)}
      className={`cursor-pointer flex items-center gap-2.5 p-2.5 rounded border transition-all ${
        item.isDone
          ? 'bg-green-50 border-green-200 text-green-800'
          : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
      }`}
    >
      {item.isDone
        ? <CheckSquare className="w-4 h-4 text-green-600 shrink-0" />
        : <Square className="w-4 h-4 text-slate-300 shrink-0" />}
      <span className="text-sm font-medium">{item.task}</span>
    </div>
  );

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 sticky top-0 z-10">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Pre-Operative Preparation</h3>
            <p className="text-xs text-slate-500">Manage checklists for upcoming surgeries</p>
          </div>
          <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-xs font-bold text-slate-500 uppercase">Viewing List For:</span>
            <input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="bg-white border border-slate-300 text-slate-800 text-sm rounded px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Unscheduled pool */}
      <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="w-4 h-4 text-blue-600" />
          <h4 className="font-bold text-blue-900 text-sm">
            Unscheduled Patients ({getUnscheduledPatients().length})
          </h4>
        </div>
        {getUnscheduledPatients().length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {getUnscheduledPatients().map(p => (
              <div key={p.ipNo} className="min-w-[250px] bg-white p-3 rounded shadow-sm border border-blue-100 flex flex-col gap-2">
                <div className="flex justify-between">
                  <span className="font-bold text-slate-700">{p.name}</span>
                  <span className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">Bed {p.bed}</span>
                </div>
                <p className="text-xs text-slate-500 truncate">{p.diagnosis}</p>
                <button
                  onClick={() => handleDateAssignment(p, filterDate)}
                  className="mt-1 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-1.5 rounded font-medium transition-colors"
                >
                  Add to List for {filterDate}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-blue-400 italic">All active patients are scheduled.</p>
        )}
      </div>

      {/* Checklist cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {getPatientsForDate().map(patient => {
          const checklist = ensureChecklist(patient);
          const doneCount = checklist.filter(i => i.isDone).length;
          return (
            <div key={patient.ipNo} className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              {/* Patient header */}
              <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-800 text-white rounded flex items-center justify-center font-bold text-lg">
                    {patient.bed}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">{patient.name}</h3>
                    <p className="text-xs text-slate-500">{patient.age}y / {patient.gender} • IP: {patient.ipNo}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDateAssignment(patient, '')}
                  className="text-xs text-red-500 hover:text-red-700 hover:underline"
                >
                  Remove from list
                </button>
              </div>

              <div className="p-4 bg-slate-50/30 border-b border-slate-100">
                <p className="text-sm font-medium text-slate-700">
                  <span className="text-slate-400 text-xs uppercase mr-1">Dx:</span>{patient.diagnosis}
                </p>
                <p className="text-sm text-slate-600 mt-1">
                  <span className="text-slate-400 text-xs uppercase mr-1">Proc:</span>
                  {patient.procedure || 'Not specified'}
                </p>
              </div>

              {/* Progress bar */}
              <div className="px-4 pt-3">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Checklist progress</span>
                  <span className="font-medium">{doneCount}/{checklist.length}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div
                    className="bg-green-500 h-1.5 rounded-full transition-all"
                    style={{ width: checklist.length ? `${(doneCount / checklist.length) * 100}%` : '0%' }}
                  />
                </div>
              </div>

              {/* Dynamic checklist */}
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {checklist.map(item => renderChecklistItem(patient, item))}
              </div>

              {/* Status footer */}
              <div className="bg-slate-50 p-3 text-center border-t border-slate-200">
                {patient.pacStatus === 'PAC Fit' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">
                    <UserCheck className="w-3 h-3" /> PAC FIT
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-full">
                    <AlertCircle className="w-3 h-3" /> PAC PENDING
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {getPatientsForDate().length === 0 && (
          <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-lg text-slate-400">
            <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No patients scheduled for {filterDate}</p>
            <p className="text-xs mt-1">Select patients from the unscheduled pool above.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PreOpPrep;
