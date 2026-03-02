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
  | 'team:manage';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'patient:add', 'patient:edit', 'patient:delete', 'patient:discharge',
    'rounds:write', 'labs:write', 'investigations:write',
    'pac:write', 'preop:write', 'otlist:write', 'team:manage',
  ],
  resident: [
    'patient:add', 'patient:edit', 'patient:discharge',
    'rounds:write', 'labs:write', 'investigations:write',
    'pac:write', 'preop:write', 'otlist:write',
  ],
  house_surgeon: [
    'patient:add', 'patient:edit',
    'rounds:write', 'labs:write', 'investigations:write',
    'pac:write', 'preop:write', 'otlist:write',
  ],
  attending: [],   // view only
};

export function can(user: AuthUser | null, permission: Permission): boolean {
  if (!user) return false;
  return (ROLE_PERMISSIONS[user.role] ?? []).includes(permission);
}

// Human-readable descriptions shown in Team Management
export const ROLE_LABELS: Record<UserRole, string> = {
  admin:         'Admin',
  resident:      'Resident',
  house_surgeon: 'House Surgeon',
  attending:     'Attending (View Only)',
};

export const ROLE_ACCESS_DESC: Record<UserRole, string> = {
  admin:         'Full access + manage users',
  resident:      'Add / edit / discharge patients, all clinical tools',
  house_surgeon: 'Add / edit patients, all clinical tools (no discharge)',
  attending:     'View only — cannot add, edit or discharge',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  admin:         'bg-red-100 text-red-800',
  resident:      'bg-blue-100 text-blue-800',
  house_surgeon: 'bg-indigo-100 text-indigo-700',
  attending:     'bg-slate-100 text-slate-600',
};
