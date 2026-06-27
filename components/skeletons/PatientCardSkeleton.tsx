import React from 'react';
import { Skeleton } from '../ui/Skeleton';

export function PatientCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3" aria-hidden="true">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-7 w-16" rounded="full" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-6 w-14" rounded="full" />
        <Skeleton className="h-6 w-14" rounded="full" />
      </div>
    </div>
  );
}
