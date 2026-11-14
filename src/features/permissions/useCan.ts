import { useAuth } from '../../../contexts/AuthContext';
import { can, type Permission } from '../../../utils/permissions';

/** May the signed-in user do this? Use it to hide or disable a control. */
export function useCan(permission: Permission): boolean {
  const { user } = useAuth();
  return can(user, permission);
}
