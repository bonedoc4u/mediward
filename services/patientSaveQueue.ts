/**
 * patientSaveQueue.ts
 * Puts a patient save into the offline queue, remembering when it is an
 * orders-only save (see upsertPatient's `onlyColumns`).
 */
import { Patient } from '../types';
import { enqueue, getQueue } from './syncQueue';

/** A queued patient save. `onlyColumns` is set when only those columns must be sent. */
export type QueuedPatientSave = Patient & { onlyColumns?: readonly string[] };

export function queuePatientSave(patient: Patient, onlyColumns?: readonly string[]): void {
  // The queue keeps ONE save per patient: a new one replaces the old one.
  // An orders-only save must never replace a waiting full save, or the other
  // fields of that full save would be dropped. In that case queue the full
  // record (it already holds the new orders).
  const fullSaveWaiting = getQueue().some(op =>
    op.type === 'upsert_patient'
    && (op.payload as QueuedPatientSave | undefined)?.ipNo === patient.ipNo
    && !(op.payload as QueuedPatientSave).onlyColumns,
  );
  enqueue('upsert_patient', onlyColumns && !fullSaveWaiting ? { ...patient, onlyColumns } : patient);
}

/** Splits a queued save back into the patient and its column limit. */
export function readQueuedPatientSave(payload: unknown): { patient: Patient; onlyColumns?: readonly string[] } {
  const { onlyColumns, ...patient } = payload as QueuedPatientSave;
  return { patient: patient as Patient, onlyColumns };
}
