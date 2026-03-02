import React from 'react';

/** Pulsing skeleton placeholder while patients load from Supabase. */
const WardSkeleton: React.FC = () => {
  const skeletonRows = Array.from({ length: 6 });

  return (
    <div className="space-y-6 animate-pulse">
      {/* Ward Tab Bar skeleton */}
      <div className="flex gap-2 border-b border-slate-200 pb-0 overflow-x-auto">
        {['All', '', '', ''].map((label, i) => (
          <div
            key={label}
            className="h-9 w-20 rounded-t-md bg-slate-200 shrink-0"
          />
        ))}
      </div>

      {/* Search + filter bar skeleton */}
      <div className="flex gap-3">
        <div className="flex-1 h-10 rounded-lg bg-slate-200" />
        <div className="w-32 h-10 rounded-lg bg-slate-200" />
      </div>

      {/* Patient row skeletons */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {skeletonRows.map((_, i) => (
          <div
            key={i}
            className={`flex items-center gap-4 px-4 py-3 ${i !== skeletonRows.length - 1 ? 'border-b border-slate-100' : ''}`}
          >
            {/* Bed badge */}
            <div className="w-12 h-8 rounded-lg bg-slate-200 shrink-0" />

            {/* Name + diagnosis */}
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-40 rounded bg-slate-200" />
              <div className="h-3 w-56 rounded bg-slate-100" />
            </div>

            {/* Ward / status chip */}
            <div className="hidden md:block w-20 h-6 rounded-full bg-slate-200" />

            {/* POD */}
            <div className="hidden md:block w-14 h-6 rounded bg-slate-200" />

            {/* Action buttons */}
            <div className="flex gap-2">
              <div className="w-16 h-8 rounded-lg bg-slate-200" />
              <div className="w-8 h-8 rounded-lg bg-slate-200" />
            </div>
          </div>
        ))}
      </div>

      {/* Summary cards skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-2">
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="h-8 w-12 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default WardSkeleton;
