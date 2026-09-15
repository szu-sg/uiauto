import { authFetch } from '../authApi';

/** 下载录制插件 ZIP（避免浏览器直链在 dev proxy 下异常） */
export async function downloadExtensionZip(filename = 'uiauto-recorder.zip') {
  const r = await authFetch('/api/extension/download');
  if (!r.ok) {
    let detail = `HTTP ${r.status}`;
    try {
      const body = await r.json();
      if (body?.error) detail = body.error;
    } catch (_) {}
    throw new Error(detail);
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
