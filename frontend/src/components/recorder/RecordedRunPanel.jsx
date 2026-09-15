import { Link } from 'react-router-dom';
import StatusBadge from '../ui/StatusBadge';
import { useLocalRunner } from '../../context/LocalRunnerContext';

export default function RecordedRunPanel({
  running,
  run,
  onRun,
  onCancel,
  onSetupRunner,
  runnerReady,
  disabled,
  readOnly = false,
  variant = 'bar',
}) {
  const { openSetup } = useLocalRunner();
  const handleSetup = onSetupRunner || (() => openSetup('run'));
  const shotHref = run?.screenshot_url
    || (run?.screenshot_path ? `/results/${run.screenshot_path}` : null);
  if (readOnly && (variant === 'toolbar' || variant === 'inline')) {
    return (
      <span className="recorder-run-toolbar__readonly-hint" title="只读成员不可试跑">
        只读
      </span>
    );
  }

  if (variant === 'toolbar') {
    return (
      <div className="recorder-run-toolbar">
        {runnerReady === false && (
          <button
            type="button"
            className="recorder-run-toolbar__setup"
            onClick={handleSetup}
            title="配置本机运行器"
          >
            未配置
          </button>
        )}
        <button
          type="button"
          className="recorder-btn recorder-btn--run"
          disabled={disabled || running}
          onClick={runnerReady === false ? handleSetup : onRun}
          title={
            disabled
              ? '请先填写或生成脚本'
              : runnerReady === false
                ? '请先配置并启动本机运行器'
                : '在本机通过 Playwright 一键运行（使用脚本与上下文 Cookie）'
          }
        >
          {running ? '运行中…' : '一键运行'}
        </button>
        {running && (
          <button type="button" className="recorder-btn recorder-btn--ghost" onClick={onCancel}>
            取消
          </button>
        )}
      </div>
    );
  }

  if (variant === 'feedback' && (run?.log_text || run?.error_message || run?.screenshot_path)) {
    return (
      <div className="recorder-run-feedback">
        {run?.error_message && run.status === 'failed' && (
          <p className="recorder-run-feedback__error">{run.error_message}</p>
        )}
        {run?.log_text && (
          <details className="recorder-run-feedback__log-wrap">
            <summary>试跑日志</summary>
            <pre className="recorder-run-feedback__log">{run.log_text}</pre>
          </details>
        )}
        {shotHref && run.status === 'failed' && (
          <a
            className="recorder-run-feedback__shot"
            href={shotHref}
            target="_blank"
            rel="noreferrer"
          >
            查看失败截图
          </a>
        )}
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="recorder-run-inline">
        <div className="recorder-run-inline__main">
          <button
            type="button"
            className="recorder-btn recorder-btn--run"
            disabled={disabled || running}
            onClick={onRun}
            title={disabled ? '请填写用例名称并确保有脚本' : '在本机通过 Playwright 试跑'}
          >
            {running ? '试跑中…' : '▶ 试跑'}
          </button>
          {running && (
            <button type="button" className="recorder-btn recorder-btn--ghost" onClick={onCancel}>
              取消
            </button>
          )}
          {run && <StatusBadge status={run.status} />}
          <span className="recorder-run-inline__hint">
            {runnerReady === false ? (
              <button type="button" className="recorder-run-inline__setup" onClick={handleSetup}>
                本机运行器未启动
              </button>
            ) : '本机 Chromium · 登录 Cookie 自动注入'}
          </span>
        </div>
        {run?.error_message && run.status === 'failed' && (
          <p className="recorder-run-inline__error">{run.error_message}</p>
        )}
        {run?.log_text && (
          <details className="recorder-run-inline__log-wrap">
            <summary>试跑日志</summary>
            <pre className="recorder-run-inline__log">{run.log_text}</pre>
          </details>
        )}
        {shotHref && run.status === 'failed' && (
          <a
            className="recorder-run-inline__shot"
            href={shotHref}
            target="_blank"
            rel="noreferrer"
          >
            查看失败截图
          </a>
        )}
      </div>
    );
  }

  if (variant === 'bar') {
    return (
      <div className="recorder-run-bar">
        <div className="recorder-run-bar__main">
          <span className="recorder-run-bar__hint">
            {runnerReady === false ? (
              <button type="button" className="recorder-run-bar__setup" onClick={handleSetup}>
                本机运行器未启动 · 点击配置
              </button>
            ) : '本机拉起 Chromium 调试（首次需安装依赖；登录态随录制 Cookie 注入）'}
          </span>
          <button
            type="button"
            className="recorder-btn recorder-btn--run"
            disabled={disabled || running}
            onClick={onRun}
            title={disabled ? '请填写用例名称并确保有脚本' : '在本机通过 npx playwright test 试跑'}
          >
            {running ? '试跑中…' : '▶ 试跑'}
          </button>
          {running && (
            <button type="button" className="recorder-btn recorder-btn--ghost" onClick={onCancel}>
              取消
            </button>
          )}
          {run && <StatusBadge status={run.status} />}
        </div>
        {run?.log_text && (
          <pre className="recorder-run-bar__log">{run.log_text}</pre>
        )}
        {run?.error_message && run.status === 'failed' && (
          <p className="recorder-run-bar__error">{run.error_message}</p>
        )}
        {shotHref && run.status === 'failed' && (
          <a
            className="recorder-run-bar__shot"
            href={shotHref}
            target="_blank"
            rel="noreferrer"
          >
            查看失败截图
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="recorder-run-panel">
      <div className="recorder-run-panel__header">
        <h3 className="recorder-run-panel__title">本地试跑</h3>
        {run && <StatusBadge status={run.status} />}
      </div>
      <p className="recorder-run-panel__hint">
        {runnerReady === false
          ? '请先启动本机运行器（npm run local-runner）'
          : '本机 Node 执行，无需选择执行环境'}
      </p>
      <div className="recorder-run-panel__actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={disabled || running}
          onClick={onRun}
        >
          {running ? '试跑中…' : '试跑'}
        </button>
        {running && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
            取消
          </button>
        )}
        {runnerReady === false && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleSetup}>
            配置运行器
          </button>
        )}
      </div>
      {run?.log_text && (
        <pre className="recorder-run-panel__log">{run.log_text}</pre>
      )}
      {shotHref && run.status === 'failed' && (
        <a
          className="recorder-run-panel__shot-link"
          href={shotHref}
          target="_blank"
          rel="noreferrer"
        >
          查看失败截图
        </a>
      )}
      {run?.error_message && run.status === 'failed' && (
        <p className="recorder-run-panel__error">{run.error_message}</p>
      )}
    </div>
  );
}
