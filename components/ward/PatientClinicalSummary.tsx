import React from 'react';
import type { Patient } from '../../types';
import { latestRoundNote } from '../../utils/roundNotes';
import { relativeDayLabel, shortDate } from '../../utils/dates';

interface Props {
  patient: Pick<Patient, 'diagnosis' | 'procedure' | 'dos' | 'comorbidities' | 'dailyRounds'>;
  /** Today's YYYY-MM-DD (local) — passed in so the whole list agrees on "today". */
  today: string;
}

/**
 * The clinical block of a ward-list patient card: the things a round is
 * actually about — diagnosis, procedure (with its date), every comorbidity and
 * the last round note — so they can be read without opening the patient.
 */
const PatientClinicalSummary: React.FC<Props> = ({ patient, today }) => {
  const lastNote = latestRoundNote(patient.dailyRounds);

  return (
    <div className="text-sm border-t border-line pt-2 space-y-1.5">
      <p className="font-bold text-ink break-words">{patient.diagnosis}</p>

      {patient.procedure && (
        <p className="text-ink break-words">
          {patient.procedure}
          {patient.dos && <span className="text-ink-muted"> · {shortDate(patient.dos)}</span>}
        </p>
      )}

      {/* All comorbidities, wrapping — previously only 2 showed plus a faint "+N more". */}
      {patient.comorbidities.length > 0 && (
        <ul aria-label="Comorbidities" className="flex flex-wrap gap-1.5">
          {patient.comorbidities.map(c => (
            <li key={c} className="px-2 py-0.5 bg-surface-sunken text-ink rounded text-xs font-semibold">{c}</li>
          ))}
        </ul>
      )}

      {lastNote && (
        <div className="border-t border-line pt-1.5">
          <p className="text-xs font-semibold text-ink-muted">Last note · {relativeDayLabel(lastNote.date, today)}</p>
          <p className="text-ink line-clamp-2 break-words">{lastNote.note}</p>
        </div>
      )}
    </div>
  );
};

export default PatientClinicalSummary;
