import React from 'react';
import { ChevronRight, LayoutGrid, Users, AlertTriangle } from 'lucide-react';

const UNIT_GRADIENTS = [
  'from-teal-500 to-teal-700',
  'from-emerald-500 to-emerald-700',
  'from-purple-500 to-purple-700',
  'from-orange-500 to-orange-700',
  'from-rose-500 to-rose-700',
];

export interface UnitStat {
  total: number;
  pacPending: number;
  surgeryToday: number;
}

interface Props {
  userName: string;
  hospitalName: string;
  departmentName: string;
  units: string[];
  unitStats?: Record<string, UnitStat>;
  onSelect: (unit: string) => void; // 'all' or a unit string like 'OR1'
}

const UnitPicker: React.FC<Props> = ({
  userName,
  hospitalName,
  departmentName,
  units,
  unitStats,
  onSelect,
}) => {
  const allTotal = unitStats?.all?.total ?? Object.values(unitStats ?? {}).reduce((s, v) => s + v.total, 0);

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-6 overflow-y-auto">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="bg-gradient-to-br from-teal-500 to-teal-700 p-4 rounded-2xl shadow-xl shadow-teal-900/40">
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
          {allTotal > 0 && (
            <span className="shrink-0 bg-white/20 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {allTotal} pts
            </span>
          )}
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors shrink-0" />
        </button>

        {/* Individual units */}
        {units.map((unit, i) => {
          const stat = unitStats?.[unit];
          return (
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
                {stat ? (
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs text-slate-300">
                      <Users className="w-3 h-3" />{stat.total} pts
                    </span>
                    {stat.pacPending > 0 && (
                      <span className="flex items-center gap-1 text-xs text-red-300">
                        <AlertTriangle className="w-3 h-3" />{stat.pacPending} PAC
                      </span>
                    )}
                    {stat.surgeryToday > 0 && (
                      <span className="text-xs text-blue-300">✦ {stat.surgeryToday} surg</span>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 mt-0.5">{departmentName}</p>
                )}
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default UnitPicker;
