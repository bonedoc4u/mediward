import React, { useState } from 'react';
import { Patient, PacStatus, PacChecklistItem } from '../types';
import { Check, Clock, AlertTriangle, Plus, Trash2, HeartPulse } from 'lucide-react';

interface Props {
  patients: Patient[];
  onUpdatePatient: (patient: Patient) => void;
}

const PacManagement: React.FC<Props> = ({ patients, onUpdatePatient }) => {
  // Only show patients awaiting surgery (No Date of Surgery set yet) and not discharged
  const pendingPatients = patients
    .filter(p => !p.dos && p.patientStatus !== 'Discharged')
    .sort((a, b) => parseInt(a.bed) - parseInt(b.bed));

  const [checklistInputs, setChecklistInputs] = useState<{[key: string]: string}>({});

  const getStatusBadge = (status: PacStatus) => {
    switch (status) {
        case PacStatus.Fit: return 'bg-green-100 text-green-700 border-green-200';
        case PacStatus.Pending: return 'bg-amber-50 text-amber-700 border-amber-200';
        case PacStatus.Unfit: return 'bg-red-100 text-red-700 border-red-200';
        default: return 'bg-slate-100 text-slate-700';
    }
  };

  const handleStatusChange = (patient: Patient, newStatus: string) => {
    onUpdatePatient({ ...patient, pacStatus: newStatus as PacStatus });
  };

  const handleAddChecklistItem = (patient: Patient) => {
    const text = checklistInputs[patient.ipNo];
    if (!text?.trim()) return;

    const newItem: PacChecklistItem = {
        id: Math.random().toString(36).substr(2, 9),
        task: text.trim(),
        isDone: false
    };

    const updatedChecklist = [...(patient.pacChecklist || []), newItem];
    
    // If we add an item, ensure status is Pending, unless explicitly Fit
    const shouldBePending = patient.pacStatus === PacStatus.Fit ? PacStatus.Pending : patient.pacStatus;

    onUpdatePatient({ 
        ...patient, 
        pacChecklist: updatedChecklist,
        pacStatus: shouldBePending 
    });
    setChecklistInputs(prev => ({ ...prev, [patient.ipNo]: '' }));
  };

  const handleToggleItem = (patient: Patient, itemId: string) => {
    const currentList = patient.pacChecklist || [];
    const updatedList = currentList.map(item => 
        item.id === itemId ? { ...item, isDone: !item.isDone } : item
    );

    // Auto-update to Fit logic
    // Check if ALL items are now done
    const allDone = updatedList.length > 0 && updatedList.every(i => i.isDone);
    
    let newStatus = patient.pacStatus;
    if (allDone && patient.pacStatus !== PacStatus.Fit) {
        newStatus = PacStatus.Fit;
    } 
    // Optional: If unchecking an item, revert to Pending? 
    // Let's keep it simple: If items are pending, it suggests Pending status
    else if (!allDone && patient.pacStatus === PacStatus.Fit) {
        newStatus = PacStatus.Pending;
    }

    onUpdatePatient({ 
        ...patient, 
        pacChecklist: updatedList,
        pacStatus: newStatus
    });
  };

  const handleDeleteItem = (patient: Patient, itemId: string) => {
    const updatedList = (patient.pacChecklist || []).filter(i => i.id !== itemId);
    onUpdatePatient({ ...patient, pacChecklist: updatedList });
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg flex items-start gap-3">
        <HeartPulse className="w-5 h-5 text-blue-600 mt-0.5" />
        <div>
            <h3 className="text-sm font-bold text-blue-800">Anesthesia Clearance Dashboard</h3>
            <p className="text-xs text-blue-600">
                Manage clearance for pre-op patients. Adding tasks will automatically set status to "Pending". 
                Completing all tasks will automatically set status to "Fit".
            </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {pendingPatients.map(patient => (
            <div key={patient.ipNo} className={`bg-white rounded-lg shadow-sm border flex flex-col ${patient.pacStatus === PacStatus.Fit ? 'border-green-200' : 'border-slate-200'}`}>
                {/* Card Header */}
                <div className="p-4 border-b border-slate-100 flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="bg-slate-800 text-white w-6 h-6 rounded flex items-center justify-center text-xs font-bold">{patient.bed}</span>
                            <span className="font-bold text-slate-800">{patient.name}</span>
                        </div>
                        <p className="text-xs text-slate-500">{patient.age}y / {patient.gender}</p>
                        <p className="text-xs font-medium text-slate-700 mt-1 line-clamp-1">{patient.diagnosis}</p>
                    </div>
                    
                    <select 
                        value={patient.pacStatus}
                        onChange={(e) => handleStatusChange(patient, e.target.value)}
                        className={`text-xs font-bold px-2 py-1 rounded border outline-none cursor-pointer ${getStatusBadge(patient.pacStatus)}`}
                    >
                        <option value={PacStatus.Fit}>FIT</option>
                        <option value={PacStatus.Pending}>PENDING</option>
                        <option value={PacStatus.Unfit}>UNFIT</option>
                    </select>
                </div>

                {/* Checklist Section */}
                <div className="p-4 flex-1 flex flex-col bg-slate-50/50">
                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Clearance Requirements</h4>
                    
                    {/* List */}
                    <div className="space-y-2 mb-3 flex-1">
                        {(patient.pacChecklist || []).map(item => (
                            <div key={item.id} className="flex items-center justify-between group bg-white p-2 rounded border border-slate-200">
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="checkbox" 
                                        checked={item.isDone}
                                        onChange={() => handleToggleItem(patient, item.id)}
                                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                                    />
                                    <span className={`text-sm ${item.isDone ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                        {item.task}
                                    </span>
                                </div>
                                <button 
                                    onClick={() => handleDeleteItem(patient, item.id)}
                                    className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                        {(!patient.pacChecklist || patient.pacChecklist.length === 0) && (
                            <div className="text-center py-4 text-slate-400 text-xs italic border-2 border-dashed border-slate-200 rounded">
                                No specific clearance tasks
                            </div>
                        )}
                    </div>

                    {/* Add Input */}
                    <div className="mt-auto">
                        <div className="flex gap-2">
                            <input 
                                type="text"
                                placeholder="Add task (e.g. Cardio Fit, TSH)"
                                className="flex-1 text-xs p-2 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                                value={checklistInputs[patient.ipNo] || ''}
                                onChange={(e) => setChecklistInputs(prev => ({ ...prev, [patient.ipNo]: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem(patient)}
                            />
                            <button 
                                onClick={() => handleAddChecklistItem(patient)}
                                className="bg-slate-200 hover:bg-slate-300 text-slate-600 p-2 rounded"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Status Footer Logic Display */}
                <div className={`p-2 text-center text-xs border-t font-medium ${patient.pacStatus === PacStatus.Fit ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {patient.pacStatus === PacStatus.Fit 
                        ? "Patient is Ready for Surgery" 
                        : "Clearance In Progress"}
                </div>
            </div>
        ))}

        {pendingPatients.length === 0 && (
            <div className="col-span-full p-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                <Check className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No patients pending surgery clearance.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default PacManagement;