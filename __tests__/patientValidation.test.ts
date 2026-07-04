import { describe, it, expect } from 'vitest';
import {
  validateName,
  validateDiagnosis,
  validateMobile,
  validateAge,
} from '../utils/patientValidation';

describe('validateName', () => {
  it('rejects empty / whitespace names', () => {
    expect(validateName('')).toMatch(/required/i);
    expect(validateName('   ')).toMatch(/required/i);
  });
  it('accepts a real name', () => {
    expect(validateName('Ramesh')).toBeNull();
  });
});

describe('validateDiagnosis', () => {
  it('is required', () => {
    expect(validateDiagnosis('')).toMatch(/required/i);
    expect(validateDiagnosis('# NOF')).toBeNull();
  });
});

describe('validateMobile', () => {
  it('allows empty (optional field)', () => {
    expect(validateMobile('')).toBeNull();
  });
  it('accepts a valid 10-digit Indian number (ignoring spaces)', () => {
    expect(validateMobile('9876543210')).toBeNull();
    expect(validateMobile('98765 43210')).toBeNull();
  });
  it('rejects wrong length or leading digit < 6', () => {
    expect(validateMobile('12345')).toMatch(/valid/i);
    expect(validateMobile('5876543210')).toMatch(/valid/i);
    expect(validateMobile('98765432101')).toMatch(/valid/i);
  });
});

describe('validateAge', () => {
  it('accepts 1–120 as number or string', () => {
    expect(validateAge(45)).toBeNull();
    expect(validateAge('45')).toBeNull();
    expect(validateAge(1)).toBeNull();
    expect(validateAge(120)).toBeNull();
  });
  it('rejects 0, negatives, > 120 and non-numeric', () => {
    expect(validateAge(0)).toMatch(/between/i);
    expect(validateAge(-3)).toMatch(/between/i);
    expect(validateAge(121)).toMatch(/between/i);
    expect(validateAge('abc')).toMatch(/between/i);
  });
});
