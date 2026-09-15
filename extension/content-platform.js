/** 在 UIAuto 平台页面上，将录制会话信息同步给扩展（跨 isolated world 用 postMessage） */

function isRecordPage() {
  return /\/record\/?$/.test(window.location.pathname || '');
}

function buildWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/recorder`;
}

let lastSentKey = '';

function sessionKey(config) {
  if (!config?.sessionId || !config?.connectKey) return '';
  return `${config.sessionId}:${config.connectKey}`;
}

function connectWithConfig(config, force = false) {
  if (!isRecordPage()) return;
  if (!config?.sessionId || !config?.connectKey) return;

  const key = sessionKey(config);
  if (!force && key === lastSentKey) return;

  const payload = {
    sessionId: config.sessionId,
    connectKey: config.connectKey,
    wsUrl: config.wsUrl || buildWsUrl(),
  };

  chrome.storage.local.set({ uiautoPlatformOrigin: window.location.origin });
  chrome.runtime.sendMessage({ type: 'uiauto-connect', config: payload }, (res) => {
    if (chrome.runtime.lastError) return;
    if (res?.ok !== false) lastSentKey = key;
  });
}

function tryConnect(force = false) {
  if (!isRecordPage()) return;
  if (force) lastSentKey = '';
  chrome.runtime.sendMessage({ type: 'uiauto-probe-current-tab' });
}

function ensureExtensionConnected() {
  if (!isRecordPage()) return;
  chrome.runtime.sendMessage({ type: 'uiauto-status-request' }, (res) => {
    if (chrome.runtime.lastError || !res?.connected) {
      lastSentKey = '';
      chrome.runtime.sendMessage({ type: 'uiauto-probe-current-tab' });
    }
  });
}

// 页面主世界通过 postMessage 下发会话（content script 无法直接读 window.__UIAUTO_RECORDER__）
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (data?.source !== 'uiauto-platform' || data?.type !== 'uiauto-recorder-bridge') return;
  lastSentKey = '';
  connectWithConfig({
    sessionId: data.sessionId,
    connectKey: data.connectKey,
    wsUrl: data.wsUrl,
  }, true);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'uiauto-recorder-ping') {
    lastSentKey = '';
    tryConnect(true);
  }
});

tryConnect(true);
setInterval(ensureExtensionConnected, 3000);
