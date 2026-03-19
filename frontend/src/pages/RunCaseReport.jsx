import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

import { authFetch } from '../authApi';

const API = '/api';
const RESULTS_BASE = '/results';

const BROWSER_LABELS = { chromium: 'Chromium', chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', webkit: 'WebKit' };
function getBrowserLabel(b) { return b ? (BROWSER_LABELS[b] || b) : '默认'; }

export default function RunCaseReport() {
  const { runId, caseId } = useParams();
  const [data, setData] = useState(null);
  const [logContent, setLogContent] = useState(null);

  useEffect(() => {
    authFetch(API + '/runs/' + runId + '/cases/' + caseId)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [runId, caseId]);

  useEffect(() => {
    if (!data?.log_path) return;
    fetch(RESULTS_BASE + '/' + data.log_path)
      .then((r) => r.text())
      .then(setLogContent)
      .catch(() => setLogContent(null));
  }, [data?.log_path]);

  if (!data) {
    return (
      <div className="loading-state">
        <div className="loading-state__icon" aria-hidden style={{ letterSpacing: '0.25em' }}>···</div>
        <p className="loading-state__text">加载用例详情</p>
      </div>
    );
  }

  const planName = data.plan_name || ('计划 #' + (data.run_id || runId));
  const screenshotUrl = data.screenshot_path ? RESULTS_BASE + '/' + data.screenshot_path : null;
  const videoUrl = data.video_path ? RESULTS_BASE + '/' + data.video_path : null;
  const traceUrl = data.trace_path ? RESULTS_BASE + '/' + data.trace_path : null;
  const stepScreenshots = Array.isArray(data.screenshots) && data.screenshots.length > 0
    ? data.screenshots.map((p) => RESULTS_BASE + '/' + p)
    : (screenshotUrl ? [screenshotUrl] : []);
  const hasStepScreenshots = stepScreenshots.length > 0;

  return (
    <>
      <div className="breadcrumb">
        <Link to="/">测试计划</Link>
        <span className="sep">/</span>
        {data.plan_id ? <Link to={'/plans/' + data.plan_id}>{planName}</Link> : <span>{planName}</span>}
        <span className="sep">/</span>
        {data.plan_id ? <Link to={'/reports?planId=' + data.plan_id}>执行历史</Link> : <span>执行历史</span>}
        <span className="sep">/</span>
        <Link to={'/runs/' + runId}>测试报告 #{runId}</Link>
        <span className="sep">/</span>
        <span>用例详情</span>
      </div>
      <div className="page-header">
        <div>
          <h1 className="run-case-detail-title">{data.case_display_name || data.case_path}</h1>
          {data.case_display_name && data.case_path !== (data.case_display_name || '') && (
            <p className="card-muted" style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem' }}>用例路径：{data.case_path}</p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
            <span className={'badge badge-' + (data.status === 'passed' ? 'passed' : data.status === 'failed' ? 'failed' : 'pending')}>
              {data.status === 'passed' ? '通过' : data.status === 'failed' ? '失败' : data.status}
            </span>
            {data.duration_ms != null && <span className="card-muted">{data.duration_ms}ms</span>}
            <span className="card-muted">浏览器：{getBrowserLabel(data.browser)}</span>
          </div>
        </div>
        <Link to={'/runs/' + runId} className="btn btn-secondary">返回报告</Link>
      </div>

      {/* 执行步骤：每步对应一张截图（test.step 时多张） */}
      <div className="card">
        <div className="section-title">执行步骤</div>
        <p className="card-muted" style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem' }}>
          用例名称：{data.case_display_name || data.case_path}
        </p>
        {data.case_metadata && (data.case_metadata.description || (data.case_metadata.tags && data.case_metadata.tags.length)) && (
          <div style={{ marginBottom: '0.5rem' }}>
            {data.case_metadata.description && <p className="card-muted" style={{ margin: 0, fontSize: '0.8125rem' }}>{data.case_metadata.description}</p>}
            {data.case_metadata.tags && data.case_metadata.tags.length > 0 && (
              <span style={{ display: 'inline-flex', gap: '0.25rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                {data.case_metadata.tags.map((t) => (
                  <span key={t} style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', background: '#3f3f46', borderRadius: 4 }}>{t}</span>
                ))}
              </span>
            )}
          </div>
        )}
        <div className="run-case-steps">
          {hasStepScreenshots ? (
            stepScreenshots.map((url, idx) => (
              <div key={idx} className="run-case-step">
                <span className="run-case-step__label">步骤 {idx + 1}</span>
                <span className="run-case-step__name">{idx === 0 ? '执行用例' : `步骤 ${idx + 1}`}</span>
                <a href={url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: '0.5rem' }}>
                  <img src={url} alt={`步骤 ${idx + 1} 截图`} className="run-case-artifact-img" />
                </a>
                {data.error_message && idx === stepScreenshots.length - 1 && (
                  <div className="run-case-step__error">
                    <strong>错误信息</strong>
                    <pre>{data.error_message}</pre>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="run-case-step">
              <span className="run-case-step__label">步骤 1</span>
              <span className="run-case-step__name">执行用例</span>
              {data.error_message && (
                <div className="run-case-step__error">
                  <strong>错误信息</strong>
                  <pre>{data.error_message}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 无步骤截图时保留单独截图区块（兼容旧数据） */}
      {screenshotUrl && !hasStepScreenshots && (
        <div className="card">
          <div className="section-title">截图</div>
          <a href={screenshotUrl} target="_blank" rel="noreferrer">
            <img src={screenshotUrl} alt="用例截图" className="run-case-artifact-img" />
          </a>
        </div>
      )}

      {/* 录屏 */}
      {videoUrl && (
        <div className="card">
          <div className="section-title">整体录屏</div>
          <video src={videoUrl} controls className="run-case-artifact-video" />
        </div>
      )}

      {/* 执行日志 */}
      <div className="card">
        <div className="section-title">执行日志</div>
        {logContent !== null ? (
          <pre className="run-case-log">{logContent || '(无日志)'}</pre>
        ) : (
          data.log_path ? <p className="card-muted">加载日志中...</p> : <p className="card-muted">无日志</p>
        )}
      </div>

      {traceUrl && (
        <div className="card">
          <div className="section-title">Trace</div>
          <p className="card-muted" style={{ marginBottom: '0.5rem' }}>可用 Playwright Trace Viewer 打开</p>
          <a href={traceUrl} target="_blank" rel="noreferrer" className="btn btn-secondary">下载 Trace 文件</a>
        </div>
      )}
    </>
  );
}
