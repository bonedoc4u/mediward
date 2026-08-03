import React, { useState, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Search, GripVertical, Plus } from 'lucide-react';
import { Patient } from '../../types';

function daysPending(doa: string): number {
  const admitted = new Date(doa + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = today.getTime() - admitted.getTime();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

interface PendingCardProps {
  patient: Patient;
  onAssign: (patient: Patient) => void;
}

function PendingCard({ patient, onAssign }: PendingCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `pending-${patient.ipNo}`,
  });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 1000 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 p-3 bg-white rounded-lg border border-slate-200 hover:border-teal-300 transition-colors"
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="cursor-grab touch-none text-slate-400 mt-0.5 shrink-0"
        aria-label={`Drag ${patient.name}`}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-900 text-sm truncate">
          {patient.name} <span className="text-slate-500 font-normal">({patient.ipNo})</span>
        </div>
        <div className="text-xs text-slate-600 truncate">{patient.diagnosis}</div>
        <div className="text-xs text-slate-400 mt-0.5">Pending {daysPending(patient.doa)}d</div>
      </div>
      <button
        type="button"
        onClick={() => onAssign(patient)}
        className="p-1.5 bg-teal-100 text-teal-700 rounded-md hover:bg-teal-200 shrink-0"
        aria-label={`Add ${patient.name} to current list`}
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

interface PendingSurgeryPanelProps {
  pendingPatients: Patient[];
  onAssign: (patient: Patient) => void;
}

const PendingSurgeryPanel: React.FC<PendingSurgeryPanelProps> = ({ pendingPatients, onAssign }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const sorted = useMemo(
    () => [...pendingPatients].sort((a, b) => a.doa.localeCompare(b.doa)),
    [pendingPatients],
  );

  const filtered = sorted.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.ipNo.includes(searchTerm),
  );

  return (
    <div className="w-full lg:w-80 shrink-0 bg-slate-50 rounded-xl border border-slate-200 p-3 flex flex-col gap-3 max-h-[calc(100vh-200px)]">
      <div>
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
          Pending Surgery ({pendingPatients.length})
        </h2>
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search name or IP..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">No patients pending surgery.</div>
        ) : (
          filtered.map(patient => (
            <PendingCard key={patient.ipNo} patient={patient} onAssign={onAssign} />
          ))
        )}
      </div>
    </div>
  );
};

export default PendingSurgeryPanel;
