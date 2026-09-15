import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { checkLocalRunnerHealth, startLocalRun, getLocalRun } from '../utils/localRunnerApi';
import LocalRunnerSetupWizard from '../components/recorder/LocalRunnerSetupWizard';

const LocalRunnerContext = createContext(null);

const SMOKE_SCRIPT = `import { test, expect } from '@playwright/test';

test('uiauto smoke', async ({ page }) => {
  await page.goto('about:blank');
  await expect(page).toHaveURL('about:blank');
});
`;

export function LocalRunnerProvider({ children }) {
  const [health, setHealth] = useState({ ok: false, checking: true });
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupReason, setSetupReason] = useState('manual');

  const refresh = useCallback(async () => {
    const data = await checkLocalRunnerHealth();
    setHealth({ ...data, checking: false });
    return data;
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const openSetup = useCallback((reason = 'manual') => {
    setSetupReason(reason);
    setSetupOpen(true);
  }, []);

  const closeSetup = useCallback(() => {
    setSetupOpen(false);
  }, []);

  const ensureReady = useCallback(async () => {
    const data = await refresh();
    if (data.ok) return true;
    openSetup('run');
    return false;
  }, [refresh, openSetup]);

  const verifyEnvironment = useCallback(async () => {
    const data = await startLocalRun({
      script: SMOKE_SCRIPT,
      filename: 'case.spec.ts',
      caseName: '环境自检',
    });
    const runId = data.id;
    for (let i = 0; i < 60; i += 1) {
      await new Promise((r) => setTimeout(r, 1000));
      const run = await getLocalRun(runId);
      if (run.status === 'passed') return { ok: true, run };
      if (run.status === 'failed' || run.status === 'cancelled') {
        return { ok: false, run, error: run.error_message || '环境验证失败' };
      }
    }
    return { ok: false, error: '验证超时，请查看本机运行器窗口' };
  }, []);

  const value = useMemo(() => ({
    health,
    ready: health.ok === true,
    checking: health.checking !== false && !health.ok,
    refresh,
    openSetup,
    closeSetup,
    ensureReady,
    verifyEnvironment,
    setupOpen,
    setupReason,
  }), [health, refresh, openSetup, closeSetup, ensureReady, verifyEnvironment, setupOpen, setupReason]);

  return (
    <LocalRunnerContext.Provider value={value}>
      {children}
      <LocalRunnerSetupWizard
        open={setupOpen}
        reason={setupReason}
        onClose={closeSetup}
      />
    </LocalRunnerContext.Provider>
  );
}

export function useLocalRunner() {
  const ctx = useContext(LocalRunnerContext);
  if (!ctx) {
    throw new Error('useLocalRunner must be used within LocalRunnerProvider');
  }
  return ctx;
}
