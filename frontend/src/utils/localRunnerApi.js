import { LOCAL_RUNNER_URL } from '../config/localRunner';

export class LocalRunnerError extends Error {
  constructor(message, code = 'LOCAL_RUNNER_ERROR') {
    super(message);
    this.name = 'LocalRunnerError';
    this.code = code;
  }
}

async function localFetch(path, options = {}) {
  const url = `${LOCAL_RUNNER_URL}${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new LocalRunnerError(data.error || `本机运行器错误 (${res.status})`);
    }
    return data;
  } catch (err) {
    if (err instanceof LocalRunnerError) throw err;
    throw new LocalRunnerError(
      '无法连接本机运行器，请先启动 local-runner',
      'LOCAL_RUNNER_MISSING',
    );
  }
}

export async function checkLocalRunnerHealth() {
  try {
    const data = await localFetch('/health');
    return { ok: true, ...data };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      code: err.code || 'LOCAL_RUNNER_MISSING',
    };
  }
}

export async function startLocalRun({
  script,
  filename,
  storageState,
  caseName,
}) {
  return localFetch('/runs', {
    method: 'POST',
    body: JSON.stringify({
      script,
      filename,
      storageState,
      caseName,
    }),
  });
}

export async function getLocalRun(id) {
  return localFetch(`/runs/${id}`);
}

export async function cancelLocalRun(id) {
  return localFetch(`/runs/${id}/cancel`, { method: 'POST', body: '{}' });
}

export async function listLocalRuns(limit = 20) {
  return localFetch(`/runs?limit=${limit}`);
}
