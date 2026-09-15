import { useEffect } from 'react';

export default function SaveCaseReportModal({
  open,
  caseName,
  summary,
  onClose,
  onPrimary,
  primaryLabel = '查看用例',
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !summary) return null;

  const rows = [
    {
      label: '录制步骤',
      value: summary.stepsCount > 0 ? `${summary.stepsCount} 个 Action` : '无（脚本模式）',
      ok: summary.stepsCount > 0 || summary.scriptSaved,
    },
    {
      label: '登录 Cookie',
      value: summary.cookieCount > 0 ? `${summary.cookieCount} 条（wps_sid 等核心）` : '未同步 wps_sid',
      ok: summary.authSaved,
    },
    {
      label: '用例脚本',
      value: summary.scriptPath || '—',
      ok: summary.scriptSaved,
    },
    {
      label: '登录态文件',
      value: summary.authPath || '—',
      ok: summary.authSaved,
    },
  ];

  return (
    <div className="ui-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ui-modal save-case-report"
        role="dialog"
        aria-labelledby="save-case-report-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="save-case-report-title" className="ui-modal__title">保存成功</h2>
        <p className="save-case-report__subtitle">
          用例「{caseName}」已写入用例库，以下内容均已保存：
        </p>
        <ul className="save-case-report__list">
          {rows.map((row) => (
            <li key={row.label} className={`save-case-report__item${row.ok ? ' save-case-report__item--ok' : ' save-case-report__item--warn'}`}>
              <span className="save-case-report__status">{row.ok ? '✓' : '!'}</span>
              <div className="save-case-report__body">
                <strong>{row.label}</strong>
                <span>{row.value}</span>
              </div>
            </li>
          ))}
        </ul>
        {!summary.authSaved && (
          <p className="save-case-report__hint">
            未检测到 wps_sid。请确认：① Chrome 已登录被测站 ② 扩展已更新到 v1.2.6 并刷新
            ③ 录制页显示「插件已连接」后再保存。
          </p>
        )}
        <div className="ui-modal__actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>关闭</button>
          {onPrimary && (
            <button type="button" className="btn btn-primary btn-sm" onClick={onPrimary}>{primaryLabel}</button>
          )}
        </div>
      </div>
    </div>
  );
}
