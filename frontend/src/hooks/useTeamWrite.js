import { useUser } from '../context/UserContext';
import { canWriteTeamResources, currentTeamRole } from '../utils/teamDisplay';

export function useTeamWrite() {
  const user = useUser();
  return canWriteTeamResources(user);
}

export function useTeamRole() {
  const user = useUser();
  return currentTeamRole(user);
}
