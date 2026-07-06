/**
 * EditableSectionCard.tsx — a detail card that flips one section between a
 * read-only view and an inline edit form, with its own Save/Cancel.
 *
 * The parent owns the draft state and supplies:
 *   - `view`  : read-only content
 *   - `edit`  : the controlled inputs (bound to the parent's draft)
 *   - `onSave`: validate + persist; return an error string to keep the form
 *               open, or null on success (the card then closes edit mode).
 *   - `onCancel`: reset the parent's draft.
 *
 * The pencil is shown only when `canEdit` is true, so role-based access
 * (attending = view-only) is enforced at the UI. Saves go through the caller's
 * onSave, which routes to PatientContext.updatePatient — that path already
 * sanitizes input, writes the audit entry and queues offline on failure.
 */
import React, { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';

interface Props {
  title: string;
  icon?: React.ReactNode;
  canEdit: boolean;
  view: React.ReactNode;
  edit: React.ReactNode;
  /** Validate + persist. Return an error message to keep editing, or null on success. */
  onSave: () => string | null;
  onCancel?: () => void;
}

const EditableSectionCard: React.FC<Props> = ({ title, icon, canEdit, view, edit, onSave, onCancel }) => {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const err = onSave();
    if (err) { setError(err); return; }
    setError(null);
    setEditing(false);
  };

  const handleCancel = () => {
    setError(null);
    setEditing(false);
    onCancel?.();
  };

  return (
    <div className="bg-surface-card rounded-2xl shadow-sm border border-line px-4 py-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint flex items-center gap-1.5">
          {icon}{title}
        </p>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            aria-label={`Edit ${title}`}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-ink-faint hover:text-accent-fg hover:bg-accent-soft transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          {edit}
          {error && (
            <p className="text-xs text-vital-critical-fg bg-vital-critical-surface border border-vital-critical-border rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 text-sm font-semibold text-ink-muted border border-line rounded-xl hover:bg-surface transition-colors"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-accent hover:bg-accent-pressed rounded-xl transition-colors"
            >
              <Check className="w-4 h-4" /> Save
            </button>
          </div>
        </div>
      ) : view}
    </div>
  );
};

export default EditableSectionCard;
