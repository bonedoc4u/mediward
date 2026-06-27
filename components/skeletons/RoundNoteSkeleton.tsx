import React from 'react';
import { Skeleton } from '../ui/Skeleton';

export function RoundNoteSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3" aria-hidden="true">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" rounded="sm" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" rounded="sm" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
    </div>
  );
}
