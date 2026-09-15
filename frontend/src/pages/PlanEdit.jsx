import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import EmptyState from '../components/ui/EmptyState';
import WorkbenchLayout from '../components/layout/WorkbenchLayout';

/** 旧版路径编辑已废弃，统一跳转到用例库勾选页 */
export default function PlanEdit() {
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    navigate(`/plans/${id}/cases`, { replace: true });
  }, [id, navigate]);

  return (
    <WorkbenchLayout className="plan-case-select-page">
      <EmptyState variant="loading" title="正在跳转" hint="计划用例编辑已统一到用例库勾选页" />
    </WorkbenchLayout>
  );
}
