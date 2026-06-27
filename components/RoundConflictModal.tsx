/**
 * components/RoundConflictModal.tsx — Task 2
 *
 * Shown when two users save the same round note simultaneously.
 * Displays a side-by-side diff so the doctor can choose which version to keep.
 */

import React from 'react';
import { AlertTriangle, Check, RefreshCw } from 'lucide-react';
import type { RoundConflict } from '../hooks/useSaveRoundNote';

interface Props {
  conflict: RoundConflict;
  onResolve: (choice: 'mine' | 'theirs') => void;
  onDismiss: () => void;
  isSaving?: boolean;
}

export const RoundConflictModal: React.FC<Props> = ({
  conflict,
  onResolve,
  onDismiss,
  isSaving = false,
}) => {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 bg-amber-50">
          <AlertTriangle className="text-amber-500 shrink-0" size={22} />
          <div>
            <p className="font-semibold text-slate-800">Round note conflict</p>
            <p className="text-xs text-slate-500">
              Someone else saved this note while you were editing.
              Choose which version to keep.
            </p>
          </div>
        </div>

        {/* Diff */}
        <div className="grid grid-cols-2 divide-x divide-slate-200 overflow-y-auto flex-1 min-h-0">
          <VersionPane
            label="Your version"
            note={conflict.localRound.note}
            todos={conflict.localRound.todos}
            accent="blue"
          />
          <VersionPane
            label="Server version"
            note={conflict.serverRound.note}
            todos={conflict.serverRound.todos}
            accent="green"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onDismiss}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
            disabled={isSaving}
          >
            Decide later
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => onResolve('theirs')}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                         border border-slate-300 bg-white hover:bg-slate-100 text-slate-700
                         disabled:opacity-50 transition-colors"
            >
              <Check size={15} />
              Use server version
            </button>
            <button
              onClick={() => onResolve('mine')}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                         bg-blue-600 hover:bg-blue-700 text-white
                         disabled:opacity-50 transition-colors"
            >
              {isSaving
                ? <RefreshCw size={15} className="animate-spin" />
                : <Check size={15} />}
              Keep my version
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface VersionPaneProps {
  label: string;
  note: string;
  todos: Array<{ id: string; task: string; isDone: boolean }>;
  accent: 'blue' | 'green';
}

const VersionPane: React.FC<VersionPaneProps> = ({ label, note, todos, accent }) => {
  const headerClass = accent === 'blue'
    ? 'bg-blue-50 text-blue-700 border-b border-blue-100'
    : 'bg-green-50 text-green-700 border-b border-green-100';

  return (
    <div className="flex flex-col">
      <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide ${headerClass}`}>
        {label}
      </div>
      <div className="p-4 space-y-3 overflow-y-auto">
        {note ? (
          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{note}</p>
        ) : (
          <p className="text-sm text-slate-400 italic">No note</p>
        )}
        {todos.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Tasks</p>
            {todos.map((t) => (
              <div key={t.id} className="flex items-start gap-2 text-sm text-slate-600">
                <span className={t.isDone ? 'text-green-500 mt-0.5' : 'text-slate-300 mt-0.5'}>
                  {t.isDone ? '✓' : '○'}
                </span>
                <span className={t.isDone ? 'line-through text-slate-400' : ''}>{t.task}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
