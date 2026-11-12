/**
 * AllergyLine — drug allergies, always in the same place under the patient's
 * identity. One of the two things in the app allowed to be red (the other is
 * a patient marked Critical). Renders nothing when there are no allergies.
 */
import React from 'react';
import { AlertTriangle } from 'lucide-react';

const AllergyLine: React.FC<{ allergies?: readonly string[] }> = ({ allergies }) => {
  const list = (allergies ?? []).map(a => a.trim()).filter(Boolean);
  if (list.length === 0) return null;
  return (
    <p
      role="note"
      className="flex items-start gap-2 px-3 py-2 bg-vital-critical-surface border-b border-vital-critical-border text-vital-critical-fg text-sm font-bold select-text"
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      <span>Allergy: {list.join(', ')}</span>
    </p>
  );
};

export default AllergyLine;
