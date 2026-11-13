import React from 'react';
import { Eye } from 'lucide-react';

/** One line that tells the user why the controls on a screen are off. */
const ViewOnlyNote: React.FC = () => (
  <p role="note" className="mb-3 flex items-center gap-2 rounded-xl border border-line bg-surface-sunken px-3 py-2 text-sm font-medium text-ink-muted">
    <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
    View only. Your role cannot change this.
  </p>
);

export default ViewOnlyNote;
