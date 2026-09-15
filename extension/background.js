import {
  ingestAction,
  actionsToSteps,
  stepsToActions,
  shouldRecordURL,
  normalizeNavigateUrl,
} from './recorder-pipeline.js';
import { buildStorageStateFromTab, buildStorageStateFromUrl, filterEssentialStorageState } from './storage-state.js';

/** @typedef {{ sessionId: string, connectKey: string, wsUrl: string }} RecorderConfig */

const STATE = {
  ws: null,
  config: null,
  recording: false,
  paused: false,
  reconnectTimer: null,
  actions: [],
  recordedTabs: new Set(),
  storageState: null,
  storageRefreshTimer: null,
};

function log(...args) {
  console.log('[UIAuto Recorder]', ...args);
}

function broadcastToTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id || !tab.url || tab.url.startsWith('chrome://')) continue;
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  });
}

function sendWs(payload) {
  if (STATE.ws?.readyState === WebSocket.OPEN) {
    STATE.ws.send(JSON.stringify(payload));
  }
}

function sendStorageStateToPlatform(storageState, extra = {}) {
  const filtered = filterEssentialStorageState(storageState);
  const normalized = filtered.cookies?.length
    ? filtered
    : { cookies: [], origins: [] };
  if (normalized.cookies?.length) {
    STATE.storageState = normalized;
  }
  sendWs({
    type: 'storageState',
    storageState: normalized,
    cookieCount: normalized.cookies?.length ?? 0,
    ...extra,
  });
}

function syncStorageStateToPlatform(storageState) {
  if (!storageState?.cookies?.length) return;
  sendStorageStateToPlatform(storageState);
}

function resolveUrlFromActions() {
  for (let i = STATE.actions.length - 1; i >= 0; i -= 1) {
    const a = STATE.actions[i];
    const t = String(a?.type || '').toUpperCase();
    if (t === 'NAVIGATE' || t === 'GOTO') {
      const u = normalizeNavigateUrl(a.value || a.url);
      if (u && shouldRecordURL(u) && !isRecordTabUrl(u)) return u;
    }
  }
  return null;
}

/** 采集登录态；force=true 时保存/试跑也可执行（不要求正在录制） */
async function collectStorageState(tabId, pageUrl, force = false) {
  if (!force && (!STATE.recording || STATE.paused)) return null;
  const url = String(pageUrl || '').trim();
  if (!url || !shouldRecordURL(url) || isRecordTabUrl(url)) return null;
  try {
    const state = await buildStorageStateFromTab(tabId, url);
    return state?.cookies?.length ? state : null;
  } catch (e) {
    log('collectStorageState failed', e?.message || e);
    return null;
  }
}

async function syncStorageStateNow() {
  const tab = await pickRecordingTargetTab();
  let state = null;

  if (tab?.id && tab.url) {
    state = await collectStorageState(tab.id, tab.url, true);
  }

  if (!state) {
    const url = resolveUrlFromActions();
    if (url) {
      state = await buildStorageStateFromUrl(url);
      if (!state?.cookies?.length) state = null;
    }
  }

  if (!state && STATE.storageState?.cookies?.length) {
    state = STATE.storageState;
  }

  if (state?.cookies?.length) {
    sendStorageStateToPlatform(state, { syncSource: tab ? 'tab' : 'actions' });
    log('syncStorageStateNow ok', state.cookies.length, 'cookies');
    return state;
  }

  sendStorageStateToPlatform(
    { cookies: [], origins: [] },
    { syncError: '未读取到 Cookie，请确认已在 Chrome 登录被测站且扩展已授权 cookies 权限' },
  );
  log('syncStorageStateNow: no cookies');
  return null;
}

async function refreshRecordingStorageState(tabId, pageUrl) {
  const state = await collectStorageState(tabId, pageUrl, false);
  if (!state) return 0;
  syncStorageStateToPlatform(state);
  log('storageState synced', pageUrl, state.cookies.length, 'cookies');
  return state.cookies.length;
}

function scheduleRefreshRecordingStorageState(tabId, pageUrl) {
  if (!STATE.recording || STATE.paused) return;
  if (STATE.storageRefreshTimer) clearTimeout(STATE.storageRefreshTimer);
  STATE.storageRefreshTimer = setTimeout(() => {
    STATE.storageRefreshTimer = null;
    refreshRecordingStorageState(tabId, pageUrl).catch(() => {});
  }, 400);
}

function syncStepsToPlatform() {
  const steps = actionsToSteps(STATE.actions);
  sendWs({ type: 'steps', steps });
  sendWs({
    type: 'status',
    recording: STATE.recording,
    paused: STATE.paused,
    extensionConnected: true,
    stepsCount: steps.length,
  });
}

function ingestAndSync(rawAction) {
  if (STATE.paused) return;
  const { changed, actions } = ingestAction(STATE.actions, rawAction);
  if (!changed) return;
  STATE.actions = actions;
  syncStepsToPlatform();
}

function notifyStatus(extra = {}) {
  sendWs({
    type: 'status',
    recording: STATE.recording,
    paused: STATE.paused,
    extensionConnected: true,
    stepsCount: STATE.actions.length,
    ...extra,
  });
}

function isRecordTabUrl(url) {
  if (!url) return false;
  try {
    return /\/record\/?$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

async function pickRecordingTargetTab() {
  const tabs = await chrome.tabs.query({});
  for (const tabId of [...STATE.recordedTabs].reverse()) {
    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.id && tab.url && shouldRecordURL(tab.url) && !isRecordTabUrl(tab.url)) {
      return tab;
    }
  }
  const candidates = tabs
    .filter((tab) => tab?.id && tab.url && shouldRecordURL(tab.url) && !isRecordTabUrl(tab.url))
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return candidates[0] || null;
}

async function connectFromRecordTab(tabId, attempt = 0) {
  if (!tabId) return false;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const b = window.__UIAUTO_RECORDER__;
        if (!b?.sessionId || !b?.connectKey) return null;
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return {
          sessionId: b.sessionId,
          connectKey: b.connectKey,
          wsUrl: `${proto}//${window.location.host}/ws/recorder`,
        };
      },
    });
    if (result?.sessionId) {
      connectWebSocket(result);
      return true;
    }
    if (attempt < 8) {
      setTimeout(() => connectFromRecordTab(tabId, attempt + 1), 400 + attempt * 300);
    }
  } catch (err) {
    log('connectFromRecordTab', err?.message || err);
  }
  return false;
}

async function findAndConnectRecordTab() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id && isRecordTabUrl(tab.url)) {
      const ok = await connectFromRecordTab(tab.id);
      if (ok) return true;
    }
  }
  return false;
}

function sameRecorderConfig(a, b) {
  return a && b
    && a.sessionId === b.sessionId
    && a.connectKey === b.connectKey
    && a.wsUrl === b.wsUrl;
}

function connectWebSocket(config) {
  if (!config?.sessionId || !config?.connectKey || !config?.wsUrl) return;

  const normalized = {
    sessionId: config.sessionId,
    connectKey: config.connectKey,
    wsUrl: config.wsUrl,
  };

  if (STATE.reconnectTimer) {
    clearTimeout(STATE.reconnectTimer);
    STATE.reconnectTimer = null;
  }

  if (STATE.ws?.readyState === WebSocket.OPEN && sameRecorderConfig(STATE.config, normalized)) {
    return;
  }

  STATE.config = normalized;
  if (STATE.ws) {
    try { STATE.ws.close(); } catch (_) {}
    STATE.ws = null;
  }

  const url = `${normalized.wsUrl}?role=ext&session=${encodeURIComponent(normalized.sessionId)}&key=${encodeURIComponent(normalized.connectKey)}`;
  log('connecting', url);
  const ws = new WebSocket(url);
  STATE.ws = ws;

  ws.onopen = () => {
    log('WebSocket connected');
    syncStepsToPlatform();
    if (STATE.storageState?.cookies?.length) {
      syncStorageStateToPlatform(STATE.storageState);
    }
    chrome.storage.local.set({ uiautoRecorderConfig: normalized });
  };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (_) { return; }
    handleCommand(msg);
    if (msg.type === 'steps' && Array.isArray(msg.steps)) {
      STATE.actions = stepsToActions(msg.steps);
    }
  };

  ws.onclose = (ev) => {
    log('WebSocket closed', ev?.code, ev?.reason);
    STATE.ws = null;
    if (ev?.code === 4003 || ev?.code === 4004) {
      STATE.config = null;
      chrome.storage.local.remove('uiautoRecorderConfig');
      findAndConnectRecordTab();
      return;
    }
    if (STATE.config && !STATE.reconnectTimer) {
      STATE.reconnectTimer = setTimeout(() => {
        STATE.reconnectTimer = null;
        connectWebSocket(STATE.config);
      }, 3000);
    }
  };

  ws.onerror = () => ws.close();
}

function startRecordingOnTabs() {
  broadcastToTabs({ type: 'uiauto-recorder', action: 'start' });
  broadcastToTabs({ command: 'startRecording' });
}

function stopRecordingOnTabs() {
  broadcastToTabs({ type: 'uiauto-recorder', action: 'stop' });
  broadcastToTabs({ command: 'stopRecording' });
}

function handleCommand(msg) {
  if (!msg || msg.type !== 'command') return;
  const { action, payload } = msg;

  if (action === 'start') {
    STATE.recording = true;
    STATE.paused = false;
    STATE.recordedTabs = new Set();
    startRecordingOnTabs();
    notifyStatus();
    pickRecordingTargetTab().then((tab) => {
      if (tab?.id) scheduleRefreshRecordingStorageState(tab.id, tab.url);
    });
    return;
  }
  if (action === 'pause') {
    STATE.paused = !STATE.paused;
    broadcastToTabs({
      type: 'uiauto-recorder',
      action: STATE.paused ? 'pause' : 'resume',
    });
    notifyStatus();
    return;
  }
  if (action === 'stop') {
    STATE.recording = false;
    STATE.paused = false;
    stopRecordingOnTabs();
    notifyStatus();
    return;
  }
  if (action === 'clear') {
    STATE.actions = [];
    syncStepsToPlatform();
    return;
  }
  if (action === 'assertPicker') {
    broadcastToTabs({ command: 'startAssertPicker' });
    return;
  }
  if (action === 'stopAssertPicker') {
    broadcastToTabs({ command: 'stopAssertPicker' });
    return;
  }
  if (action === 'setSteps' && Array.isArray(payload)) {
    STATE.actions = payload;
    syncStepsToPlatform();
    return;
  }
  if (action === 'syncStorageState') {
    syncStorageStateNow().catch((e) => {
      log('syncStorageStateNow error', e?.message || e);
      sendStorageStateToPlatform(
        { cookies: [], origins: [] },
        { syncError: e?.message || String(e) },
      );
    });
    return;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'uiauto-connect') {
    if (STATE.reconnectTimer) {
      clearTimeout(STATE.reconnectTimer);
      STATE.reconnectTimer = null;
    }
    connectWebSocket(msg.config);
    sendResponse({ ok: true });
    return true;
  }

  if (msg?.type === 'action' || msg?.type === 'uiauto-step') {
    if (!STATE.recording) return;
    const raw = msg.action || msg.step;
    ingestAndSync(raw);
    const tabId = sender.tab?.id;
    const url = raw?.url || raw?.value || sender.tab?.url;
    if (tabId && url) scheduleRefreshRecordingStorageState(tabId, url);
    return;
  }

  if (msg?.type === 'assertTargetPicked' && msg.target) {
    if (!STATE.recording) return;
    sendWs({ type: 'assertDraft', target: msg.target });
    return;
  }

  if (msg?.type === 'uiauto-status-request') {
    sendResponse({
      connected: STATE.ws?.readyState === WebSocket.OPEN,
      recording: STATE.recording,
      paused: STATE.paused,
      sessionId: STATE.config?.sessionId || null,
    });
    return true;
  }

  if (msg?.type === 'uiauto-probe-tab') {
    const tabId = msg.tabId || sender.tab?.id;
    connectFromRecordTab(tabId).then((ok) => {
      if (!ok) findAndConnectRecordTab().then((found) => sendResponse({ ok: found }));
      else sendResponse({ ok: true });
    });
    return true;
  }

  if (msg?.type === 'uiauto-probe-current-tab') {
    const tabId = sender.tab?.id;
    if (tabId && isRecordTabUrl(sender.tab?.url)) {
      connectFromRecordTab(tabId).then((ok) => sendResponse({ ok }));
    } else {
      findAndConnectRecordTab().then((ok) => sendResponse({ ok }));
    }
    return true;
  }

  if (msg?.type === 'uiauto-reconnect') {
    if (STATE.reconnectTimer) {
      clearTimeout(STATE.reconnectTimer);
      STATE.reconnectTimer = null;
    }
    if (STATE.ws) {
      try { STATE.ws.close(); } catch (_) {}
      STATE.ws = null;
    }
    findAndConnectRecordTab().then((ok) => sendResponse({ ok }));
    return true;
  }

  if (msg?.type === 'uiauto-disconnect') {
    STATE.config = null;
    STATE.recording = false;
    STATE.paused = false;
    STATE.actions = [];
    if (STATE.ws) {
      try { STATE.ws.close(); } catch (_) {}
      STATE.ws = null;
    }
    chrome.storage.local.remove('uiautoRecorderConfig');
    stopRecordingOnTabs();
    sendResponse({ ok: true });
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isRecordTabUrl(tab?.url)) {
    connectFromRecordTab(tabId);
  }

  if (!STATE.recording || STATE.paused) return;

  if (changeInfo.url && shouldRecordURL(changeInfo.url)) {
    ingestAndSync({ type: 'navigate', value: changeInfo.url, tabId });
    STATE.recordedTabs.add(tabId);
    scheduleRefreshRecordingStorageState(tabId, changeInfo.url);
    if (changeInfo.status === 'complete') {
      chrome.tabs.sendMessage(tabId, { command: 'startRecording' }).catch(() => {});
    }
    return;
  }

  if (changeInfo.status === 'complete' && tab?.url && shouldRecordURL(tab.url)) {
    if (!STATE.recordedTabs.has(tabId)) {
      ingestAndSync({ type: 'navigate', value: tab.url, tabId });
      STATE.recordedTabs.add(tabId);
    }
    scheduleRefreshRecordingStorageState(tabId, tab.url);
    chrome.tabs.sendMessage(tabId, { command: 'startRecording' }).catch(() => {});
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  if (!STATE.recording || STATE.paused) return;
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab?.id || !shouldRecordURL(tab.url)) return;
    chrome.tabs.sendMessage(tab.id, { command: 'startRecording' }).catch(() => {});
    if (!isRecordTabUrl(tab.url)) {
      scheduleRefreshRecordingStorageState(tab.id, tab.url);
    }
  });
});

// 不在启动时用 storage 里的旧会话连接，避免刷新页面后连到已失效 session
