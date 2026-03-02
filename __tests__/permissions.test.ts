import { describe, it, expect } from 'vitest';
import { can, Permission } from '../utils/permissions';
import { AuthUser, UserRole } from '../types';

const ALL_PERMISSIONS: Permission[] = [
  'patient:add', 'patient:edit', 'patient:delete', 'patient:discharge',
  'rounds:write', 'labs:write', 'investigations:write',
  'pac:write', 'preop:write', 'otlist:write', 'team:manage',
];

const makeUser = (role: UserRole): AuthUser => ({
  id: 'u1',
  email: 'test@hospital.com',
  name: 'Test User',
  role,
  sessionExpiry: Date.now() + 3_600_000,
});

describe('can() – null / unauthenticated', () => {
  it('returns false for null user on any permission', () => {
    ALL_PERMISSIONS.forEach(p => {
      expect(can(null, p)).toBe(false);
    });
  });
});

describe('can() – admin role', () => {
  const admin = makeUser('admin');

  it('grants all 11 permissions', () => {
    ALL_PERMISSIONS.forEach(p => {
      expect(can(admin, p), `admin should have ${p}`).toBe(true);
    });
  });

  it('grants team:manage (user admin access)', () => {
    expect(can(admin, 'team:manage')).toBe(true);
  });

  it('grants patient:delete', () => {
    expect(can(admin, 'patient:delete')).toBe(true);
  });
});

describe('can() – resident role', () => {
  const resident = makeUser('resident');

  it('grants patient:add', ()      => expect(can(resident, 'patient:add')).toBe(true));
  it('grants patient:edit', ()     => expect(can(resident, 'patient:edit')).toBe(true));
  it('grants patient:discharge', () => expect(can(resident, 'patient:discharge')).toBe(true));
  it('grants rounds:write', ()     => expect(can(resident, 'rounds:write')).toBe(true));
  it('grants labs:write', ()       => expect(can(resident, 'labs:write')).toBe(true));
  it('grants pac:write', ()        => expect(can(resident, 'pac:write')).toBe(true));
  it('grants preop:write', ()      => expect(can(resident, 'preop:write')).toBe(true));
  it('grants otlist:write', ()     => expect(can(resident, 'otlist:write')).toBe(true));

  it('denies patient:delete', ()   => expect(can(resident, 'patient:delete')).toBe(false));
  it('denies team:manage', ()      => expect(can(resident, 'team:manage')).toBe(false));
});

describe('can() – house_surgeon role', () => {
  const hs = makeUser('house_surgeon');

  it('grants patient:add', ()          => expect(can(hs, 'patient:add')).toBe(true));
  it('grants patient:edit', ()         => expect(can(hs, 'patient:edit')).toBe(true));
  it('grants rounds:write', ()         => expect(can(hs, 'rounds:write')).toBe(true));
  it('grants labs:write', ()           => expect(can(hs, 'labs:write')).toBe(true));
  it('grants investigations:write', () => expect(can(hs, 'investigations:write')).toBe(true));
  it('grants pac:write', ()            => expect(can(hs, 'pac:write')).toBe(true));
  it('grants preop:write', ()          => expect(can(hs, 'preop:write')).toBe(true));
  it('grants otlist:write', ()         => expect(can(hs, 'otlist:write')).toBe(true));

  it('denies patient:delete', ()       => expect(can(hs, 'patient:delete')).toBe(false));
  it('denies patient:discharge', ()    => expect(can(hs, 'patient:discharge')).toBe(false));
  it('denies team:manage', ()          => expect(can(hs, 'team:manage')).toBe(false));
});

describe('can() – attending role (view-only)', () => {
  const attending = makeUser('attending');

  it('denies all permissions', () => {
    ALL_PERMISSIONS.forEach(p => {
      expect(can(attending, p), `attending must not have ${p}`).toBe(false);
    });
  });

  it('cannot add patients', ()       => expect(can(attending, 'patient:add')).toBe(false));
  it('cannot write rounds', ()       => expect(can(attending, 'rounds:write')).toBe(false));
  it('cannot manage team', ()        => expect(can(attending, 'team:manage')).toBe(false));
  it('cannot delete patients', ()    => expect(can(attending, 'patient:delete')).toBe(false));
  it('cannot discharge patients', () => expect(can(attending, 'patient:discharge')).toBe(false));
});

describe('can() – privilege escalation guard', () => {
  it('attending cannot gain write access by impersonation check', () => {
    const attending = makeUser('attending');
    // Even if attacker checks a write permission, must be denied
    expect(can(attending, 'labs:write')).toBe(false);
    expect(can(attending, 'pac:write')).toBe(false);
    expect(can(attending, 'preop:write')).toBe(false);
  });

  it('house_surgeon cannot discharge — guards surgical sign-off flow', () => {
    const hs = makeUser('house_surgeon');
    expect(can(hs, 'patient:discharge')).toBe(false);
  });
});
