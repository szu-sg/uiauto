function renderStatus(data) {
  const el = document.getElementById('status');
  if (!data?.connected) {
    el.className = 'status status--warn';
    el.textContent = '未连接：请打开平台「用例录制」页，或点击下方重新连接';
    return;
  }
  el.className = 'status status--ok';
  const rec = data.recording ? (data.paused ? '录制中（已暂停）' : '录制中') : '已连接，待命';
  el.textContent = `${rec} · 会话 ${data.sessionId || '—'}`;
}

function refresh() {
  chrome.runtime.sendMessage({ type: 'uiauto-status-request' }, (res) => {
    renderStatus(res || {});
  });
}

document.getElementById('btnReconnect').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'uiauto-reconnect' }, () => {
    setTimeout(refresh, 600);
  });
});

document.getElementById('btnDisconnect').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'uiauto-disconnect' }, refresh);
});

chrome.storage.local.get('uiautoPlatformOrigin', (data) => {
  const origin = data?.uiautoPlatformOrigin || 'http://localhost:5180';
  document.getElementById('linkDownload').href = `${origin}/extension`;
});

refresh();
setInterval(refresh, 2000);
