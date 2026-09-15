import { useEffect } from 'react';

export default function TrialRunResultModal({
  open,
  caseName,
  result,
  onClose,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !result) return null;

  const passed = result.status === 'passed';
  const cancelled = result.status === 'cancelled';
  const failed = !passed && !cancelled;
  const title = passed ? '试跑通过' : cancelled ? '试跑已取消' : '试跑失败';
  const reason = result.error_message
    || (failed && !result.error_message && result.log_text
      ? result.log_text.split('\n').filter(Boolean).slice(-3).join('\n')
      : null);

  return (
    <div className="ui-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ui-modal trial-run-result"
        role="dialog"
        aria-labelledby="trial-run-result-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="trial-run-result-title"
          className={`ui-modal__title trial-run-result__title${passed ? ' trial-run-result__title--ok' : ''}${failed ? ' trial-run-result__title--fail' : ''}`}
        >
          {title}
        </h2>
        <p className="trial-run-result__subtitle">
          {caseName ? `用例「${caseName}」` : '当前用例'}本地试跑已结束
        </p>

        {failed && (
          <div className="trial-run-result__reason">
            <strong>失败原因</strong>
            <p>{reason || '未返回具体错误信息，请查看试跑历史中的日志'}</p>
          </div>
        )}

        {passed && (
          <p className="trial-run-result__ok-hint">脚本已在本地 Chromium 中执行通过。</p>
        )}

        {cancelled && (
          <p className="trial-run-result__ok-hint">试跑任务已手动取消。</p>
        )}

        {(result.video_url || result.video_path) && (
          <div className="trial-run-result__video">
            <strong>录屏回放</strong>
            <video
              src={result.video_url || `/results/${result.video_path}`}
              controls
              className="trial-run-result__video-el"
              preload="metadata"
              playsInline
            />
          </div>
        )}

        {failed && (result.screenshot_url || result.screenshot_path) && (
          <a
            className="trial-run-result__shot"
            href={result.screenshot_url || `/results/${result.screenshot_path}`}
            target="_blank"
            rel="noreferrer"
          >
            查看失败截图
          </a>
        )}

        <div className="ui-modal__actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
