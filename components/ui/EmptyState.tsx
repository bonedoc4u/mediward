import React from 'react';
import {
  Users, FileText, Settings, CreditCard, Search,
  Plus, RefreshCw, type LucideIcon,
} from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-slate-400" aria-hidden="true" />
      </div>
      <p className="text-slate-800 font-semibold text-base mb-1">{title}</p>
      {body && <p className="text-sm text-slate-500 max-w-xs mb-6">{body}</p>}
      {(primaryLabel || secondaryLabel) && (
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          {primaryLabel && onPrimary && (
            <button
              onClick={onPrimary}
              className="px-5 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors min-h-[44px]"
            >
              {primaryLabel}
            </button>
          )}
          {secondaryLabel && onSecondary && (
            <button
              onClick={onSecondary}
              className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors min-h-[44px]"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Pre-built variants ───────────────────────────────────────────────────────

export function NoPatients({ onAdd }: { onAdd?: () => void }) {
  return (
    <EmptyState
      icon={Users}
      title="No patients admitted"
      body="Admitted patients for your unit will appear here."
      primaryLabel={onAdd ? 'Admit patient' : undefined}
      onPrimary={onAdd}
    />
  );
}

export function NoRoundNotes({ onStart }: { onStart?: () => void }) {
  return (
    <EmptyState
      icon={FileText}
      title="No round note today"
      body="Start rounds to document today's clinical notes and to-dos."
      primaryLabel={onStart ? 'Start rounds' : undefined}
      onPrimary={onStart}
    />
  );
}

export function NoWardConfig({ onGoToSettings }: { onGoToSettings?: () => void }) {
  return (
    <EmptyState
      icon={Settings}
      title="Ward not configured"
      body="Ask your administrator to set up wards and units in Admin Settings."
      primaryLabel={onGoToSettings ? 'Open settings' : undefined}
      onPrimary={onGoToSettings}
    />
  );
}

export function AbhaIdMissing({ onEdit }: { onEdit?: () => void }) {
  return (
    <EmptyState
      icon={CreditCard}
      title="ABHA ID not linked"
      body="Link an ABHA ID to enable ABDM-powered health record sharing."
      primaryLabel={onEdit ? 'Add ABHA ID' : undefined}
      onPrimary={onEdit}
    />
  );
}

export function NoSearchResults({ query }: { query: string }) {
  return (
    <EmptyState
      icon={Search}
      title="No results"
      body={`Nothing matched "${query}". Try a different name, IP number, or diagnosis.`}
    />
  );
}
