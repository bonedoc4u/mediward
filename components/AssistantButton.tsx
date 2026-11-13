/**
 * AssistantButton — opens the Clinical Assistant panel.
 *
 * An ordinary button in the app header. It replaces a floating, draggable
 * circle that sat on top of the page and covered whatever was under it: ward
 * tabs, a card's POD number, the patient status badge, the date picker.
 */
import React from 'react';
import { Zap } from 'lucide-react';

interface Props {
  onClick: () => void;
  /** 'dark' for the phone header (dark bar), 'light' for the desktop page header. */
  tone: 'dark' | 'light';
}

const AssistantButton: React.FC<Props> = ({ onClick, tone }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Clinical Assistant"
    title="Clinical Assistant"
    className={`min-w-11 min-h-11 flex items-center justify-center rounded-xl transition-colors ${
      tone === 'dark'
        ? 'text-white hover:bg-white/10 active:bg-white/20'
        : 'text-ink-muted hover:bg-surface-sunken hover:text-accent-fg'
    }`}
  >
    <Zap className="w-5 h-5" aria-hidden="true" />
  </button>
);

export default AssistantButton;
