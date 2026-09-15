import { Navigate } from 'react-router-dom';
import { useUser } from '../../context/UserContext';
import { isPlatformSuperAdmin } from '../../utils/teamDisplay';

export default function RequireSuperAdmin({ children }) {
  const user = useUser();
  if (!isPlatformSuperAdmin(user)) {
    return <Navigate to="/" replace />;
  }
  return children;
}
