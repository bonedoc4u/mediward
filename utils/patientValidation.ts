/**
 * patientValidation.ts — single source of truth for patient field rules.
 *
 * Extracted from AddPatientModal's step validation so the admission form and
 * the inline section editors on the patient detail screen validate identically
 * (no forked rules). Each validator returns a human-readable error string, or
 * null when the value is acceptable.
 */

/** Indian mobile: 10 digits starting 6–9. */
export const MOBILE_RE = /^[6-9]\d{9}$/;

export function validateName(name: string): string | null {
  return name.trim() ? null : 'Patient name is required.';
}

export function validateDiagnosis(diagnosis: string): string | null {
  return diagnosis.trim() ? null : 'Diagnosis is required.';
}

/** Mobile is optional; when present it must be a valid Indian number. */
export function validateMobile(mobile: string): string | null {
  const m = mobile.replace(/\s/g, '');
  if (m && !MOBILE_RE.test(m)) return 'Mobile number must be a valid 10-digit Indian number.';
  return null;
}

export function validateAge(age: string | number): string | null {
  const n = typeof age === 'number' ? age : parseInt(age, 10);
  if (Number.isNaN(n) || n <= 0 || n > 120) return 'Age must be between 1 and 120.';
  return null;
}
