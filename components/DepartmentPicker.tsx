import React from 'react';
import { Stethoscope, ChevronRight } from 'lucide-react';

interface Department {
  id: string;
  displayName: string;
  description: string;
  color: string;
}

// Expand this list as more departments onboard MediWard.
const DEPARTMENTS: Department[] = [
  {
    id: 'orthopaedics',
    displayName: 'Orthopaedics',
    description: 'Fractures, joint replacements, and musculoskeletal surgery',
    color: 'from-blue-500 to-blue-700',
  },
];

interface Props {
  userName: string;
  hospitalName: string;
  onSelect: (departmentId: string) => void;
}

const DepartmentPicker: React.FC<Props> = ({ userName, hospitalName, onSelect }) => {
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-4 rounded-2xl shadow-xl shadow-blue-900/40">
          <Stethoscope className="w-10 h-10 text-white" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">MediWard</h1>
          <p className="text-slate-400 text-sm">{hospitalName}</p>
        </div>
      </div>

      <div className="text-center mb-8">
        <h2 className="text-xl font-semibold text-white">
          Welcome, {userName.split(' ')[0]}
        </h2>
        <p className="text-slate-400 text-sm mt-1">Select a department to continue</p>
      </div>

      <div className="w-full max-w-md space-y-3">
        {DEPARTMENTS.map(dept => (
          <button
            key={dept.id}
            onClick={() => onSelect(dept.id)}
            className="w-full bg-white/10 hover:bg-white/20 border border-white/10 hover:border-white/20 rounded-2xl p-5 flex items-center gap-4 transition-all duration-200 text-left group"
          >
            <div className={`bg-gradient-to-br ${dept.color} p-3 rounded-xl shrink-0`}>
              <Stethoscope className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white">{dept.displayName}</p>
              <p className="text-xs text-slate-400 mt-0.5">{dept.description}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors shrink-0" />
          </button>
        ))}

        <p className="text-center text-xs text-slate-600 pt-2">
          More departments will be added as MediWard expands
        </p>
      </div>
    </div>
  );
};

export default DepartmentPicker;
