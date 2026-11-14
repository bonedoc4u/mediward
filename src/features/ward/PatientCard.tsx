/**
 * PatientCard — one patient on the phone ward list.
 *
 * Shows the five things a round is run from, in reading order: diagnosis,
 * procedure (with its date), POD, comorbidities (all of them), and the last
 * round note. Plus drug allergies, because a card that hides them is unsafe.
 *
 * Colour rule: red appears only for a patient marked Critical and for
 * allergies. Being in an ICU ward is a location, not a warning, so this
 * component does not even know which ward is an ICU.
 */
import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, FlaskConical, Leaf, Pencil } from 'lucide-react';
import { PacStatus, Patient, PatientStatus } from '../../../types';
import { calculatePOD, getStatusColor, needsPac } from '../../../utils/calculations';
import { formatDayMonth } from '../../../utils/dates';
import { findPreviousNote, findTodayRound, noteMeta, timeLabel } from '../rounds/roundNotes';

interface Props {
  patient: Patient;
  /** Today as YYYY-MM-DD (device time zone). */
  today: string;
  /** Briefly marks the card the user just came back from. */
  highlighted?: boolean;
  onOpen?: () => void;
  onEdit?: () => void;
  onAddLab?: () => void;
  /** Extra row under the card body (the pending list puts the surgery-date control here). */
  footer?: React.ReactNode;
}

/** Strip the ward-number prefix from a bed label: "10-05" → "05", "1A" → "1A". */
const shortBed = (bed: string) => (bed.includes('-') ? bed.split('-').pop()! : bed);

const genderInitial = (gender: string) => (gender ? gender.charAt(0).toUpperCase() : '');

const PatientCard: React.FC<Props> = ({ patient, today, highlighted, onOpen, onEdit, onAddLab, footer }) => {
  const pod = calculatePOD(patient.dos, patient.dod ?? today);
  const isCritical = patient.patientStatus === PatientStatus.Critical;
  const allergies = (patient.drugAllergies ?? []).map(a => a.trim()).filter(Boolean);
  const procedureDate = formatDayMonth(patient.dos);

  const todayRound = findTodayRound(patient.dailyRounds, today);
  const todayNote = (todayRound?.roundNote ?? '').trim();
  const previous = findPreviousNote(patient.dailyRounds, today);
  const roundedAt = timeLabel(todayRound?.roundNoteAt);

  const showPac = !patient.dos;
  const pacPending = showPac && needsPac(patient) && patient.pacStatus === PacStatus.Pending;

  const body = (
    <>
      <div className="flex items-start gap-3">
        <span
          data-critical={isCritical || undefined}
          className={`w-11 h-11 shrink-0 flex items-center justify-center rounded-control text-white text-base font-medium font-mono ${
            isCritical ? 'bg-vital-critical' : 'bg-accent'
          }`}
        >
          {shortBed(patient.bed)}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-base font-bold text-ink leading-snug break-words">{patient.name}</span>
          <span className="block text-sm text-ink-muted">
            {patient.age} {genderInitial(patient.gender)} · {patient.ipNo}
          </span>
        </span>
        {pod !== undefined && (
          <span className="shrink-0 flex flex-col items-center min-w-12 px-2 py-1 rounded-control bg-surface-sunken border border-line">
            <span className="text-xs font-bold text-ink-muted tracking-wide">POD</span>
            <span className="text-xl leading-tight font-mono text-ink">{pod}</span>
          </span>
        )}
      </div>

      {allergies.length > 0 && (
        <span role="note" className="mt-2 flex items-start gap-1.5 text-sm font-bold text-vital-critical-fg">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>Allergy: {allergies.join(', ')}</span>
        </span>
      )}

      <span className="mt-2 block text-base font-bold text-ink leading-snug break-words">{patient.diagnosis}</span>
      {patient.procedure && (
        <span className="block text-sm text-ink break-words">
          {patient.procedure}{procedureDate ? ` · ${procedureDate}` : ''}
        </span>
      )}

      {patient.comorbidities.length > 0 && (
        <span className="mt-2 flex flex-wrap gap-1.5" aria-label="Comorbidities">
          {patient.comorbidities.map(c => (
            <span key={c} className="px-2 py-0.5 rounded-control bg-surface-sunken text-sm font-semibold text-ink">{c}</span>
          ))}
        </span>
      )}

      {/* The note itself. Whether the patient was rounded today is in the
          bottom row, next to the status labels. */}
      {(todayNote || previous) && (
        <span className="mt-2 pt-2 block border-t border-line text-sm text-ink leading-snug line-clamp-2">
          {todayNote ? todayNote : (
            <>
              <span className="font-semibold text-ink-muted">{noteMeta(previous!, today)}: </span>
              {previous!.roundNote}
            </>
          )}
        </span>
      )}
    </>
  );

  return (
    <article
      aria-label={`Bed ${shortBed(patient.bed)}, ${patient.name}`}
      className={`bg-surface-card border border-line rounded-card mb-2 ${highlighted ? 'row-highlight' : ''}`}
    >
      {onOpen ? (
        <button type="button" onClick={onOpen} className="block w-full text-left p-3 rounded-card hover:bg-surface active:bg-surface-sunken transition-colors">
          {body}
        </button>
      ) : (
        <div className="p-3">{body}</div>
      )}

      {footer && <div className="px-3 pb-2">{footer}</div>}

      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0">
          {todayRound ? (
            <span className="flex items-center gap-1 text-sm font-semibold text-vital-normal-fg">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              Rounded today{roundedAt ? ` · ${roundedAt}` : ''}
            </span>
          ) : (
            <span className="text-sm text-ink-muted">Not rounded today</span>
          )}
          {showPac && (
            needsPac(patient) ? (
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(patient.pacStatus)}`}>
                {pacPending && <AlertCircle className="w-3 h-3" aria-hidden="true" />}
                {patient.pacStatus === PacStatus.Fit && <CheckCircle2 className="w-3 h-3" aria-hidden="true" />}
                {patient.pacStatus}
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-vital-normal-surface text-vital-normal-fg border-vital-normal-border">
                <Leaf className="w-3 h-3" aria-hidden="true" /> Conservative
              </span>
            )
          )}
          {patient.patientStatus !== PatientStatus.Fit && (
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(patient.patientStatus)}`}>
              {isCritical && <AlertCircle className="w-3 h-3" aria-hidden="true" />}
              {patient.patientStatus === PatientStatus.DischargeReady && <CheckCircle2 className="w-3 h-3" aria-hidden="true" />}
              {patient.patientStatus === PatientStatus.Review ? 'Needs Review' : patient.patientStatus}
            </span>
          )}
        </div>
        {(onAddLab || onEdit) && (
          <div className="flex gap-2 shrink-0">
            {onAddLab && (
              <button
                type="button"
                onClick={onAddLab}
                aria-label={`Add lab result for ${patient.name}`}
                className="w-11 h-11 flex items-center justify-center rounded-control bg-surface-sunken text-ink-muted hover:bg-accent-soft hover:text-accent-fg transition-colors"
              >
                <FlaskConical className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                aria-label={`Edit ${patient.name}`}
                className="w-11 h-11 flex items-center justify-center rounded-control bg-surface-sunken text-ink-muted hover:bg-accent-soft hover:text-accent-fg transition-colors"
              >
                <Pencil className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
};

export default React.memo(PatientCard);
