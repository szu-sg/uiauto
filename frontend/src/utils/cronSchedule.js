const WEEKDAY_LABELS = [
  { value: '1', label: '周一' },
  { value: '2', label: '周二' },
  { value: '3', label: '周三' },
  { value: '4', label: '周四' },
  { value: '5', label: '周五' },
  { value: '6', label: '周六' },
  { value: '0', label: '周日' },
];

export { WEEKDAY_LABELS };

export function defaultScheduleForm() {
  const now = new Date();
  return {
    mode: 'repeat',
    repeatFreq: 'daily',
    weekdays: ['1'],
    monthDay: 1,
    date: formatDateInput(now),
    time: '09:00',
    cronManual: '',
    useManual: false,
  };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatDateInput(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseTime(time) {
  const [h, m] = String(time || '09:00').split(':');
  const hour = Math.min(23, Math.max(0, parseInt(h, 10) || 0));
  const minute = Math.min(59, Math.max(0, parseInt(m, 10) || 0));
  return { hour, minute };
}

export function buildCronFromForm(form) {
  if (form.useManual) {
    const cron = String(form.cronManual || '').trim();
    if (!cron) throw new Error('请填写 Cron 表达式');
    return { cron, once: false };
  }

  const { hour, minute } = parseTime(form.time);

  if (form.mode === 'once') {
    if (!form.date) throw new Error('请选择执行日期');
    const [y, mo, d] = form.date.split('-').map((x) => parseInt(x, 10));
    if (!y || !mo || !d) throw new Error('日期无效');
    const target = new Date(y, mo - 1, d, hour, minute, 0, 0);
    if (target.getTime() <= Date.now()) throw new Error('执行时间须晚于当前时间');
    return { cron: `${minute} ${hour} ${d} ${mo} *`, once: true };
  }

  if (form.repeatFreq === 'daily') {
    return { cron: `${minute} ${hour} * * *`, once: false };
  }

  if (form.repeatFreq === 'weekly') {
    const days = (form.weekdays?.length ? form.weekdays : ['1']).slice().sort((a, b) => Number(a) - Number(b));
    return { cron: `${minute} ${hour} * * ${days.join(',')}`, once: false };
  }

  if (form.repeatFreq === 'monthly') {
    const day = Math.min(31, Math.max(1, parseInt(form.monthDay, 10) || 1));
    return { cron: `${minute} ${hour} ${day} * *`, once: false };
  }

  throw new Error('请选择调度频率');
}

export function parseCronToForm(cron, scheduleOnce, nextRunIso) {
  const base = defaultScheduleForm();
  if (!cron || !String(cron).trim()) return base;

  const parts = String(cron).trim().split(/\s+/);
  if (parts.length !== 5) {
    return { ...base, useManual: true, cronManual: cron };
  }

  const [min, hour, dom, month, dow] = parts;
  const time = `${pad2(hour)}:${pad2(min)}`;

  if (scheduleOnce && dom !== '*' && month !== '*' && dow === '*') {
    let date = `${new Date().getFullYear()}-${pad2(month)}-${pad2(dom)}`;
    if (nextRunIso) {
      const d = new Date(nextRunIso);
      if (!Number.isNaN(d.getTime())) date = formatDateInput(d);
    }
    return { ...base, mode: 'once', date, time };
  }

  if (dom === '*' && month === '*' && dow === '*') {
    return { ...base, mode: 'repeat', repeatFreq: 'daily', time };
  }

  if (dom === '*' && month === '*' && dow !== '*') {
    return {
      ...base,
      mode: 'repeat',
      repeatFreq: 'weekly',
      weekdays: dow.split(',').map((x) => x.trim()).filter(Boolean),
      time,
    };
  }

  if (dom !== '*' && month === '*' && dow === '*') {
    return {
      ...base,
      mode: 'repeat',
      repeatFreq: 'monthly',
      monthDay: parseInt(dom, 10) || 1,
      time,
    };
  }

  return { ...base, useManual: true, cronManual: cron };
}

export function describeSchedule(form) {
  try {
    const { cron, once } = buildCronFromForm(form);
    if (once) return `仅执行一次，Cron：${cron}`;
    if (form.repeatFreq === 'daily') return `每天 ${form.time} 执行`;
    if (form.repeatFreq === 'weekly') {
      const labels = WEEKDAY_LABELS.filter((w) => form.weekdays?.includes(w.value)).map((w) => w.label);
      return `每周 ${labels.join('、') || '周一'} ${form.time} 执行`;
    }
    if (form.repeatFreq === 'monthly') return `每月 ${form.monthDay} 日 ${form.time} 执行`;
    return `Cron：${cron}`;
  } catch (e) {
    return e.message || '';
  }
}
