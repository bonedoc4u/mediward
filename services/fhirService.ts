/**
 * fhirService.ts
 * Exports patient data as FHIR R4 resources.
 * Generates a FHIR Bundle (collection) containing one Patient resource per record.
 *
 * FHIR R4 spec: https://hl7.org/fhir/R4/patient.html
 * Use this for EHR integration, NABH/JCI compliance reporting, or referral letters.
 */

import { Patient } from '../types';

// ─── FHIR R4 Type Shapes ───
interface FhirPatient {
  resourceType: 'Patient';
  id: string;
  meta: { profile: string[] };
  identifier: { system: string; value: string }[];
  name: { use: string; text: string }[];
  gender: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  telecom?: { system: string; value: string; use: string }[];
  extension: { url: string; valueString?: string; valueInteger?: number }[];
}

interface FhirBundleEntry {
  fullUrl: string;
  resource: FhirPatient;
}

interface FhirBundle {
  resourceType: 'Bundle';
  id: string;
  type: 'collection';
  timestamp: string;
  total: number;
  entry: FhirBundleEntry[];
}

// ─── Helpers ───
function genderToFhir(g: string): FhirPatient['gender'] {
  switch (g.toLowerCase()) {
    case 'male':   return 'male';
    case 'female': return 'female';
    case 'other':  return 'other';
    default:       return 'unknown';
  }
}

/** Approximate birth year from age (uses Jan 1 of estimated birth year). */
function ageToBirthDate(age: number): string {
  const year = new Date().getFullYear() - age;
  return `${year}-01-01`;
}

// ─── Patient → FHIR R4 Patient Resource ───
export function patientToFhirResource(p: Patient): FhirPatient {
  const resource: FhirPatient = {
    resourceType: 'Patient',
    id: p.ipNo,
    meta: { profile: ['http://hl7.org/fhir/StructureDefinition/Patient'] },
    identifier: [
      { system: 'urn:hospital:ip_no', value: p.ipNo },
    ],
    name: [{ use: 'official', text: p.name }],
    gender: genderToFhir(p.gender),
    birthDate: ageToBirthDate(p.age),
    extension: [
      { url: 'urn:hospital:ward',             valueString: p.ward },
      { url: 'urn:hospital:bed',              valueString: p.bed },
      { url: 'urn:hospital:diagnosis',        valueString: p.diagnosis },
      { url: 'urn:hospital:admission_date',   valueString: p.doa },
      { url: 'urn:hospital:pac_status',       valueString: p.pacStatus },
      { url: 'urn:hospital:patient_status',   valueString: p.patientStatus },
    ],
  };

  if (p.mobile) {
    resource.telecom = [{ system: 'phone', value: p.mobile, use: 'mobile' }];
  }
  if (p.procedure) {
    resource.extension.push({ url: 'urn:hospital:procedure', valueString: p.procedure });
  }
  if (p.dos) {
    resource.extension.push({ url: 'urn:hospital:surgery_date', valueString: p.dos });
  }
  if (p.pod !== undefined) {
    resource.extension.push({ url: 'urn:hospital:post_op_day', valueInteger: p.pod });
  }
  if (p.unit) {
    resource.extension.push({ url: 'urn:hospital:unit', valueString: p.unit });
  }
  if (p.comorbidities.length > 0) {
    resource.extension.push({ url: 'urn:hospital:comorbidities', valueString: p.comorbidities.join(', ') });
  }

  return resource;
}

// ─── Patients[] → FHIR R4 Bundle ───
export function patientsToFhirBundle(patients: Patient[]): FhirBundle {
  return {
    resourceType: 'Bundle',
    id: `mediward-export-${Date.now()}`,
    type: 'collection',
    timestamp: new Date().toISOString(),
    total: patients.length,
    entry: patients.map(p => ({
      fullUrl: `urn:hospital:Patient/${p.ipNo}`,
      resource: patientToFhirResource(p),
    })),
  };
}

/**
 * Triggers a browser download of the FHIR Bundle as a .json file.
 * Call this from a UI button (admin-gated).
 */
export function downloadFhirBundle(patients: Patient[], filename?: string): void {
  const bundle = patientsToFhirBundle(patients);
  const json   = JSON.stringify(bundle, null, 2);
  const blob   = new Blob([json], { type: 'application/fhir+json' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = filename ?? `fhir-bundle-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
