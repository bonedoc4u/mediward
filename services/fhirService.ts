/**
 * fhirService.ts
 * FHIR R4 export and import for MediWard patient records.
 *
 * Follows the NDHM (National Digital Health Mission / Ayushman Bharat) R4 profile.
 *   https://nrces.in/ndhm/fhir/r4/
 *
 * Export:  patientToFhirBundle(patient)  → FHIR R4 Document Bundle (JSON)
 * Import:  parseFhirPatient(jsonString)  → Partial<Patient> pre-fills the admit form
 *
 * Legacy exports still available for bulk ward exports:
 *   patientToFhirResource(), patientsToFhirBundle(), downloadFhirBundle()
 */

import { Patient, Gender, DischargeSummary } from '../types';

// ─── Lightweight FHIR R4 type stubs (no external dependency) ─────────────────
type FhirResource = Record<string, unknown>;

interface FhirCoding    { system?: string; code?: string; display?: string }
interface FhirCodeable  { coding?: FhirCoding[]; text?: string }
interface FhirReference { reference?: string; display?: string }
interface FhirPeriod    { start?: string; end?: string }
interface FhirSection   { title?: string; code?: FhirCodeable; text?: { status: string; div: string } }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fhirGender(g: Gender): 'male' | 'female' | 'other' {
  if (g === Gender.Male)   return 'male';
  if (g === Gender.Female) return 'female';
  return 'other';
}

function estimateBirthDate(age: number, doa: string): string {
  return `${new Date(doa).getFullYear() - age}-01-01`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xhtml(text: string): string {
  return `<div xmlns="http://www.w3.org/1999/xhtml">${escapeXml(text).replace(/\n/g, '<br/>')}</div>`;
}

function ref(type: string, id: string): FhirReference {
  return { reference: `${type}/${id}` };
}

function clinicalStatus(code: string) {
  return { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code }] };
}

// ─── Resource builders ────────────────────────────────────────────────────────

function buildPatient(p: Patient): FhirResource {
  const identifiers: FhirResource[] = [];
  if (p.abhaId) {
    identifiers.push({ type: { text: 'ABHA' }, system: 'https://healthid.ndhm.gov.in', value: p.abhaId });
  }
  identifiers.push({ type: { text: 'IP Number' }, system: 'urn:in.hospital.ip_number', value: p.ipNo });

  return {
    resourceType: 'Patient',
    id: p.ipNo,
    meta: { profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient'] },
    identifier: identifiers,
    name: [{ use: 'official', text: p.name }],
    gender: fhirGender(p.gender),
    birthDate: estimateBirthDate(p.age, p.doa),
    telecom: p.mobile ? [{ system: 'phone', value: p.mobile, use: 'mobile' }] : [],
  };
}

function buildEncounter(p: Patient): FhirResource {
  const period: FhirPeriod = { start: p.doa ?? new Date().toISOString().split('T')[0] };
  if (p.dod) period.end = p.dod;
  return {
    resourceType: 'Encounter',
    id: `enc-${p.ipNo}`,
    status: p.patientStatus === 'Discharged' ? 'finished' : 'in-progress',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'IMP', display: 'inpatient encounter' },
    serviceType: p.unit ? { text: `Unit: ${p.unit}` } : undefined,
    subject: ref('Patient', p.ipNo),
    period,
    location: [{ location: { display: `Ward: ${p.ward}, Bed: ${p.bed}` } }],
  };
}

function buildConditions(p: Patient): FhirResource[] {
  const base = (id: string, code: string, cat: string, status: string): FhirResource => ({
    resourceType: 'Condition',
    id,
    clinicalStatus: clinicalStatus(status),
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-category', code: cat }] }],
    code: { text: code } as FhirCodeable,
    subject: ref('Patient', p.ipNo),
    encounter: ref('Encounter', `enc-${p.ipNo}`),
  });

  const isResolved = p.patientStatus === 'Discharged';
  const conditions: FhirResource[] = [
    { ...base(`cond-${p.ipNo}-primary`, p.diagnosis, 'encounter-diagnosis', isResolved ? 'resolved' : 'active'), onsetDateTime: p.doa },
  ];
  p.comorbidities.forEach((c, i) =>
    conditions.push(base(`cond-${p.ipNo}-comorbid-${i}`, c, 'problem-list-item', 'active')),
  );
  return conditions;
}

function buildObservations(p: Patient): FhirResource[] {
  return p.labResults.map(lab => ({
    resourceType: 'Observation',
    id: `obs-${lab.id}`,
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' }] }],
    code: { text: lab.type } as FhirCodeable,
    subject: ref('Patient', p.ipNo),
    encounter: ref('Encounter', `enc-${p.ipNo}`),
    effectiveDateTime: lab.date,
    valueQuantity: { value: lab.value },
  }));
}

function buildDiagnosticReports(p: Patient): FhirResource[] {
  return p.investigations.map(inv => ({
    resourceType: 'DiagnosticReport',
    id: `dr-${inv.id}`,
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'RAD', display: 'Radiology' }] }],
    code: { text: inv.type } as FhirCodeable,
    subject: ref('Patient', p.ipNo),
    encounter: ref('Encounter', `enc-${p.ipNo}`),
    effectiveDateTime: inv.date,
    conclusion: inv.findings,
  }));
}

function buildProcedure(p: Patient): FhirResource | null {
  if (!p.procedure) return null;
  return {
    resourceType: 'Procedure',
    id: `proc-${p.ipNo}`,
    status: p.dos ? 'completed' : (p.plannedDos ? 'preparation' : 'unknown'),
    code: { text: p.procedure } as FhirCodeable,
    subject: ref('Patient', p.ipNo),
    encounter: ref('Encounter', `enc-${p.ipNo}`),
    ...(p.dos ? { performedDateTime: p.dos } : {}),
  };
}

function buildCompositionSections(p: Patient): FhirSection[] {
  const sec = (title: string, loincCode: string, display: string, text: string): FhirSection => ({
    title,
    code: { coding: [{ system: 'http://loinc.org', code: loincCode, display }] },
    text: { status: 'generated', div: xhtml(text) },
  });

  const sections: FhirSection[] = [];
  const ds: DischargeSummary | undefined = p.dischargeSummary;

  if (ds) {
    if (ds.hospitalCourse)        sections.push(sec('Hospital Course',        '8648-8',  'Hospital course',        ds.hospitalCourse));
    if (ds.conditionAtDischarge)  sections.push(sec('Condition at Discharge', '8651-2',  'Discharge condition',    ds.conditionAtDischarge));
    if (ds.dischargeMedications)  sections.push(sec('Discharge Medications',  '10183-2', 'Discharge medications',  ds.dischargeMedications));
    if (ds.followUpInstructions)  sections.push(sec('Follow-up Instructions', '8653-8',  'Follow-up instructions', ds.followUpInstructions));
    if (ds.woundCare)             sections.push(sec('Wound Care',             '34879-9', 'Wound care',             ds.woundCare));
    if (ds.restrictions)          sections.push(sec('Activity Restrictions',  '74205-5', 'Activity restrictions',  ds.restrictions));
  }

  if (p.dailyRounds.length > 0) {
    const notes = p.dailyRounds.map(r => `${r.date}: ${r.note}`).join('\n');
    sections.push(sec('Clinical Progress Notes', '11506-3', 'Progress note', notes));
  }

  return sections;
}

function buildComposition(p: Patient): FhirResource {
  return {
    resourceType: 'Composition',
    id: `comp-${p.ipNo}`,
    status: p.dischargeSummary ? 'final' : 'preliminary',
    type: { coding: [{ system: 'http://loinc.org', code: '60591-5', display: 'Patient summary Document' }] },
    subject: ref('Patient', p.ipNo),
    encounter: ref('Encounter', `enc-${p.ipNo}`),
    date: p.dod ?? new Date().toISOString(),
    author: [{ display: p.dischargeSummary?.attendingDoctor ?? 'Attending Physician' }],
    title: p.dischargeSummary ? 'Discharge Summary' : 'Inpatient Patient Summary',
    section: buildCompositionSections(p),
  };
}

// ─── Public: per-patient FHIR R4 Document Bundle ──────────────────────────────

export interface FhirBundleSummary {
  conditionCount: number;
  observationCount: number;
  diagnosticReportCount: number;
  procedureCount: number;
  hasDischargeSummary: boolean;
  hasAbhaId: boolean;
}

/**
 * Convert a MediWard Patient into a FHIR R4 Document Bundle.
 * Returns the bundle JSON object and a summary for the UI.
 */
export function patientToFhirBundle(patient: Patient): { bundle: FhirResource; summary: FhirBundleSummary } {
  const patientRes   = buildPatient(patient);
  const encounterRes = buildEncounter(patient);
  const conditions   = buildConditions(patient);
  const observations = buildObservations(patient);
  const reports      = buildDiagnosticReports(patient);
  const procedure    = buildProcedure(patient);
  const composition  = buildComposition(patient);

  const bundle: FhirResource = {
    resourceType: 'Bundle',
    id: `bundle-${patient.ipNo}`,
    meta: { profile: ['https://nrces.in/ndhm/fhir/r4/StructureDefinition/Bundle'] },
    type: 'document',
    timestamp: new Date().toISOString(),
    identifier: { system: 'urn:in.hospital.bundle', value: patient.ipNo },
    entry: [
      { fullUrl: `urn:uuid:comp-${patient.ipNo}`,    resource: composition },
      { fullUrl: `urn:uuid:${patient.ipNo}`,         resource: patientRes },
      { fullUrl: `urn:uuid:enc-${patient.ipNo}`,     resource: encounterRes },
      ...conditions.map(r   => ({ fullUrl: `urn:uuid:${r.id}`, resource: r })),
      ...observations.map(r => ({ fullUrl: `urn:uuid:${r.id}`, resource: r })),
      ...reports.map(r      => ({ fullUrl: `urn:uuid:${r.id}`, resource: r })),
      ...(procedure ? [{ fullUrl: `urn:uuid:proc-${patient.ipNo}`, resource: procedure }] : []),
    ],
  };

  return {
    bundle,
    summary: {
      conditionCount:        conditions.length,
      observationCount:      observations.length,
      diagnosticReportCount: reports.length,
      procedureCount:        procedure ? 1 : 0,
      hasDischargeSummary:   !!patient.dischargeSummary,
      hasAbhaId:             !!patient.abhaId,
    },
  };
}

// ─── Public: FHIR import — parse Patient/Bundle → Partial<Patient> ───────────

/**
 * Parse a FHIR R4 Patient resource or Document Bundle (JSON string).
 * Returns matched fields as Partial<Patient> to pre-fill the admit form.
 * Throws a user-friendly Error on invalid JSON or missing Patient resource.
 */
export function parseFhirPatient(json: string): Partial<Patient> {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error('Invalid JSON. Paste a valid FHIR Patient or Bundle resource.');
  }

  let pr: Record<string, unknown> | null = null;
  if (raw.resourceType === 'Patient') {
    pr = raw;
  } else if (raw.resourceType === 'Bundle') {
    if (!Array.isArray(raw.entry)) {
      throw new Error('FHIR Bundle is missing a valid "entry" array.');
    }
    type Entry = { resource?: Record<string, unknown> };
    const entries = raw.entry as Entry[];
    if (entries.length === 0) {
      throw new Error('FHIR Bundle is empty — no resources found.');
    }
    pr = entries.find(e => e?.resource?.resourceType === 'Patient')?.resource ?? null;
    if (!pr) {
      const found = entries.map(e => e?.resource?.resourceType).filter(Boolean).join(', ');
      throw new Error(`No Patient resource found in Bundle. Found: ${found || 'unknown resource types'}.`);
    }
  } else if (raw.resourceType) {
    throw new Error(`Unsupported resource type "${raw.resourceType}". Paste a FHIR Patient or Bundle.`);
  }
  if (!pr) throw new Error('No FHIR Patient resource found. Paste a FHIR Patient or Bundle JSON.');

  const result: Partial<Patient> = {};

  // Name
  type HName = { text?: string; given?: string[]; family?: string; prefix?: string[] };
  const nm = pr.name as HName[] | undefined;
  if (nm?.[0]) {
    const n = nm[0];
    result.name = n.text ?? [...(n.prefix ?? []), ...(n.given ?? []), n.family].filter(Boolean).join(' ');
  }

  // Gender
  const gMap: Record<string, Gender> = { male: Gender.Male, female: Gender.Female, other: Gender.Other };
  const fg = pr.gender as string | undefined;
  if (fg && gMap[fg]) result.gender = gMap[fg];

  // Mobile
  type TC = { system?: string; value?: string };
  const phone = (pr.telecom as TC[] | undefined)?.find(t => t.system === 'phone');
  if (phone?.value) result.mobile = phone.value;

  // Identifiers
  type ID = { system?: string; value?: string; type?: { text?: string } };
  const ids = pr.identifier as ID[] | undefined;
  const abha = ids?.find(i => i.system?.includes('healthid') || i.system?.includes('ndhm'));
  if (abha?.value) result.abhaId = abha.value;
  const ip = ids?.find(i => i.system?.includes('ip_number') || i.type?.text === 'IP Number');
  if (ip?.value) result.ipNo = ip.value;

  // Age from birthDate
  const bd = pr.birthDate as string | undefined;
  if (bd) result.age = new Date().getFullYear() - new Date(bd).getFullYear();

  return result;
}

// ─── Legacy: bulk ward FHIR export (kept for backward compat) ─────────────────

/** @deprecated Use patientToFhirBundle for per-patient exports */
export function patientToFhirResource(p: Patient) {
  return buildPatient(p);
}

/** Export multiple patients as a simple FHIR collection bundle. */
export function patientsToFhirBundle(patients: Patient[]) {
  return {
    resourceType: 'Bundle',
    id: `mediward-export-${Date.now()}`,
    type: 'collection',
    timestamp: new Date().toISOString(),
    total: patients.length,
    entry: patients.map(p => ({ fullUrl: `urn:hospital:Patient/${p.ipNo}`, resource: buildPatient(p) })),
  };
}

/** Trigger a browser download of a bulk FHIR collection bundle. */
export function downloadFhirBundle(patients: Patient[], filename?: string): void {
  const json = JSON.stringify(patientsToFhirBundle(patients), null, 2);
  const blob = new Blob([json], { type: 'application/fhir+json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename ?? `fhir-bundle-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
