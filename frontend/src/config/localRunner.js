/** 本机 Playwright 调试运行器地址（仅监听 localhost） */
export const LOCAL_RUNNER_URL = (
  import.meta.env.VITE_LOCAL_RUNNER_URL || 'http://127.0.0.1:9321'
).replace(/\/$/, '');
