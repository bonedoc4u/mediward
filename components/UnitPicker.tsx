import React from 'react';
import { ChevronRight, LayoutGrid } from 'lucide-react';

const UNIT_GRADIENTS = [
  'from-blue-500 to-blue-700',
  'from-emerald-500 to-emerald-700',
  'from-purple-500 to-purple-700',
  'from-orange-500 to-orange-700',
  'from-rose-500 to-rose-700',
];

interface Props {
  userName: string;
  hospitalName: string;
  departmentName: string;
  units: string[];
  onSelect: (unit: string) => void; // 'all' or a unit string like 'OR1'
}

const UnitPicker: React.FC<Props> = ({
  userName,
  hospitalName,
  departmentName,
  units,
  onSelect,
}) => {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-6 overflow-y-auto">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-4 rounded-2xl shadow-xl shadow-blue-900/40">
          <LayoutGrid className="w-10 h-10 text-white" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">MediWard</h1>
          <p className="text-slate-400 text-sm">{hospitalName}</p>
          <p className="text-slate-500 text-xs mt-0.5">{departmentName}</p>
        </div>
      </div>

      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-white">
          Welcome, {userName.split(' ')[0]}
        </h2>
        <p className="text-slate-400 text-sm mt-1">Choose which unit to view</p>
      </div>

      <div className="w-full max-w-md space-y-3">
        {/* All Units */}
        <button
          onClick={() => onSelect('all')}
          className="w-full bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/20 rounded-2xl p-5 flex items-center gap-4 transition-all duration-200 text-left group"
        >
          <div className="bg-gradient-to-br from-slate-500 to-slate-700 p-3 rounded-xl shrink-0">
            <LayoutGrid className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white">All Units</p>
            <p className="text-xs text-slate-400 mt-0.5">View patients from all units together</p>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors shrink-0" />
        </button>

        {/* Individual units */}
        {units.map((unit, i) => (
          <button
            key={unit}
            onClick={() => onSelect(unit)}
            className="w-full bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/20 rounded-2xl p-5 flex items-center gap-4 transition-all duration-200 text-left group"
          >
            <div className={`bg-gradient-to-br ${UNIT_GRADIENTS[i % UNIT_GRADIENTS.length]} p-3 rounded-xl shrink-0 min-w-[3rem] flex items-center justify-center`}>
              <span className="text-white font-bold text-sm">{unit}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white">Unit {unit}</p>
              <p className="text-xs text-slate-400 mt-0.5">{departmentName}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default UnitPicker;
