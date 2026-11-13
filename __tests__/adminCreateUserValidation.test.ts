import { describe, it, expect } from 'vitest';
import { checkNewUserRequest, HOSPITAL_ROLES } from '../supabase/functions/admin-create-user/validate';

const H1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const H2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const admin = { role: 'admin', hospital_id: H1 };
const superadmin = { role: 'superadmin', hospital_id: H1 };
const request = (over: Record<string, unknown> = {}) => ({
  email: 'new.doctor@test-hospital.mediward.test', password: 'Abcdefgh12', name: 'New Doctor',
  role: 'resident', hospitalId: H1, ...over,
});

describe('admin-create-user request checks', () => {
  it.each(HOSPITAL_ROLES)('lets an admin create a "%s" in their own hospital', (role) => {
    expect(checkNewUserRequest(admin, request({ role }))).toBeNull();
  });

  // Regression (audit SEC-01): `role` was passed straight to the service-role
  // insert, so a hospital admin could create a super-admin.
  it('refuses a hospital admin who asks for a super-admin', () => {
    expect(checkNewUserRequest(admin, request({ role: 'superadmin' })))
      .toEqual({ status: 403, error: expect.stringContaining('super-admin') });
  });

  it('lets a super-admin create a super-admin', () => {
    expect(checkNewUserRequest(superadmin, request({ role: 'superadmin' }))).toBeNull();
  });

  it('refuses a role the database does not know', () => {
    expect(checkNewUserRequest(admin, request({ role: 'god' }))?.status).toBe(400);
  });

  it('refuses an admin creating a user in another hospital', () => {
    expect(checkNewUserRequest(admin, request({ hospitalId: H2 }))?.status).toBe(403);
  });

  it('lets a super-admin create a user in any hospital', () => {
    expect(checkNewUserRequest(superadmin, request({ hospitalId: H2 }))).toBeNull();
  });

  it.each(['resident', 'house_surgeon', 'attending'])('refuses a caller whose role is "%s"', (role) => {
    expect(checkNewUserRequest({ role, hospital_id: H1 }, request())?.status).toBe(403);
  });

  it('refuses a caller with no profile', () => {
    expect(checkNewUserRequest(null, request())?.status).toBe(403);
  });

  it('requires the same 10-character password as sign-in', () => {
    expect(checkNewUserRequest(admin, request({ password: 'Abcdefg12' }))?.error).toContain('10');
    expect(checkNewUserRequest(admin, request({ password: 'Abcdefgh12' }))).toBeNull();
  });

  it('refuses missing or non-text fields', () => {
    expect(checkNewUserRequest(admin, request({ email: '' }))?.status).toBe(400);
    expect(checkNewUserRequest(admin, request({ role: { $ne: 'x' } }))?.status).toBe(400);
  });
});
