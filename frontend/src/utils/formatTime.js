export function formatRelativeTime(dateStr) {
  if (!dateStr) return '—';
  const s = String(dateStr).trim();
  const d = /^[\d-]+\s+[\d:]+$/.test(s) && !s.includes('Z') && !s.includes('+')
    ? new Date(s.replace(' ', 'T') + '+08:00')
    : new Date(s);
  if (Number.isNaN(d.getTime())) return dateStr;
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const s = String(dateStr).trim();
  const d = /^[\d-]+\s+[\d:]+$/.test(s) && !s.includes('Z') && !s.includes('+')
    ? new Date(s.replace(' ', 'T') + '+08:00')
    : new Date(s);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

/** 仅日期，用于卡片等窄位展示 */
/** 解析接口返回的北京时间或 ISO 字符串，返回时间戳 */
export function parseAppDateTime(dateStr) {
  if (!dateStr) return NaN;
  const s = String(dateStr).trim();
  const d = /^[\d-]+\s+[\d:]+$/.test(s) && !s.includes('Z') && !s.includes('+')
    ? new Date(s.replace(' ', 'T') + '+08:00')
    : new Date(s);
  return d.getTime();
}

/** 毫秒 → m:ss（用于耗时展示） */
export function formatDurationMmSs(ms) {
  if (ms == null || ms === '') return '—';
  const n = Number(ms);
  if (!Number.isFinite(n)) return '—';
  const totalSec = Math.max(0, Math.floor(n / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDateOnly(dateStr) {
  if (!dateStr) return '';
  const s = String(dateStr).trim();
  const d = /^[\d-]+\s+[\d:]+$/.test(s) && !s.includes('Z') && !s.includes('+')
    ? new Date(s.replace(' ', 'T') + '+08:00')
    : new Date(s);
  if (Number.isNaN(d.getTime())) return dateStr.split(/\s/)[0] || dateStr;
  return d.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
}
