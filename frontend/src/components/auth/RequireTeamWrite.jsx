import { Navigate } from 'react-router-dom';
import { useUser } from '../../context/UserContext';
import { canWriteTeamResources } from '../../utils/teamDisplay';
import WorkbenchLayout from '../layout/WorkbenchLayout';

/**
 * 仅 member/admin/owner 可访问（viewer 重定向并提示）。
 */
export default function RequireTeamWrite({ children, redirectTo = '/cases' }) {
  const user = useUser();
  if (!user) return null;
  if (!canWriteTeamResources(user)) {
    return (
      <WorkbenchLayout className="wb-page">
        <p className="space-settings-panel__hint" style={{ padding: '1.5rem' }}>
          当前为只读角色，无法使用此功能。如需编辑或录制，请联系空间管理员调整权限。
        </p>
        <Navigate to={redirectTo} replace />
      </WorkbenchLayout>
    );
  }
  return children;
}
