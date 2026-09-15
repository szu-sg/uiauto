import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCreatePlan } from '../context/CreatePlanContext';

export default function PlanNewRoute() {
  const [searchParams] = useSearchParams();
  const planId = searchParams.get('planId');
  const navigate = useNavigate();
  const { openCreatePlan } = useCreatePlan();

  useEffect(() => {
    if (planId) {
      navigate(`/plans/${planId}/cases`, { replace: true });
      return;
    }
    openCreatePlan();
    navigate('/plans', { replace: true });
  }, [planId, openCreatePlan, navigate]);

  return null;
}
