import { Navigate, useLocation } from 'react-router-dom';
import { useUser } from '../../context/UserContext';
import { isPlatformSuperAdmin } from '../../utils/teamDisplay';
import NoTeamPage from '../../pages/NoTeamPage';

/**
 * 无空间用户仅能访问 /admin（超管）或空态页。
 */
export default function TeamMembershipGate({ children }) {
  const user = useUser();
  const location = useLocation();
  const teams = user?.teams || [];
  const path = location.pathname;

  if (path.startsWith('/admin')) {
    return children;
  }

  if (teams.length === 0) {
    if (isPlatformSuperAdmin(user)) {
      return <Navigate to="/admin/spaces" replace />;
    }
    return <NoTeamPage />;
  }

  return children;
}
