import { Patient } from '../types';
import { OTPatient, OTType } from './otListTypes';

/**
 * Builds a new OT-list entry for a patient being added to a specific
 * category (e.g. "TABLE 1"). Used by every "add this pending patient to
 * the list" entry point (the "+" button and drag-to-assign) so they can
 * never produce a different result from each other.
 */
export function buildOTPatientEntry(
  patient: Patient,
  otType: OTType,
  category: string,
  existingInCategory: OTPatient[],
): OTPatient {
  const maxSeq = Math.max(0, ...existingInCategory.map(p => p.sequence));
  return {
    id: crypto.randomUUID(),
    sequence: maxSeq + 1,
    ipNo: patient.ipNo,
    name: patient.name,
    age: patient.age.toString(),
    gender: patient.gender === 'Male' ? 'M' : patient.gender === 'Female' ? 'F' : '',
    ward: patient.ward.replace(/Ward\s*/i, '').trim(),
    unit: patient.unit ?? 'OR1',
    diagnosis: patient.diagnosis,
    procedure: patient.procedure ?? '',
    side: '', anesthesia: '', cArm: 'No', implants: '',
    remarks: patient.comorbidities.join(', '),
    category,
    otType,
  };
}
