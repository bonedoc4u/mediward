import { AuthUser, UserRole } from '../types';

export type Permission =
  | 'patient:add'
  | 'patient:edit'
  | 'patient:delete'
  | 'patient:discharge'
  | 'rounds:write'
  | 'labs:write'
  | 'investigations:write'
  | 'pac:write'
  | 'preop:write'
  | 'otlist:write'
  /** Bedside charting: vitals, nursing notes, medications, wound care, intake/output, transfusions. */
  | 'charting:write'
  | 'team:manage';

/**
 * The role table. The database enforces the same table (audit SEC-06), so a
 * change here needs a matching migration; a test compares the two.
 *
 * 'rounds:write' covers the round note and the patient's orders (to-dos).
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  superadmin: [
    'patient:add', 'patient:edit', 'patient:delete', 'patient:discharge',
    'rounds:write', 'labs:write', 'investigations:write',
    'pac:write', 'preop:write', 'otlist:write', 'charting:write', 'team:manage',
  ],
  admin: [
    'patient:add', 'patient:edit', 'patient:delete', 'patient:discharge',
    'rounds:write', 'labs:write', 'investigations:write',
    'pac:write', 'preop:write', 'otlist:write', 'charting:write', 'team:manage',
  ],
  resident: [
    'patient:add', 'patient:edit', 'patient:discharge',
    'rounds:write', 'labs:write', 'investigations:write',
    'pac:write', 'preop:write', 'otlist:write', 'charting:write',
  ],
  house_surgeon: [
    'patient:add', 'patient:edit',
    'rounds:write', 'labs:write', 'investigations:write',
    'pac:write', 'preop:write', 'otlist:write', 'charting:write',
  ],
  // The consultant on the round: writes the round note and orders, reads everything else.
  attending: ['rounds:write'],
};

export function can(user: AuthUser | null, permission: Permission): boolean {
  if (!user) return false;
  return (ROLE_PERMISSIONS[user.role] ?? []).includes(permission);
}

/** Shown whenever a save is refused because of the user's role. */
export const PERMISSION_DENIED_MESSAGE = 'Your role cannot change this.';

/**
 * What a save would change in the stored patient record: the database
 * columns that differ, and the status before and after.
 */
export interface PatientChange {
  columns: readonly string[];
  statusBefore: string;
  statusAfter: string;
}

/** Orders (to-dos) are stored in this column of the patient record. */
export const ORDER_COLUMNS: readonly string[] = ['todos'];

/** True when the save changes the orders and nothing else. */
export function isOrdersOnlyChange(change: PatientChange | null): boolean {
  return !!change && change.columns.length > 0 && change.columns.every(c => ORDER_COLUMNS.includes(c));
}

/**
 * May this user make this change to a stored patient record?
 *
 * Three rules, the same three the database enforces:
 *  1. With 'patient:edit', any column may change —
 *  2. — but a discharge, or undoing one, also needs 'patient:discharge'.
 *  3. Without 'patient:edit', a user with 'rounds:write' may change the
 *     orders and nothing else. Orders are stored inside the patient record,
 *     so "may write orders" has to be decided column by column.
 *
 * `change` is null when the record is not loaded on this phone, so there is
 * nothing to compare with. An editor may go ahead (the database makes the
 * final decision); anybody else may not.
 */
export function canChangePatient(user: AuthUser | null, change: PatientChange | null): boolean {
  if (!user) return false;

  if (can(user, 'patient:edit')) {
    const dischargeTouched = !!change
      && change.statusBefore !== change.statusAfter
      && (change.statusBefore === 'Discharged' || change.statusAfter === 'Discharged');
    return !dischargeTouched || can(user, 'patient:discharge');
  }

  if (!change || !can(user, 'rounds:write')) return false;
  return change.columns.every(c => ORDER_COLUMNS.includes(c));
}

/**
 * Roles the given user may hand out in Team Settings.
 * Only a super-admin (platform owner, sees every hospital) may assign
 * 'superadmin'. The database and the admin-create-user function enforce the
 * same rule; this keeps the option off the screen for hospital admins.
 */
export function assignableRoles(actor: AuthUser | null): UserRole[] {
  if (!actor || (actor.role !== 'admin' && actor.role !== 'superadmin')) return [];
  const all = Object.keys(ROLE_PERMISSIONS) as UserRole[];
  return actor.role === 'superadmin' ? all : all.filter(r => r !== 'superadmin');
}

// Human-readable descriptions shown in Team Management
export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin:    'Super Admin',
  admin:         'Admin',
  resident:      'Resident',
  house_surgeon: 'House Surgeon',
  attending:     'Attending',
};

export const ROLE_ACCESS_DESC: Record<UserRole, string> = {
  superadmin:    'Platform owner — manage all hospitals',
  admin:         'Full access + manage users',
  resident:      'Add / edit / discharge patients, all clinical tools',
  house_surgeon: 'Add / edit patients, all clinical tools (no discharge)',
  attending:     'Round notes and orders — everything else is view only',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  superadmin:    'bg-purple-100 text-purple-800',
  admin:         'bg-red-100 text-red-800',
  resident:      'bg-blue-100 text-blue-800',
  house_surgeon: 'bg-indigo-100 text-indigo-700',
  attending:     'bg-slate-100 text-slate-600',
};
