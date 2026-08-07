import { describe, it, expect } from 'vitest';
import { isSessionValid } from '../utils/sessionValidity';
import { UserRole } from '../types';

const makeSession = (sessionExpiry: number) => ({
  id: 'u1', email: 'doc@hospital.com', name: 'Dr. Test',
  role: 'resident' as UserRole, hospitalId: 'h1', sessionExpiry,
});

describe('isSessionValid', () => {
  it('is true for a session that has not expired yet', () => {
    expect(isSessionValid(makeSession(2000), 1000)).toBe(true);
  });

  it('is false for a session exactly at its expiry instant', () => {
    expect(isSessionValid(makeSession(1000), 1000)).toBe(false);
  });

  it('is false for an expired session', () => {
    expect(isSessionValid(makeSession(1000), 2000)).toBe(false);
  });

  it('is false for null (no session)', () => {
    expect(isSessionValid(null, 1000)).toBe(false);
  });
});
