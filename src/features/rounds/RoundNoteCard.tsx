/**
 * RoundNoteCard — the last note, today's note, quick phrases and an honest
 * save state. Presentational: the text and the save state live in the parent.
 */
import React, { useId } from 'react';
import { AlertTriangle, Check, Clock, Loader2, PencilLine } from 'lucide-react';
import { DailyRound } from '../../../types';
import { NoteSaveState, QUICK_PHRASES, ROUND_NOTE_MAX_LENGTH, appendPhrase, noteMeta, timeLabel } from './roundNotes';

interface Props {
  today: string;
  /** Most recent note from an earlier day, if any. */
  previous?: DailyRound;
  /** Today's round as the server last reported it (for "Saved 09:41 · Dr R"). */
  todayRound?: DailyRound;
  value: string;
  onChange: (text: string) => void;
  saveState: NoteSaveState;
  disabled?: boolean;
}

const SaveLine: React.FC<{ state: NoteSaveState; todayRound?: DailyRound }> = ({ state, todayRound }) => {
  const base = 'flex items-center gap-1.5 text-xs font-semibold min-h-6';
  if (state === 'saving') {
    return <p className={`${base} text-ink-muted`} role="status"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />Saving…</p>;
  }
  if (state === 'queued') {
    return (
      <p className={`${base} text-vital-warning-fg`} role="status">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Kept on this phone · will be sent when the network returns
      </p>
    );
  }
  if (state === 'dirty') {
    return <p className={`${base} text-ink-muted`} role="status"><PencilLine className="w-3.5 h-3.5" aria-hidden="true" />Not saved yet</p>;
  }
  const savedAt = timeLabel(todayRound?.roundNoteAt);
  if ((todayRound?.roundNote ?? '') !== '' && savedAt) {
    return (
      <p className={`${base} text-vital-normal-fg`} role="status">
        <Check className="w-3.5 h-3.5" aria-hidden="true" />
        Saved {savedAt}{todayRound?.roundNoteBy ? ` · ${todayRound.roundNoteBy}` : ''}
      </p>
    );
  }
  return <p className={`${base} text-ink-muted`}>No note for today yet</p>;
};

const RoundNoteCard: React.FC<Props> = ({ today, previous, todayRound, value, onChange, saveState, disabled }) => {
  const noteId = useId();
  const nearLimit = value.length > ROUND_NOTE_MAX_LENGTH - 200;

  return (
    <section aria-label="Round note" className="space-y-3">
      {previous && (
        <div className="bg-surface-sunken border border-line rounded-card p-3 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-ink-muted">{noteMeta(previous, today)}</p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(previous.roundNote ?? '')}
              className="shrink-0 min-h-11 px-3 rounded-control border border-line bg-surface-card text-accent-fg text-sm font-bold hover:border-accent disabled:opacity-40 transition-colors"
            >
              Copy forward
            </button>
          </div>
          <p className="text-sm leading-relaxed text-ink whitespace-pre-wrap select-text">{previous.roundNote}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={noteId} className="text-sm font-bold text-ink">Today&apos;s note</label>
          <SaveLine state={saveState} todayRound={todayRound} />
        </div>
        <textarea
          id={noteId}
          data-no-swipe
          rows={4}
          maxLength={ROUND_NOTE_MAX_LENGTH}
          disabled={disabled}
          placeholder="Findings and plan…"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-card border border-line bg-surface-card p-3 text-base leading-relaxed text-ink placeholder:text-ink-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent select-text resize-y"
        />
        {nearLimit && (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-vital-warning-fg">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            {ROUND_NOTE_MAX_LENGTH - value.length} characters left
          </p>
        )}
      </div>

      <div data-no-swipe className="flex gap-2 overflow-x-auto pb-1" aria-label="Quick phrases">
        {QUICK_PHRASES.map(phrase => (
          <button
            key={phrase}
            type="button"
            disabled={disabled}
            onClick={() => onChange(appendPhrase(value, phrase))}
            className="shrink-0 min-h-11 px-3 rounded-full border border-line bg-surface-card text-sm font-semibold text-ink hover:border-accent active:bg-accent-soft disabled:opacity-40 transition-colors"
          >
            + {phrase}
          </button>
        ))}
      </div>
    </section>
  );
};

export default RoundNoteCard;
