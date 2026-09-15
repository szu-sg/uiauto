import { useCallback, useRef, useState } from 'react';
import {
  cancelLocalRun,
  getLocalRun,
  LocalRunnerError,
  startLocalRun,
} from '../utils/localRunnerApi';
import { useLocalRunner } from '../context/LocalRunnerContext';

export { LocalRunnerError };

export function useTrialRun({ onDone } = {}) {
  const { ready, ensureReady, refresh } = useLocalRunner();
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState(null);
  const [run, setRun] = useState(null);
  const pollRef = useRef(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollRun = useCallback((id) => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const data = await getLocalRun(id);
        setRun(data);
        if (data.status !== 'pending' && data.status !== 'running') {
          stopPoll();
          setRunning(false);
          onDone?.(data);
        }
      } catch (_) {}
    }, 1200);
  }, [stopPoll, onDone]);

  const startRun = useCallback(async (payload) => {
    const isReady = await ensureReady();
    if (!isReady) {
      throw new LocalRunnerError('请先完成本机环境配置', 'LOCAL_RUNNER_MISSING');
    }

    setRunning(true);
    setRun(null);
    setRunId(null);

    try {
      const data = await startLocalRun(payload);
      setRunId(data.id);
      setRun({ id: data.id, status: 'pending', log_text: '' });
      pollRun(data.id);
      return data.id;
    } catch (e) {
      setRunning(false);
      throw e;
    }
  }, [ensureReady, pollRun]);

  const cancelRun = useCallback(async () => {
    if (!runId) return;
    await cancelLocalRun(runId);
  }, [runId]);

  return {
    running,
    runId,
    run,
    runnerReady: ready,
    startRun,
    cancelRun,
    refreshRunnerStatus: refresh,
  };
}
