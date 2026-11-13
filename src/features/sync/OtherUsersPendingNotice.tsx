import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { getOtherUsersPending } from '../../../services/syncQueue';
import { otherUsersPendingMessage } from './otherUsersPending';

const NOTHING = { count: 0, names: [] as string[] };

/**
 * Tells the signed-in user that another user's unsent changes are waiting on
 * this phone. Those changes are no longer sent under the wrong name (audit
 * DATA-05), so somebody has to know they are there.
 *
 * It sits in the page, not in a pop-up: a pop-up shown at sign-in is gone
 * before the disclaimer and unit screens are passed.
 */
const OtherUsersPendingNotice: React.FC = () => {
  const [pending, setPending] = useState(NOTHING);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const check = () => setPending(getOtherUsersPending());
    // First look on the next tick: PatientProvider names the queue's owner in
    // its own effect, and a parent's effects run after its children's.
    const first = setTimeout(check, 0);
    const id = setInterval(check, 5000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);

  if (dismissed || pending.count === 0) return null;

  return (
    <div
      role="status"
      className="mb-3 flex items-start gap-3 rounded-xl border border-vital-warning-border bg-vital-warning-surface px-4 py-2"
    >
      <AlertTriangle className="mt-2.5 h-5 w-5 shrink-0 text-vital-warning" aria-hidden="true" />
      <p className="flex-1 py-2 text-sm font-medium text-vital-warning-fg">
        {otherUsersPendingMessage(pending.count, pending.names)}
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Hide this notice"
        className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-vital-warning-fg"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
};

export default OtherUsersPendingNotice;
