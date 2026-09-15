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
