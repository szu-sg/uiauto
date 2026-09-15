import { authFetch } from '../authApi';

/** 下载本机运行器 ZIP */
export async function downloadLocalRunnerZip(filename = 'uiauto-local-runner.zip') {
  const r = await authFetch('/api/local-runner/download');
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
