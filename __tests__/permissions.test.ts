import { describe, it, expect } from 'vitest';
import {
  can, assignableRoles, canChangePatient, canOpenView, isOrdersOnlyChange, Permission, type PatientChange,
} from '../utils/permissions';
import { AuthUser, UserRole } from '../types';

const ALL_PERMISSIONS: Permission[] = [
  'patient:add', 'patient:edit', 'patient:delete', 'patient:discharge',
  'rounds:write', 'labs:write', 'investigations:write',
  'pac:write', 'preop:write', 'otlist:write', 'charting:write', 'team:manage',
];

const makeUser = (role: UserRole): AuthUser => ({
  id: 'u1',
  email: 'test@hospital.com',
  name: 'Test User',
  role,
  hospitalId: '00000000-0000-0000-0000-000000000001',
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

// Decided with the department on 13 Nov 2026 (audit SEC-06): the consultant on
// the round writes the round note and orders, and reads everything else.
describe('can() – attending role (round notes and orders only)', () => {
  const attending = makeUser('attending');

  it('may write round notes and orders', () => expect(can(attending, 'rounds:write')).toBe(true));

  it('has no other permission', () => {
    ALL_PERMISSIONS.filter(p => p !== 'rounds:write').forEach(p => {
      expect(can(attending, p), `attending must not have ${p}`).toBe(false);
    });
  });
});

describe('can() – bedside charting (vitals, nursing notes, medications, wound care, intake/output, transfusions)', () => {
  it.each(['superadmin', 'admin', 'resident', 'house_surgeon'] as UserRole[])('%s may chart', role => {
    expect(can(makeUser(role), 'charting:write')).toBe(true);
  });
  it('attending may not chart', () => expect(can(makeUser('attending'), 'charting:write')).toBe(false));
});

// The three rules for changing a stored patient record. The database trigger
// enforces the same three; this is the app's copy.
describe('canChangePatient()', () => {
  const change = (columns: string[], statusBefore = 'Fit', statusAfter = statusBefore): PatientChange =>
    ({ columns, statusBefore, statusAfter });

  describe('rule 1 — an editor may change any column', () => {
    it.each(['admin', 'resident', 'house_surgeon'] as UserRole[])('%s changes the diagnosis', role => {
      expect(canChangePatient(makeUser(role), change(['diagnosis']))).toBe(true);
    });
    it('an editor may save a record that is not loaded on this phone (the database decides)', () => {
      expect(canChangePatient(makeUser('resident'), null)).toBe(true);
    });
  });

  describe('rule 2 — a discharge, or undoing one, needs patient:discharge', () => {
    it('resident discharges', () => {
      expect(canChangePatient(makeUser('resident'), change(['patient_status', 'dod'], 'Fit', 'Discharged'))).toBe(true);
    });
    it('house surgeon cannot discharge', () => {
      expect(canChangePatient(makeUser('house_surgeon'), change(['patient_status', 'dod'], 'Fit', 'Discharged'))).toBe(false);
    });
    it('house surgeon cannot undo a discharge', () => {
      expect(canChangePatient(makeUser('house_surgeon'), change(['patient_status'], 'Discharged', 'Fit'))).toBe(false);
    });
    it('house surgeon may mark a patient ready for discharge (that is not a discharge)', () => {
      expect(canChangePatient(makeUser('house_surgeon'), change(['patient_status'], 'Fit', 'Discharge Ready'))).toBe(true);
    });
    it('house surgeon may correct the record of a patient who is already discharged', () => {
      expect(canChangePatient(makeUser('house_surgeon'), change(['discharge_summary'], 'Discharged'))).toBe(true);
    });
  });

  describe('rule 3 — without patient:edit, only the orders may change', () => {
    const attending = makeUser('attending');
    it('attending ticks or adds an order', () => {
      expect(canChangePatient(attending, change(['todos']))).toBe(true);
    });
    it('attending cannot change the diagnosis', () => {
      expect(canChangePatient(attending, change(['diagnosis']))).toBe(false);
    });
    it('attending cannot slip another column in beside the orders', () => {
      expect(canChangePatient(attending, change(['todos', 'drug_allergies']))).toBe(false);
    });
    it('attending cannot discharge', () => {
      expect(canChangePatient(attending, change(['patient_status'], 'Fit', 'Discharged'))).toBe(false);
    });
    it('attending cannot save a record that is not loaded here (nothing to compare with)', () => {
      expect(canChangePatient(attending, null)).toBe(false);
    });
  });

  it('nobody signed in: refused', () => expect(canChangePatient(null, change(['todos']))).toBe(false));
});

describe('isOrdersOnlyChange()', () => {
  const c = (columns: string[]): PatientChange => ({ columns, statusBefore: 'Fit', statusAfter: 'Fit' });
  it('true when only the orders changed', () => expect(isOrdersOnlyChange(c(['todos']))).toBe(true));
  it('false when another column changed too', () => expect(isOrdersOnlyChange(c(['todos', 'bed']))).toBe(false));
  it('false when nothing changed', () => expect(isOrdersOnlyChange(c([]))).toBe(false));
  it('false when there is nothing to compare with', () => expect(isOrdersOnlyChange(null)).toBe(false));
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

// Regression (audit SEC-01): Team Settings offered "Super Admin" to every
// hospital admin. A super-admin can read and change every hospital's patients.
describe('assignableRoles() – who may hand out which role', () => {
  const actor = (role: UserRole): AuthUser => ({
    id: 'u1', email: 'x@test', name: 'X', role, sessionExpiry: Date.now() + 1000,
  } as AuthUser);

  it('a hospital admin can assign every role except super-admin', () => {
    expect(assignableRoles(actor('admin')).sort()).toEqual(['admin', 'attending', 'house_surgeon', 'resident']);
  });

  it('only a super-admin can assign super-admin', () => {
    expect(assignableRoles(actor('superadmin'))).toContain('superadmin');
  });

  it.each(['resident', 'house_surgeon', 'attending'] as UserRole[])('a %s can assign nothing', (role) => {
    expect(assignableRoles(actor(role))).toEqual([]);
  });

  it('nobody signed in can assign nothing', () => {
    expect(assignableRoles(null)).toEqual([]);
  });
});

// Regression (audit SEC-06 step 4): the menu hid Configuration, Team and the
// audit log from non-admins, but typing the address (#/settings) opened them.
describe('canOpenView() – admin-only screens', () => {
  const ADMIN_VIEWS = ['settings', 'team', 'audit'];

  it.each(['admin', 'superadmin'] as UserRole[])('%s can open every admin screen', (role) => {
    ADMIN_VIEWS.forEach(view => expect(canOpenView(makeUser(role), view), view).toBe(true));
  });

  it.each(['resident', 'house_surgeon', 'attending'] as UserRole[])('%s cannot open any admin screen', (role) => {
    ADMIN_VIEWS.forEach(view => expect(canOpenView(makeUser(role), view), view).toBe(false));
  });

  it('every role can open the ordinary screens', () => {
    (['resident', 'house_surgeon', 'attending', 'admin'] as UserRole[]).forEach(role => {
      ['dashboard', 'rounds', 'otlist', 'patient', 'labs'].forEach(view =>
        expect(canOpenView(makeUser(role), view), `${role} → ${view}`).toBe(true));
    });
  });

  it('nobody signed in cannot open an admin screen', () => {
    expect(canOpenView(null, 'settings')).toBe(false);
  });
});
