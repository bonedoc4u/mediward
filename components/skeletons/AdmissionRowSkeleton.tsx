import React from 'react';
import { Skeleton } from '../ui/Skeleton';

interface Props {
  showNews2?: boolean;
}

export function AdmissionRowSkeleton({ showNews2 = false }: Props) {
  return (
    <tr className="border-b border-slate-100 last:border-0" aria-hidden="true">
      <td className="px-6 py-4"><Skeleton className="h-7 w-12" rounded="lg" /></td>
      <td className="px-6 py-4">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-48" />
        </div>
      </td>
      {showNews2 && (
        <td className="px-4 py-4">
          <Skeleton className="h-6 w-10 mx-auto" rounded="full" />
        </td>
      )}
      <td className="px-4 py-3"><Skeleton className="h-3 w-28" /></td>
      <td className="px-6 py-4">
        <div className="flex gap-1">
          <Skeleton className="h-5 w-10" rounded="full" />
          <Skeleton className="h-5 w-10" rounded="full" />
        </div>
      </td>
      <td className="px-6 py-4"><Skeleton className="h-6 w-20" rounded="full" /></td>
      <td className="px-6 py-4"><Skeleton className="h-10 w-14 mx-auto" rounded="lg" /></td>
      <td className="px-4 py-4">
        <div className="flex gap-2 justify-end">
          <Skeleton className="h-8 w-16" rounded="lg" />
          <Skeleton className="h-8 w-8" rounded="lg" />
        </div>
      </td>
    </tr>
  );
}

export function AdmissionTableSkeleton({ rows = 6, showNews2 = false }: { rows?: number; showNews2?: boolean }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <AdmissionRowSkeleton key={i} showNews2={showNews2} />
      ))}
    </>
  );
}
