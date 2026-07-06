import React from 'react';
import { AlertTriangle, RefreshCw, WifiOff, ShieldOff } from 'lucide-react';
import type { PostgrestError } from '@supabase/supabase-js';
import { getReadableError } from '../../utils/postgrestErrors';

interface Props {
  error: PostgrestError | Error | null;
  onRetry?: () => void;
  /** Show compact inline variant instead of full-card layout */
  inline?: boolean;
}

function getIcon(code: string | undefined) {
  if (code === '42501') return ShieldOff;
  if (code === '08006') return WifiOff;
  return AlertTriangle;
}

export function QueryError({ error, onRetry, inline = false }: Props) {
  if (!error) return null;

  const code = (error as PostgrestError).code;
  const message = getReadableError(code, error.message);
  const Icon = getIcon(code);

  if (inline) {
    return (
      <div className="flex items-center gap-2 text-sm text-vital-critical-fg py-2" role="alert">
        <Icon className="w-4 h-4 shrink-0" />
        <span>{message}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="ml-auto flex items-center gap-1 text-xs font-medium text-vital-critical-fg hover:opacity-80 min-h-[44px] px-2"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center" role="alert">
      <div className="w-14 h-14 rounded-full bg-vital-critical-surface flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-vital-critical" />
      </div>
      <p className="text-ink font-semibold mb-1">Something went wrong</p>
      <p className="text-sm text-ink-muted max-w-xs mb-6">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-control text-sm font-medium hover:bg-accent-pressed transition-colors min-h-[44px]"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      )}
    </div>
  );
}
