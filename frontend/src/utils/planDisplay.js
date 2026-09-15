import { describeSchedule, parseCronToForm } from './cronSchedule';

const BROWSER_LABELS = {
  chromium: 'Chromium',
  chrome: 'Chrome',
  msedge: 'Edge',
  firefox: 'Firefox',
  webkit: 'WebKit',
};

export function parseCaseCount(plan) {
  if (!plan || typeof plan !== 'object') return 0;
  try {
    const ids = plan.case_ids_json ? JSON.parse(plan.case_ids_json) : [];
    if (Array.isArray(ids) && ids.length > 0) return ids.length;
    return JSON.parse(plan.cases_json || '[]').length;
  } catch {
    return 0;
  }
}

export function parseRunBrowsers(plan) {
  if (!plan) return [];
  try {
    if (Array.isArray(plan.run_browsers)) return plan.run_browsers;
    const raw = plan.run_browsers_json ? JSON.parse(plan.run_browsers_json) : [];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function formatPlanBrowsers(plan) {
  const list = parseRunBrowsers(plan);
  if (!list.length) return 'Chromium';
  return list.map((id) => BROWSER_LABELS[id] || id).join('、');
}

export function formatPlanSchedule(plan) {
  if (!plan?.schedule_enabled) return '—';
  const cron = plan.schedule_cron;
  if (!cron) return '已启用';
  try {
    const form = parseCronToForm(cron, !!plan.schedule_once, plan.next_schedule_run);
    return describeSchedule(form) || cron;
  } catch {
    return cron;
  }
}

export function formatPlanEnvironment(plan, envMap = {}) {
  if (plan?.environment_name) return plan.environment_name;
  const id = plan?.environment_id;
  if (!id) return '—';
  return envMap[id] || '—';
}
