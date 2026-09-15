import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

import { authFetch } from '../authApi';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import CopyButton from '../components/ui/CopyButton';
import WorkbenchLayout, { WorkbenchHeader, WorkbenchPanel } from '../components/layout/WorkbenchLayout';
import { getCaseSourceInfo } from '../utils/caseDisplay';
import { formatDateTime } from '../utils/formatTime';

const API = '/api';
const RESULTS_BASE = '/results';

const BROWSER_LABELS = { chromium: 'Chromium', chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', webkit: 'WebKit' };

function getBrowserLabel(b) {
  return b ? (BROWSER_LABELS[b] || b) : '默认';
}

function formatDuration(ms) {
  if (ms == null || ms === '') return '—';
  const n = Number(ms);
  if (Number.isNaN(n)) return '—';
  if (n < 1000) return `${n}ms`;
  const totalSec = Math.floor(n / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}分${String(s).padStart(2, '0')}秒`;
  return `${s}秒`;
}

export default function RunCaseReport() {
  const { runId, caseId } = useParams();
  const [data, setData] = useState(null);
  const [logContent, setLogContent] = useState(null);
  const [logLoading, setLogLoading] = useState(false);

  useEffect(() => {
    authFetch(API + '/runs/' + runId + '/cases/' + caseId)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [runId, caseId]);

  useEffect(() => {
    if (data?.log_path) {
      setLogLoading(true);
      fetch(RESULTS_BASE + '/' + data.log_path)
        .then((r) => r.text())
        .then((text) => setLogContent(text))
        .catch(() => setLogContent(data?.run_log_text || null))
        .finally(() => setLogLoading(false));
      return;
    }
    setLogContent(data?.run_log_text || null);
    setLogLoading(false);
  }, [data?.log_path, data?.run_log_text]);

  if (!data) {
    return <EmptyState variant="loading" title="加载用例详情" hint="正在获取执行结果" />;
  }

  const screenshotUrl = data.screenshot_path ? RESULTS_BASE + '/' + data.screenshot_path : null;
  const videoUrl = data.video_path ? RESULTS_BASE + '/' + data.video_path : null;
  const traceUrl = data.trace_path ? RESULTS_BASE + '/' + data.trace_path : null;
  const stepScreenshots = Array.isArray(data.screenshots) && data.screenshots.length > 0
    ? data.screenshots.map((p) => RESULTS_BASE + '/' + p)
    : (screenshotUrl ? [screenshotUrl] : []);
  const hasArtifacts = stepScreenshots.length > 0 || !!videoUrl;
  const isFailed = data.status === 'failed';
  const isPassed = data.status === 'passed';
  const source = getCaseSourceInfo(data.case_path, data.case_metadata);
  const displayName = data.case_display_name || data.case_path;
  const showPath = data.case_path && displayName !== data.case_path;

  const statusLabel = isPassed ? '通过' : isFailed ? '失败' : data.status === 'running' ? '执行中' : data.status === 'pending' ? '等待' : data.status;
  const isInterruptFailure = isFailed && (
    data.error_message === '后端重启，执行中断'
    || (data.run_log_text && /后端已重启|执行中途被中断/.test(data.run_log_text))
  );

  return (
    <WorkbenchLayout className="run-case-page">
      <WorkbenchHeader
        title={(
          <span className="run-case-header__title-row">
            <span>{displayName}</span>
            <StatusBadge
              status={isPassed ? 'passed' : isFailed ? 'failed' : data.status === 'running' ? 'running' : 'pending'}
              label={statusLabel}
            />
            <span className={`run-case-source run-case-source--${source.kind}`}>{source.label}</span>
          </span>
        )}
        description={showPath ? (
          <span className="run-case-header__path">
            <span>用例路径</span>
            <code>{data.case_path}</code>
            <CopyButton text={data.case_path} label="复制" />
          </span>
        ) : undefined}
        meta={(
          <>
            {data.plan_name && (
              <>
                <Link to={'/plans/' + data.plan_id}>{data.plan_name}</Link>
                <span className="wb-header__meta-sep">·</span>
              </>
            )}
            <Link to={'/runs/' + runId}>报告 #{runId}</Link>
            {source.kind === 'git' && source.repo && (
              <>
                <span className="wb-header__meta-sep">·</span>
                <span>{source.repo}@{source.branch}</span>
              </>
            )}
          </>
        )}
        actions={(
          <Link to={'/runs/' + runId} className="btn btn-secondary">返回报告</Link>
        )}
      />

      {isFailed && data.error_message && (
        <div className="run-case-alert run-case-alert--error" role="alert">
          <div className="run-case-alert__icon" aria-hidden>!</div>
          <div className="run-case-alert__body">
            <strong>执行失败</strong>
            <p>{data.error_message}</p>
          </div>
        </div>
      )}

      <section className="run-case-meta-grid" aria-label="执行信息">
        <div className="run-case-meta-card">
          <span className="run-case-meta-card__label">耗时</span>
          <span className="run-case-meta-card__value">{formatDuration(data.duration_ms)}</span>
        </div>
        <div className="run-case-meta-card">
          <span className="run-case-meta-card__label">浏览器</span>
          <span className="run-case-meta-card__value">{getBrowserLabel(data.browser)}</span>
        </div>
        <div className="run-case-meta-card">
          <span className="run-case-meta-card__label">来源</span>
          <span className="run-case-meta-card__value">{source.shortLabel}</span>
        </div>
        <div className="run-case-meta-card">
          <span className="run-case-meta-card__label">复用范围</span>
          <span className="run-case-meta-card__value">
            {data.case_metadata?.reuse_scope === 'specific' ? '不通用' : '通用'}
          </span>
        </div>
      </section>

      {data.case_metadata?.description && (
        <div className="run-case-desc card">
          <div className="run-case-desc__label">用例说明</div>
          <p>{data.case_metadata.description}</p>
          {data.case_metadata.tags?.length > 0 && (
            <div className="run-case-tag-row">
              {data.case_metadata.tags.map((t) => (
                <span key={t} className="run-case-tag">{t}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {(hasArtifacts || videoUrl) && (
        <WorkbenchPanel className="run-case-panel">
          <div className="run-case-panel__head">
            <h2 className="run-case-panel__title">执行产物</h2>
            {stepScreenshots.length > 0 && (
              <span className="run-case-panel__meta">{stepScreenshots.length} 张截图</span>
            )}
          </div>
          {stepScreenshots.length > 0 && (
            <div className="run-case-screenshots">
              {stepScreenshots.map((url, idx) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="run-case-screenshot"
                >
                  <img src={url} alt={`步骤 ${idx + 1} 截图`} loading="lazy" />
                  <span className="run-case-screenshot__label">步骤 {idx + 1}</span>
                </a>
              ))}
            </div>
          )}
          {videoUrl && (
            <div className="run-case-video-wrap" id="recording">
              <div className="run-case-panel__subhead">录屏回放</div>
              <video src={videoUrl} controls className="run-case-video" preload="metadata" playsInline />
            </div>
          )}
        </WorkbenchPanel>
      )}

      <WorkbenchPanel className="run-case-panel">
        <div className="run-case-panel__head">
          <h2 className="run-case-panel__title">执行日志</h2>
          {logContent && <CopyButton text={logContent} label="复制日志" />}
        </div>
        {logLoading ? (
          <p className="run-case-log-empty">加载日志中…</p>
        ) : logContent ? (
          <pre className="run-case-log">{logContent}</pre>
        ) : isInterruptFailure ? (
          <EmptyState
            variant="error"
            title="执行被中断，无 Playwright 日志"
            hint="后端在跑用例过程中重启（常见于开发模式 node --watch），进程被终止时尚未写入日志文件。请重新触发执行。"
          />
        ) : (
          <EmptyState
            variant="empty"
            title="暂无日志"
            hint={data.log_path ? '日志文件未能加载' : '本次执行未产生日志输出'}
          />
        )}
      </WorkbenchPanel>

      {traceUrl && (
        <div className="run-case-trace card">
          <div className="run-case-panel__head">
            <h2 className="run-case-panel__title">Trace 调试</h2>
          </div>
          <p className="run-case-trace__hint">可用 Playwright Trace Viewer 打开进行逐步调试</p>
          <a href={traceUrl} target="_blank" rel="noreferrer" className="btn btn-secondary">下载 Trace 文件</a>
        </div>
      )}
    </WorkbenchLayout>
  );
}
