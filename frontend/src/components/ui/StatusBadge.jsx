const STATUS_MAP = {
  success: { label: '成功', className: 'ui-badge--success' },
  passed: { label: '通过', className: 'ui-badge--success' },
  failed: { label: '失败', className: 'ui-badge--danger' },
  failure: { label: '失败', className: 'ui-badge--danger' },
  running: { label: '执行中', className: 'ui-badge--info' },
  pending: { label: '等待', className: 'ui-badge--muted' },
  cancelled: { label: '已取消', className: 'ui-badge--muted' },
  canceled: { label: '已取消', className: 'ui-badge--muted' },
};

export default function StatusBadge({ status, label }) {
  const key = String(status || '').toLowerCase();
  const cfg = STATUS_MAP[key] || { label: label || status || '—', className: 'ui-badge--muted' };
  return (
    <span className={`ui-badge ${cfg.className}`}>
      {label || cfg.label}
    </span>
  );
}
