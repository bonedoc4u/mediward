/**
 * RoundNotesTimeline — the patient's round notes, newest first, each with the
 * day, the author and the time the database recorded.
 *
 * Only real notes are listed. Rounds written by older app versions hold a
 * copy of the diagnosis in their `note` field; those are not notes and are
 * never shown here.
 */
import React, { useState } from 'react';
import { ClipboardCheck, PencilLine } from 'lucide-react';
import { DailyRound } from '../../../types';
import { formatDayMonth } from '../../../utils/dates';
import { dayLabel, timeLabel } from '../rounds/roundNotes';

interface Props {
  rounds: readonly DailyRound[];
  /** Today as YYYY-MM-DD (device time zone). */
  today: string;
  /** Opens Round Mode on this patient. Omit for users who cannot write. */
  onWriteToday?: () => void;
}

const COLLAPSED_COUNT = 3;

/** "Today", "Yesterday" or "11 Nov". */
function whenLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  const label = dayLabel(date, today);
  return label === 'Yesterday' ? label : formatDayMonth(date);
}

const RoundNotesTimeline: React.FC<Props> = ({ rounds, today, onWriteToday }) => {
  const [showAll, setShowAll] = useState(false);

  const notes = [...rounds]
    .filter(r => (r.roundNote ?? '').trim() !== '')
    .sort((a, b) => b.date.localeCompare(a.date));
  const hasToday = notes.some(n => n.date === today);
  const visible = showAll ? notes : notes.slice(0, COLLAPSED_COUNT);

  return (
    <section aria-label="Round notes" className="bg-surface-card rounded-2xl shadow-sm border border-line p-4 mb-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-bold text-ink flex items-center gap-2 text-sm">
          <ClipboardCheck className="w-4 h-4 text-accent-fg" aria-hidden="true" /> Round notes
        </h3>
        {onWriteToday && (
          <button
            type="button"
            onClick={onWriteToday}
            className="min-h-11 px-3 flex items-center gap-1.5 rounded-control bg-accent hover:bg-accent-pressed text-white text-sm font-bold transition-colors"
          >
            <PencilLine className="w-4 h-4" aria-hidden="true" />
            {hasToday ? "Edit today's note" : "Write today's note"}
          </button>
        )}
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-ink-muted">No round notes yet.</p>
      ) : (
        <ol className="space-y-3">
          {visible.map(n => (
            <li key={n.date} className="border-l-2 border-line pl-3">
              <p className="text-xs font-bold text-ink-muted">
                {[whenLabel(n.date, today), n.roundNoteBy, timeLabel(n.roundNoteAt)].filter(Boolean).join(' · ')}
              </p>
              <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap select-text">{n.roundNote}</p>
            </li>
          ))}
        </ol>
      )}

      {notes.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          aria-expanded={showAll}
          className="mt-3 min-h-11 px-3 rounded-control border border-line text-sm font-semibold text-accent-fg hover:border-accent transition-colors"
        >
          {showAll ? 'Show fewer' : `Show all ${notes.length} notes`}
        </button>
      )}
    </section>
  );
};

export default RoundNotesTimeline;
