import React from 'react';

interface SkeletonProps {
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

export function Skeleton({ className = '', rounded = 'md' }: SkeletonProps) {
  const r = { sm: 'rounded-sm', md: 'rounded', lg: 'rounded-lg', full: 'rounded-full' }[rounded];
  return <div className={`animate-pulse bg-slate-200 ${r} ${className}`} aria-hidden="true" />;
}

export function SkeletonText({ lines = 1, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse bg-slate-200 rounded h-3 ${i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'}`}
        />
      ))}
    </div>
  );
}
