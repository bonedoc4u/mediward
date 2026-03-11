import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { patientToFhirResource, patientsToFhirBundle, downloadFhirBundle } from '../services/fhirService';
import { Patient, PatientStatus, PacStatus, Gender } from '../types';

const makePatient = (overrides: Partial<Patient> = {}): Patient => ({
  ipNo: 'IP001',
  name: 'Ravi Kumar',
  mobile: '9876543210',
  age: 52,
  gender: Gender.Male,
  ward: 'Ortho Ward',
  bed: '5',
  diagnosis: 'Intertrochanteric fracture',
  comorbidities: [],
  doa: '2024-03-01',
  pacStatus: PacStatus.Fit,
  patientStatus: PatientStatus.Fit,
  dailyRounds: [],
  investigations: [],
  labResults: [],
  todos: [],
  ...overrides,
});

// ─── patientToFhirResource ────────────────────────────────────────────────────

describe('patientToFhirResource', () => {
  it('returns resourceType "Patient"', () => {
    const r = patientToFhirResource(makePatient()) as any;
    expect(r.resourceType).toBe('Patient');
  });

  it('uses ipNo as the FHIR resource id', () => {
    const r = patientToFhirResource(makePatient({ ipNo: 'IP999' })) as any;
    expect(r.id).toBe('IP999');
  });

  it('sets the NDHM FHIR profile URL in meta', () => {
    const r = patientToFhirResource(makePatient()) as any;
    expect(r.meta.profile).toContain('https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient');
  });

  it('encodes ipNo in the identifier array', () => {
    const r = patientToFhirResource(makePatient({ ipNo: 'IP123' })) as any;
    const id = (r.identifier as any[]).find((i: any) => i.system === 'urn:in.hospital.ip_number');
    expect(id?.value).toBe('IP123');
  });

  it('encodes patient name with use:official', () => {
    const r = patientToFhirResource(makePatient({ name: 'Priya Menon' })) as any;
    expect(r.name[0].use).toBe('official');
    expect(r.name[0].text).toBe('Priya Menon');
  });

  describe('gender mapping', () => {
    it('maps Male → "male"', () => {
      expect((patientToFhirResource(makePatient({ gender: Gender.Male })) as any).gender).toBe('male');
    });

    it('maps Female → "female"', () => {
      expect((patientToFhirResource(makePatient({ gender: Gender.Female })) as any).gender).toBe('female');
    });

    it('maps Other → "other"', () => {
      expect((patientToFhirResource(makePatient({ gender: Gender.Other })) as any).gender).toBe('other');
    });

    it('maps unrecognised string → "other" (fallback)', () => {
      // @ts-expect-error — testing unrecognised gender
      expect((patientToFhirResource(makePatient({ gender: 'X' })) as any).gender).toBe('other');
    });
  });

  it('derives birthDate from age as Jan-1 of birth year (relative to doa)', () => {
    // estimateBirthDate uses the doa year, not the current year
    const patient = makePatient({ age: 30, doa: '2024-03-01' });
    const r = patientToFhirResource(patient) as any;
    expect(r.birthDate).toBe('1994-01-01'); // 2024 - 30
  });

  it('includes mobile in telecom when present', () => {
    const r = patientToFhirResource(makePatient({ mobile: '9876543210' })) as any;
    expect(r.telecom).toBeDefined();
    expect(r.telecom[0].value).toBe('9876543210');
    expect(r.telecom[0].system).toBe('phone');
  });

  it('omits telecom entries when mobile is empty', () => {
    const r = patientToFhirResource(makePatient({ mobile: '' })) as any;
    // Current implementation returns empty array rather than undefined
    expect(r.telecom == null || (Array.isArray(r.telecom) && r.telecom.length === 0)).toBe(true);
  });

  it('includes ABHA identifier when abhaId is present', () => {
    const r = patientToFhirResource(makePatient({ abhaId: 'ABHA12345' })) as any;
    const abha = (r.identifier as any[]).find((i: any) => i.system?.includes('healthid'));
    expect(abha?.value).toBe('ABHA12345');
  });

  it('omits ABHA identifier when abhaId is absent', () => {
    const r = patientToFhirResource(makePatient({ abhaId: undefined })) as any;
    const abha = (r.identifier as any[]).find((i: any) => i.system?.includes('healthid'));
    expect(abha).toBeUndefined();
  });
});

// ─── patientsToFhirBundle ─────────────────────────────────────────────────────

describe('patientsToFhirBundle', () => {
  it('returns resourceType "Bundle"', () => {
    const b = patientsToFhirBundle([makePatient()]);
    expect(b.resourceType).toBe('Bundle');
  });

  it('sets type to "collection"', () => {
    expect(patientsToFhirBundle([]).type).toBe('collection');
  });

  it('sets total to the number of patients', () => {
    const patients = [makePatient({ ipNo: 'IP001' }), makePatient({ ipNo: 'IP002' })];
    expect(patientsToFhirBundle(patients).total).toBe(2);
  });

  it('creates one entry per patient', () => {
    const patients = [makePatient({ ipNo: 'IP001' }), makePatient({ ipNo: 'IP002' })];
    const bundle = patientsToFhirBundle(patients);
    expect(bundle.entry).toHaveLength(2);
  });

  it('sets fullUrl using urn:hospital:Patient/{ipNo} pattern', () => {
    const bundle = patientsToFhirBundle([makePatient({ ipNo: 'IP777' })]);
    expect(bundle.entry[0].fullUrl).toBe('urn:hospital:Patient/IP777');
  });

  it('includes a timestamp ISO string', () => {
    const bundle = patientsToFhirBundle([]);
    expect(() => new Date(bundle.timestamp)).not.toThrow();
    expect(bundle.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('handles empty patients array', () => {
    const bundle = patientsToFhirBundle([]);
    expect(bundle.total).toBe(0);
    expect(bundle.entry).toHaveLength(0);
  });
});

// ─── downloadFhirBundle ───────────────────────────────────────────────────────

describe('downloadFhirBundle', () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;
  const fakeUrl = 'blob:http://localhost/fake-uuid';
  const fakeAnchor = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;

  beforeEach(() => {
    createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor);
    createObjectURLSpy = vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue(fakeUrl),
      revokeObjectURL: vi.fn(),
    });
    revokeObjectURLSpy = createObjectURLSpy; // same stub
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates an anchor element and triggers click', () => {
    downloadFhirBundle([makePatient()]);
    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(fakeAnchor.click).toHaveBeenCalled();
  });

  it('sets the download filename to the provided name', () => {
    downloadFhirBundle([makePatient()], 'test-export.json');
    expect(fakeAnchor.download).toBe('test-export.json');
  });

  it('uses a dated default filename when no name is given', () => {
    downloadFhirBundle([makePatient()]);
    expect(fakeAnchor.download).toMatch(/^fhir-bundle-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('sets the anchor href to the blob URL', () => {
    downloadFhirBundle([makePatient()]);
    expect(fakeAnchor.href).toBe(fakeUrl);
  });
});
