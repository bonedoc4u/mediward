/**
 * PatientActionBar — the patient record's main action, in thumb reach.
 *
 * "Write today's note" is why a record is opened on a round, so it sits in a
 * bar at the bottom instead of mid-page. Less frequent actions (referral
 * letter, move bed) are one tap away in the "⋯" menu next to it.
 *
 * In the quick-view sheet the bar sticks to the bottom of the sheet. On the
 * full page it uses .patient-action-bar (index.css): fixed above the tab bar
 * on phones, sticky at the bottom of <main> from md up.
 */
import React from 'react';
import { ArrowRightLeft, MoreHorizontal, PencilLine, Send } from 'lucide-react';
import ActionMenu, { type ActionMenuItem } from '../../../components/ui/ActionMenu';

interface Props {
  inSheet?: boolean;
  /** Today's note already exists: the button says "Edit". */
  hasTodayNote: boolean;
  onWriteToday: () => void;
  onReferral: () => void;
  /** Omit for users who cannot edit the patient. */
  onMoveBed?: () => void;
}

const PatientActionBar: React.FC<Props> = ({ inSheet, hasTodayNote, onWriteToday, onReferral, onMoveBed }) => {
  const items: ActionMenuItem[] = [
    { key: 'referral', label: 'Referral letter', icon: Send, onSelect: onReferral },
    ...(onMoveBed ? [{ key: 'move-bed', label: 'Move bed', icon: ArrowRightLeft, onSelect: onMoveBed }] : []),
  ];

  return (
    <div
      className={`z-30 py-3 bg-surface border-t border-line ${
        inSheet ? 'sticky bottom-0 -mx-4 sm:-mx-8 px-4 sm:px-8' : 'patient-action-bar'
      }`}
      style={inSheet ? { paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' } : undefined}
    >
      <div className="flex items-stretch gap-2">
        <ActionMenu label="More actions" items={items} placement="above" align="start" triggerClassName="w-14 min-h-14 rounded-card">
          <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
        </ActionMenu>
        <button
          type="button"
          onClick={onWriteToday}
          className="flex-1 min-w-0 min-h-14 flex items-center justify-center gap-2 px-4 rounded-card bg-accent hover:bg-accent-pressed active:bg-accent-pressed text-white font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <PencilLine className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="truncate">{hasTodayNote ? "Edit today's note" : "Write today's note"}</span>
        </button>
      </div>
    </div>
  );
};

export default PatientActionBar;
