import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CreatePlanModal from '../components/plans/CreatePlanModal';
import { useUser } from './UserContext';
import { useToast } from './ToastContext';
import { canWriteTeamResources } from '../utils/teamDisplay';

const CreatePlanContext = createContext(null);

export function CreatePlanProvider({ children }) {
  const navigate = useNavigate();
  const user = useUser();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);

  const openCreatePlan = useCallback(() => {
    if (!canWriteTeamResources(user)) {
      showToast('只读成员无法创建测试计划');
      return;
    }
    setOpen(true);
  }, [user, showToast]);
  const closeCreatePlan = useCallback(() => setOpen(false), []);

  const handleCreated = useCallback((planId) => {
    setOpen(false);
    navigate(`/plans/${planId}/cases`);
  }, [navigate]);

  const value = useMemo(
    () => ({ openCreatePlan, closeCreatePlan }),
    [openCreatePlan, closeCreatePlan],
  );

  return (
    <CreatePlanContext.Provider value={value}>
      {children}
      {open && (
        <CreatePlanModal onClose={closeCreatePlan} onCreated={handleCreated} />
      )}
    </CreatePlanContext.Provider>
  );
}

export function useCreatePlan() {
  const ctx = useContext(CreatePlanContext);
  if (!ctx) throw new Error('useCreatePlan must be used within CreatePlanProvider');
  return ctx;
}
