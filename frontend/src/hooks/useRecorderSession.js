import { useCallback, useEffect, useRef, useState } from 'react';
import { authFetch, getToken, AUTH_DISABLED } from '../authApi';

const SESSION_STORAGE_KEY = 'uiauto_recorder_session';

function buildWsUrl(path) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${path}`;
}

function readStoredSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.sessionId && data?.connectKey) return data;
  } catch (_) {}
  return null;
}

function writeStoredSession(sessionId, connectKey) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ sessionId, connectKey }));
  } catch (_) {}
}

function clearStoredSession() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (_) {}
}

async function verifyStoredSession(sessionId) {
  try {
    const r = await authFetch(`/api/recorder/sessions/${encodeURIComponent(sessionId)}`);
    return r.ok;
  } catch (_) {
    return false;
  }
}

export function useRecorderSession() {
  const wsRef = useRef(null);
  const sessionRef = useRef(null);
  const extSyncTimerRef = useRef(null);
  const storageStateWaitRef = useRef(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({
    uiConnected: false,
    extConnected: false,
    recording: false,
    paused: false,
    stepsCount: 0,
  });
  const [steps, setSteps] = useState([]);
  const [storageState, setStorageState] = useState(null);
  const [cookieCount, setCookieCount] = useState(0);
  const [sessionError, setSessionError] = useState(null);
  const [wsError, setWsError] = useState(null);
  const [assertDraft, setAssertDraft] = useState(null);

  const publishBridge = useCallback((sessionId, connectKey, wsUrl) => {
    const bridge = { sessionId, connectKey, wsUrl };
    window.__UIAUTO_RECORDER__ = bridge;
    window.dispatchEvent(new CustomEvent('uiauto-recorder-ready'));
    try {
      window.postMessage(
        { source: 'uiauto-platform', type: 'uiauto-recorder-bridge', ...bridge },
        window.location.origin,
      );
    } catch (_) {}
    try {
      localStorage.setItem('uiauto_platform_origin', window.location.origin);
    } catch (_) {}
  }, []);

  const clearBridge = useCallback(() => {
    delete window.__UIAUTO_RECORDER__;
  }, []);

  const stopExtSync = useCallback(() => {
    if (extSyncTimerRef.current) {
      clearInterval(extSyncTimerRef.current);
      extSyncTimerRef.current = null;
    }
  }, []);

  const startExtSync = useCallback(() => {
    stopExtSync();
    extSyncTimerRef.current = setInterval(() => {
      window.dispatchEvent(new CustomEvent('uiauto-recorder-ready'));
    }, 3000);
  }, [stopExtSync]);

  const connectWs = useCallback((sessionId, connectKey, wsUrl) => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (_) {}
      wsRef.current = null;
    }

    const token = getToken();
    const qs = new URLSearchParams({
      role: 'ui',
      session: sessionId,
      ...(token ? { token } : {}),
    });
    const url = `${wsUrl || buildWsUrl('/ws/recorder')}?${qs}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus((s) => ({ ...s, uiConnected: true }));
      setWsError(null);
      publishBridge(sessionId, connectKey, wsUrl || buildWsUrl('/ws/recorder'));
      startExtSync();
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }

      if (msg.type === 'hello') {
        if (Array.isArray(msg.steps)) setSteps(msg.steps);
        if (msg.storageState) {
          setStorageState(msg.storageState);
          setCookieCount(msg.cookieCount ?? msg.storageState?.cookies?.length ?? 0);
        }
        if (msg.status) {
          setStatus((s) => ({
            ...s,
            ...msg.status,
            extConnected: msg.status.extConnected ?? s.extConnected,
          }));
        }
        if (msg.status?.extConnected) stopExtSync();
        return;
      }
      if (msg.type === 'steps') {
        setSteps(Array.isArray(msg.steps) ? msg.steps : []);
        return;
      }
      if (msg.type === 'status') {
        setStatus((s) => ({
          ...s,
          recording: !!msg.recording,
          paused: !!msg.paused,
          stepsCount: msg.stepsCount ?? s.stepsCount,
          extConnected: msg.extensionConnected ?? s.extConnected,
        }));
        if (msg.extensionConnected) stopExtSync();
        return;
      }
      if (msg.type === 'storageState') {
        const state = msg.storageState || null;
        setStorageState(state);
        setCookieCount(msg.cookieCount ?? state?.cookies?.length ?? 0);
        if (storageStateWaitRef.current) {
          clearTimeout(storageStateWaitRef.current.timer);
          storageStateWaitRef.current.resolve(state);
          storageStateWaitRef.current = null;
        }
        return;
      }
      if (msg.type === 'peer' && msg.role === 'ext') {
        setStatus((s) => ({ ...s, extConnected: msg.connected !== false }));
        if (msg.connected !== false) stopExtSync();
        else startExtSync();
      }
      if (msg.type === 'assertDraft' && msg.target) {
        setAssertDraft(msg.target);
      }
    };

    ws.onclose = () => {
      setStatus((s) => ({ ...s, uiConnected: false }));
      stopExtSync();
    };

    ws.onerror = () => {
      setWsError('实时通道连接失败，请检查后端 WebSocket 是否可用');
    };

    publishBridge(sessionId, connectKey, wsUrl || buildWsUrl('/ws/recorder'));
  }, [publishBridge, startExtSync, stopExtSync]);

  const initSession = useCallback(async ({ forceNew = false } = {}) => {
    setLoading(true);
    setSessionError(null);
    setWsError(null);

    const wsUrl = buildWsUrl('/ws/recorder');

    try {
      if (!forceNew) {
        const stored = readStoredSession();
        if (stored?.sessionId && stored?.connectKey) {
          const valid = await verifyStoredSession(stored.sessionId);
          if (valid) {
            sessionRef.current = stored.sessionId;
            setSession({ sessionId: stored.sessionId, connectKey: stored.connectKey, wsUrl });
            connectWs(stored.sessionId, stored.connectKey, wsUrl);
            return stored;
          }
          clearStoredSession();
        }
      } else {
        clearStoredSession();
      }

      const r = await authFetch('/api/recorder/sessions', { method: 'POST' });
      if (!r.ok) {
        let detail = '';
        try {
          const body = await r.json();
          detail = body?.error ? `：${body.error}` : '';
        } catch (_) {}
        if (r.status === 401) {
          throw new Error('未登录，请先登录后再使用录制功能');
        }
        throw new Error(`创建会话失败 (${r.status})${detail}`);
      }
      const data = await r.json();
      sessionRef.current = data.sessionId;
      writeStoredSession(data.sessionId, data.connectKey);
      setSession(data);
      connectWs(data.sessionId, data.connectKey, wsUrl);
      return data;
    } catch (e) {
      const msg = e?.message || '';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setSessionError('无法连接后端服务，请确认 backend 已启动且端口与前端代理一致');
      } else {
        setSessionError(msg || '无法创建录制会话');
      }
      clearBridge();
      return null;
    } finally {
      setLoading(false);
    }
  }, [connectWs, clearBridge]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initSession();
      if (cancelled && wsRef.current) {
        try { wsRef.current.close(); } catch (_) {}
      }
    })();
    return () => {
      cancelled = true;
      stopExtSync();
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (_) {}
        wsRef.current = null;
      }
      clearBridge();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendCommand = useCallback((action, payload) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      setWsError('录制通道未就绪，请点击重连');
      return;
    }
    wsRef.current.send(JSON.stringify({ type: 'command', action, payload }));
  }, []);

  /** 保存/试跑前向扩展拉取最新 Cookie */
  const syncStorageState = useCallback(async () => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return null;

    const fromWs = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (storageStateWaitRef.current) storageStateWaitRef.current = null;
        resolve(null);
      }, 10000);
      storageStateWaitRef.current = { resolve, timer };
      wsRef.current.send(JSON.stringify({ type: 'command', action: 'syncStorageState' }));
    });

    if (fromWs?.cookies?.length) return fromWs;

    const sessionId = sessionRef.current;
    if (!sessionId) return null;
    try {
      const r = await authFetch(`/api/recorder/sessions/${encodeURIComponent(sessionId)}`);
      if (!r.ok) return null;
      const data = await r.json();
      if (data.storageState?.cookies?.length) {
        setStorageState(data.storageState);
        setCookieCount(data.storageState.cookies.length);
        return data.storageState;
      }
    } catch (_) {}
    return null;
  }, []);

  const setStepsRemote = useCallback((nextStepsOrFn) => {
    setSteps((prev) => {
      const next = typeof nextStepsOrFn === 'function' ? nextStepsOrFn(prev) : nextStepsOrFn;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'steps', steps: next }));
      }
      return next;
    });
  }, []);

  const deleteStep = useCallback((index) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'deleteStep', index }));
    } else {
      setSteps((prev) => prev.filter((_, i) => i !== index));
    }
  }, []);

  const moveStep = useCallback((fromIndex, toIndex) => {
    setStepsRemote((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  }, [setStepsRemote]);

  const updateStepAt = useCallback((index, step) => {
    setStepsRemote((prev) => prev.map((s, i) => (i === index ? step : s)));
  }, [setStepsRemote]);

  const insertStepAt = useCallback((index, step) => {
    setStepsRemote((prev) => {
      const next = [...prev];
      next.splice(index, 0, step);
      return next;
    });
  }, [setStepsRemote]);

  const reconnect = useCallback(() => {
    setStatus((s) => ({ ...s, extConnected: false, uiConnected: false }));
    return initSession({ forceNew: true });
  }, [initSession]);

  return {
    session,
    loading,
    status,
    steps,
    storageState,
    cookieCount,
    sessionError,
    wsError,
    assertDraft,
    clearAssertDraft: () => setAssertDraft(null),
    sendCommand,
    setStepsRemote,
    deleteStep,
    moveStep,
    updateStepAt,
    insertStepAt,
    reconnect,
    syncStorageState,
    replaceSteps: setStepsRemote,
    authDisabled: AUTH_DISABLED,
  };
}
