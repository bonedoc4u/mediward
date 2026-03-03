import React, { useMemo, useState } from 'react';
import { useApp, useConfig } from '../contexts/AppContext';
import { PatientStatus } from '../types';
import { can } from '../utils/permissions';
import { getStatusColor, getLabTrend } from '../utils/calculations';
import {
  ArrowLeft, Calendar, Phone, Activity, FileImage,
  Droplet, ClipboardCheck, CheckSquare, HeartPulse,
  TrendingUp, TrendingDown, Minus, AlertCircle, LogOut, FileText, Trash2, FileJson
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import FHIRExportModal from './FHIRExportModal';
import VitalsWidget from './VitalsWidget';

const PatientDetail: React.FC = () => {
  const { navParams, navigateTo, patients, updatePatient, deletePatient, user } = useApp();
  const { labTypes } = useConfig();
  const [showDischargeConfirm, setShowDischargeConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFhirExport, setShowFhirExport] = useState(false);
  const canDischarge = can(user, 'patient:discharge');
  const canDelete = can(user, 'patient:delete');
  const patient = useMemo(() => patients.find(p => p.ipNo === navParams.id), [patients, navParams.id]);

  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <AlertCircle className="w-12 h-12 mb-3 opacity-50" />
        <p className="text-lg font-medium">Patient not found</p>
        <button
          onClick={() => navigateTo('dashboard')}
          className="mt-4 text-blue-600 hover:underline text-sm flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
      </div>
    );
  }

  // Only show lab types that have at least one result for this patient
  const activeLabTypes = useMemo(
    () => labTypes.filter(lt => patient.labResults.some(r => r.type === lt.name)),
    [labTypes, patient.labResults],
  );

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'up') return <TrendingUp className="w-3.5 h-3.5 text-red-500" />;
    if (trend === 'down') return <TrendingDown className="w-3.5 h-3.5 text-green-500" />;
    if (trend === 'equal') return <Minus className="w-3.5 h-3.5 text-slate-400" />;
    return null;
  };

  const pendingTodos = patient.todos.filter(t => !t.isDone);
  const completedTodos = patient.todos.filter(t => t.isDone);
  const daysSinceAdmission = Math.floor((Date.now() - new Date(patient.doa).getTime()) / (1000 * 60 * 60 * 24));
  const isAlreadyDischarged = patient.patientStatus === PatientStatus.Discharged;

  const handleDischarge = () => {
    const today = new Date().toISOString().split('T')[0];
    updatePatient({ ...patient, patientStatus: PatientStatus.Discharged, dod: today });
    setShowDischargeConfirm(false);
    navigateTo('discharge', { id: patient.ipNo });
  };

  const handleDelete = () => {
    deletePatient(patient.ipNo);
    setShowDeleteConfirm(false);
    navigateTo('dashboard');
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Back Navigation */}
      <button
        onClick={() => navigateTo('dashboard')}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      {/* Patient Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-4 sm:p-6 text-white">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-white/10 backdrop-blur-sm w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-xl flex items-center justify-center text-xl sm:text-2xl font-bold border border-white/20">
                {patient.bed}
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold truncate">{patient.name}</h1>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-300 text-xs sm:text-sm mt-1">
                  <span>{patient.age}y / {patient.gender}</span>
                  <span className="opacity-50">•</span>
                  <span>IP: {patient.ipNo}</span>
                  <span className="opacity-50">•</span>
                  <span>{patient.ward}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {patient.pod !== undefined && (
                <div className="bg-green-500/20 border border-green-400/30 rounded-xl px-3 py-1.5 text-center">
                  <span className="block text-[9px] uppercase font-bold text-green-300 tracking-wider">Post-Op Day</span>
                  <span className="block text-2xl sm:text-3xl font-black text-green-200 leading-none">{patient.pod}</span>
                </div>
              )}
              <div className="bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 text-center">
                <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider">Admitted</span>
                <span className="block text-base sm:text-lg font-bold text-white leading-none">{daysSinceAdmission}d</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Diagnosis</span>
            <p className="text-sm font-medium text-slate-800 mt-0.5">{patient.diagnosis}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Procedure</span>
            <p className="text-sm text-slate-700 mt-0.5">{patient.procedure || 'Conservative'}</p>
            {patient.dos && <p className="text-xs text-slate-500 mt-0.5">DOS: {patient.dos}</p>}
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Status</span>
            <div className="flex flex-wrap gap-1 mt-1">
              <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(patient.pacStatus)}`}>
                {patient.pacStatus}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(patient.patientStatus)}`}>
                {patient.patientStatus}
              </span>
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Contact</span>
            <p className="text-sm text-blue-600 mt-0.5 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5" /> {patient.mobile}
            </p>
            {patient.comorbidities.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {patient.comorbidities.map(c => (
                  <span key={c} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">{c}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions — horizontal scroll on mobile, wrap on larger screens */}
      <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-x-visible">
        <button onClick={() => navigateTo('rounds')} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-white rounded-lg shadow-sm border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm font-medium text-slate-700 whitespace-nowrap">
          <ClipboardCheck className="w-4 h-4 text-blue-500 shrink-0" /> Daily Rounds
        </button>
        <button onClick={() => navigateTo('labs')} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-white rounded-lg shadow-sm border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm font-medium text-slate-700 whitespace-nowrap">
          <Droplet className="w-4 h-4 text-blue-500 shrink-0" /> Lab Trends
        </button>
        <button onClick={() => navigateTo('radiology', { id: patient.ipNo })} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-white rounded-lg shadow-sm border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm font-medium text-slate-700 whitespace-nowrap">
          <FileImage className="w-4 h-4 text-blue-500 shrink-0" /> Radiology
        </button>
        <button onClick={() => navigateTo('pac')} className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-white rounded-lg shadow-sm border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm font-medium text-slate-700 whitespace-nowrap">
          <HeartPulse className="w-4 h-4 text-blue-500 shrink-0" /> PAC Status
        </button>
        <button
          onClick={() => setShowFhirExport(true)}
          className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-teal-50 rounded-lg shadow-sm border border-teal-200 hover:bg-teal-100 transition-colors text-sm font-medium text-teal-700 whitespace-nowrap"
        >
          <FileJson className="w-4 h-4 text-teal-600 shrink-0" /> Export FHIR
        </button>
        {isAlreadyDischarged ? (
          <button
            onClick={() => navigateTo('discharge', { id: patient.ipNo })}
            className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-teal-50 rounded-lg shadow-sm border border-teal-200 hover:bg-teal-100 transition-colors text-sm font-medium text-teal-700 whitespace-nowrap"
          >
            <FileText className="w-4 h-4 text-teal-600 shrink-0" /> Discharge Summary
          </button>
        ) : canDischarge ? (
          <button
            onClick={() => setShowDischargeConfirm(true)}
            className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] shrink-0 bg-red-50 rounded-lg shadow-sm border border-red-200 hover:bg-red-100 transition-colors text-sm font-medium text-red-700 whitespace-nowrap"
          >
            <LogOut className="w-4 h-4 text-red-500 shrink-0" /> Discharge Patient
          </button>
        ) : null}
      </div>

      {/* Admin: Permanently Delete */}
      {canDelete && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Permanently Delete Record
          </button>
        </div>
      )}

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={showDischargeConfirm}
        title="Discharge Patient"
        message={`Discharge ${patient.name}? Today (${new Date().toLocaleDateString()}) will be set as the discharge date. You can edit the summary afterwards.`}
        confirmLabel="Confirm Discharge"
        variant="warning"
        onConfirm={handleDischarge}
        onCancel={() => setShowDischargeConfirm(false)}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Permanently Delete Record"
        message={`This will permanently remove ${patient.name}'s entire record including all investigations, lab results, and clinical notes. This cannot be undone.`}
        confirmLabel="Delete Permanently"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {showFhirExport && (
        <FHIRExportModal patient={patient} onClose={() => setShowFhirExport(false)} />
      )}

      {/* Vital Signs */}
      <VitalsWidget
        vitals={patient.vitals ?? []}
        onAdd={v => {
          const id = Math.random().toString(36).slice(2, 11);
          const updated = [{ ...v, id }, ...(patient.vitals ?? [])];
          updatePatient({ ...patient, vitals: updated });
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lab Trends Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-blue-500" /> Lab Summary
          </h3>
          {activeLabTypes.length === 0 ? (
            <p className="text-sm text-slate-400">No lab results recorded yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {activeLabTypes.map(lt => {
                const data = getLabTrend(patient.labResults, lt.name);
                const isHigh = lt.alertHigh !== null && data.latest !== undefined && data.latest > lt.alertHigh;
                return (
                  <div key={lt.name} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-500 uppercase">{lt.name}</span>
                      <TrendIcon trend={data.trend} />
                    </div>
                    {data.latest !== undefined ? (
                      <>
                        <span className={`text-xl font-bold ${isHigh ? 'text-red-600' : 'text-slate-800'}`}>
                          {data.latest}
                        </span>
                        <span className="text-xs text-slate-400 ml-1">{lt.unit}</span>
                        {data.latestDate && (
                          <p className="text-[10px] text-slate-400 mt-0.5">{data.latestDate}</p>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-slate-400">No data</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Todos & Orders */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <CheckSquare className="w-5 h-5 text-blue-500" /> Active Orders ({pendingTodos.length} pending)
          </h3>
          <div className="space-y-2">
            {pendingTodos.map(t => (
              <div key={t.id} className="flex items-center gap-2 p-2 bg-yellow-50 rounded border border-yellow-100">
                <div className="w-2 h-2 bg-yellow-400 rounded-full shrink-0"></div>
                <span className="text-sm text-slate-700">{t.task}</span>
              </div>
            ))}
            {completedTodos.map(t => (
              <div key={t.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-100">
                <div className="w-2 h-2 bg-green-400 rounded-full shrink-0"></div>
                <span className="text-sm text-slate-400 line-through">{t.task}</span>
              </div>
            ))}
            {patient.todos.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">No active orders</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Imaging */}
      {patient.investigations.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <FileImage className="w-5 h-5 text-blue-500" /> Recent Imaging ({patient.investigations.length})
          </h3>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
            {patient.investigations.slice(0, 5).map(inv => (
              <div key={inv.id} className="group relative aspect-square bg-black rounded-lg overflow-hidden border border-slate-200">
                <img src={inv.imageUrl} alt={inv.type} className="w-full h-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <p className="text-[10px] text-white font-bold">{inv.type}</p>
                  <p className="text-[9px] text-white/70">{inv.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Rounds History */}
      {patient.dailyRounds.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-blue-500" /> Rounds History
          </h3>
          <div className="space-y-3">
            {patient.dailyRounds
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .slice(0, 5)
              .map(round => (
                <div key={round.date} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-blue-600">{round.date}</span>
                    <span className="text-[10px] text-slate-400">
                      {round.todos.filter(t => t.isDone).length}/{round.todos.length} tasks done
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">{round.note || 'No note recorded'}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientDetail;
