import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

import { authFetch } from '../authApi';

const API = '/api';
const RESULTS_BASE = '/results';

const BROWSER_LABELS = {
  chromium: 'Chromium',
  chrome: 'Chrome',
  msedge: 'Edge',
  firefox: 'Firefox',
  webkit: 'WebKit',
};
function getBrowserLabel(browser) {
  if (!browser) return '默认';
  return BROWSER_LABELS[browser] || browser;
}

/** 将接口返回的北京时间字符串转为 Date 的 getTime（用于计算时长） */
function parseBeijingTime(str) {
  if (!str) return NaN;
  const s = String(str).trim();
  const d = /^[\d-]+\s+[\d:]+$/.test(s) && !s.includes('Z') && !s.includes('+') ? new Date(s.replace(' ', 'T') + '+08:00') : new Date(s);
  return d.getTime();
}
/** 将北京时间字符串格式化为显示 */
function formatBeijingTime(str) {
  if (!str) return '—';
  const t = parseBeijingTime(str);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

/** 将毫秒格式化为 mm:ss */
function formatDurationMmSs(ms) {
  if (ms == null || ms === '') return '—';
  const totalSec = Math.floor(Number(ms) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function RunReport() {
  const { id } = useParams();
  const [run, setRun] = useState(null);
  const [polling, setPolling] = useState(true);
  const [toast, setToast] = useState(null);
  const [activeBrowserTab, setActiveBrowserTab] = useState(null); // 当前选中的浏览器 tab key
  const [casePage, setCasePage] = useState(1);
  const CASE_PAGE_SIZE = 10;

  useEffect(() => {
    const fetchRun = () => {
      authFetch(API + '/runs/' + id)
        .then((r) => r.json())
        .then((data) => {
          setRun(data);
          if (['done', 'failed', 'cancelled'].includes(data.status)) setPolling(false);
        });
    };
    fetchRun();
    if (!polling) return;
    // 每 1 秒刷新，已完成的用例会实时显示成功/失败，无需等全部跑完
    const t = setInterval(fetchRun, 1000);
    return () => clearInterval(t);
  }, [id, polling]);

  const copyReportId = (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(String(id)).then(() => {
      setToast('已复制报告 ID');
      setTimeout(() => setToast(null), 2000);
    }).catch(() => setToast('复制失败'));
  };

  if (!run) {
    return (
      <div className="loading-state">
        <div className="loading-state__icon" aria-hidden style={{ letterSpacing: '0.25em' }}>···</div>
        <p className="loading-state__text">加载测试报告</p>
      </div>
    );
  }

  const isDone = run.status === 'done' || run.status === 'failed' || run.status === 'cancelled';
  const canCancel = run.status === 'pending' || run.status === 'running';
  const cases = run.cases || [];
  const planName = run.plan_name || ('计划 #' + run.plan_id);
  const total = cases.length;
  const passed = cases.filter((c) => c.status === 'passed').length;
  const doneCount = cases.filter((c) => c.status === 'passed' || c.status === 'failed').length;
  const phaseLabels = { cloning: '正在克隆仓库', installing: '正在安装依赖', running: '正在执行用例' };
  const progressPhaseLabel = phaseLabels[run.progress_phase] || run.progress_phase;
  const progressText = run.status === 'running' && progressPhaseLabel
    ? (run.progress_phase === 'running' && total > 0 ? `${progressPhaseLabel}（已完成 ${doneCount}/${total}）` : progressPhaseLabel)
    : null;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const totalMs = cases.reduce((s, c) => s + (c.duration_ms || 0), 0);
  const runDurationMs = run.started_at && run.finished_at ? parseBeijingTime(run.finished_at) - parseBeijingTime(run.started_at) : null;

  const runBrowsers = Array.isArray(run.run_browsers) ? run.run_browsers : [];
  const casesByBrowser = {};
  for (const c of cases) {
    const key = c.browser ?? '__default__';
    if (!casesByBrowser[key]) casesByBrowser[key] = [];
    casesByBrowser[key].push(c);
  }
  const browserOrder = runBrowsers.length > 0
    ? [...runBrowsers, '__default__']
    : ['__default__'];
  const browserSections = browserOrder.filter((b) => b === '__default__' ? (casesByBrowser['__default__']?.length > 0) : (casesByBrowser[b]?.length > 0));
  const effectiveTab = activeBrowserTab && browserSections.includes(activeBrowserTab) ? activeBrowserTab : (browserSections[0] ?? null);
  const currentBrowserCases = effectiveTab ? (casesByBrowser[effectiveTab] || []) : [];
  const caseTotalPages = Math.max(1, Math.ceil(currentBrowserCases.length / CASE_PAGE_SIZE));
  const casePageIndex = Math.min(Math.max(1, casePage), caseTotalPages);
  const paginatedCases = currentBrowserCases.slice((casePageIndex - 1) * CASE_PAGE_SIZE, casePageIndex * CASE_PAGE_SIZE);
  const handleTabClick = (browserKey) => {
    setActiveBrowserTab(browserKey);
    setCasePage(1);
  };
  const getTabStats = (key) => {
    const list = casesByBrowser[key] || [];
    const passed = list.filter((c) => c.status === 'passed').length;
    const failed = list.filter((c) => c.status === 'failed').length;
    return { total: list.length, passed, failed };
  };

  const handleCancel = () => {
    if (!window.confirm('确定要停止该任务吗？')) return;
    authFetch(API + '/runs/' + id + '/cancel', { method: 'POST' })
      .then((r) => r.json())
      .then(() => {
        setPolling(false);
        setRun((prev) => prev ? { ...prev, status: 'cancelled' } : null);
      })
      .catch((e) => alert(e.message));
  };

  return (
    <>
      <div className="breadcrumb">
        <Link to="/">测试计划</Link>
        <span className="sep">/</span>
        <Link to={'/plans/' + run.plan_id}>{planName}</Link>
        <span className="sep">/</span>
        <Link to={'/reports?planId=' + run.plan_id}>执行历史</Link>
        <span className="sep">/</span>
        <span>测试报告 #{run.id}</span>
      </div>
      <div className="page-header page-header--run-report">
        <div className="page-header__title-wrap">
          <h1 className="run-report-title">测试报告</h1>
          <span className="run-report-id" title="点击复制" onClick={copyReportId}>ID：{run.id}</span>
        </div>
        <div className="card-actions">
          <span className={'badge badge-' + (run.status === 'done' ? 'passed' : run.status === 'running' ? 'running' : run.status === 'failed' ? 'failed' : run.status === 'cancelled' ? 'cancelled' : 'pending')}>
            {run.status === 'done' ? '已完成' : run.status === 'running' ? '运行中' : run.status === 'failed' ? '执行失败' : run.status === 'cancelled' ? '已取消' : '排队中'}
          </span>
          {progressText && (
            <span className="run-report-progress" aria-live="polite">{progressText}</span>
          )}
          {canCancel && (
            <button type="button" className="btn btn-secondary" onClick={handleCancel} style={{ color: '#f87171' }}>
              停止
            </button>
          )}
          <Link to={'/reports?planId=' + run.plan_id} className="btn btn-secondary">返回执行历史</Link>
          <Link to={'/plans/' + run.plan_id} className="btn btn-secondary">返回计划</Link>
          <Link to="/reports" className="btn btn-secondary">全部执行历史</Link>
        </div>
      </div>
      {toast && <div className="plan-toast" role="status">{toast}</div>}

      {run.status === 'failed' && run.log_text && (
        <div className="card run-report-fail-reason" role="alert">
          <h3 className="run-report-fail-reason__title">失败原因</h3>
          <pre className="run-report-fail-reason__text">{run.log_text}</pre>
        </div>
      )}

      <div className="card run-report-overview">
        <h2 className="run-report-overview__title">数据概览</h2>
        <div className="run-report-overview__row run-report-overview__row--main">
          <div className="run-report-overview__metric">
            <span className="run-report-overview__label">用例通过率</span>
            <div className="run-report-overview__pass-rate">
              <span className={'run-report-overview__pass-rate-value run-report-overview__pass-rate-value--' + (passRate >= 80 ? 'high' : passRate > 0 ? 'mid' : 'zero')}>{passRate}%</span>
              <div className="run-report-overview__pass-rate-bar" role="presentation">
                <div className="run-report-overview__pass-rate-fill run-report-overview__pass-rate-fill--pass" style={{ width: `${passRate}%` }} />
                <div className="run-report-overview__pass-rate-fill run-report-overview__pass-rate-fill--fail" style={{ width: `${100 - passRate}%` }} />
              </div>
            </div>
            <span className="run-report-overview__hint">{passed}/{total} 通过</span>
          </div>
          <div className="run-report-overview__metric">
            <span className="run-report-overview__label">用例总耗时</span>
            <span className="run-report-overview__value">{formatDurationMmSs(totalMs)}</span>
          </div>
          <div className="run-report-overview__metric">
            <span className="run-report-overview__label">执行时长</span>
            <span className="run-report-overview__value">{runDurationMs != null ? formatDurationMmSs(runDurationMs) : '—'}</span>
          </div>
          {run.started_at && (
            <div className="run-report-overview__metric">
              <span className="run-report-overview__label">开始时间</span>
              <span className="run-report-overview__value run-report-overview__value--muted">{formatBeijingTime(run.started_at)}</span>
            </div>
          )}
        </div>
        {browserSections.length > 0 && (
          <div className="run-report-overview__row run-report-overview__row--browsers">
            <span className="run-report-overview__label run-report-overview__label--row">各浏览器</span>
            <div className="run-report-overview__browsers">
              {browserSections.map((browserKey) => {
                const label = browserKey === '__default__' ? '默认' : getBrowserLabel(browserKey);
                const stats = getTabStats(browserKey);
                const rate = stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0;
                const isActive = effectiveTab === browserKey;
                return (
                  <button
                    key={browserKey}
                    type="button"
                    className={'run-report-overview-browser' + (isActive ? ' run-report-overview-browser--active' : '')}
                    onClick={() => handleTabClick(browserKey)}
                    aria-pressed={isActive}
                    aria-label={`${label}：${stats.passed}/${stats.total} 通过${stats.failed > 0 ? `，${stats.failed} 失败` : ''}，点击查看报告详情`}
                  >
                    <div className="run-report-overview-browser__top">
                      <span className="run-report-overview-browser__name">{label}</span>
                      <span className={'run-report-overview-browser__rate run-report-overview-browser__rate--' + (rate >= 80 ? 'high' : rate > 0 ? 'mid' : 'zero')}>{rate}%</span>
                    </div>
                    <div className="run-report-overview-browser__bar" role="presentation">
                      <div className="run-report-overview-browser__bar-pass" style={{ width: `${rate}%` }} />
                      <div className="run-report-overview-browser__bar-fail" style={{ width: `${100 - rate}%` }} />
                    </div>
                    <div className="run-report-overview-browser__counts">
                      <span className="run-report-overview-browser__passed">{stats.passed}/{stats.total} 通过</span>
                      {stats.failed > 0 && <span className="run-report-overview-browser__failed">{stats.failed} 失败</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">用例结果</div>
        <p className="card-muted" style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem' }}>
          按浏览器分类展示，点击用例行的「报告详情」进入该次执行详情（步骤、截图、录屏等）。
          {run.status === 'running' && total > 0 && (
            <span className="run-report-live-hint"> · 执行中已完成用例会实时更新</span>
          )}
        </p>
        {browserSections.length === 0 ? (
          <p className="card-muted" style={{ margin: 0 }}>暂无用例结果</p>
        ) : (
          <div className="run-report-by-browser">
            <div className="run-report-tabs" role="tablist" aria-label="按浏览器查看结果">
              {browserSections.map((browserKey) => {
                const label = browserKey === '__default__' ? '默认' : getBrowserLabel(browserKey);
                const stats = getTabStats(browserKey);
                const isActive = effectiveTab === browserKey;
                return (
                  <button
                    key={browserKey}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`run-report-panel-${browserKey}`}
                    id={`run-report-tab-${browserKey}`}
                    className={'run-report-tab' + (isActive ? ' run-report-tab--active' : '')}
                    onClick={() => handleTabClick(browserKey)}
                  >
                    <span className="run-report-tab__label">{label}</span>
                    <span className="run-report-tab__stats">
                      {stats.passed}/{stats.total} 通过
                      {stats.failed > 0 && <span className="run-report-tab__failed"> · {stats.failed} 失败</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              key={effectiveTab}
              id={`run-report-panel-${effectiveTab}`}
              role="tabpanel"
              aria-labelledby={`run-report-tab-${effectiveTab}`}
              className="run-report-tabpanel"
            >
              {effectiveTab && (() => {
                const panelLabel = effectiveTab === '__default__' ? '默认' : getBrowserLabel(effectiveTab);
                return (
                  <>
                    <p className="run-report-tabpanel__caption">{panelLabel}：共 {currentBrowserCases.length} 条用例，点击「报告详情」查看步骤、截图与录屏。</p>
                    <div className="run-report-case-table-wrap">
                      <table className="run-report-case-table">
                        <thead>
                          <tr>
                            <th>用例</th>
                            <th>状态</th>
                            <th>耗时</th>
                            <th style={{ width: 100, textAlign: 'right' }}>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedCases.map((c) => (
                            <tr key={c.id}>
                              <td className="run-report-case-path" title={c.case_path}>{c.case_display_name || c.case_path}</td>
                              <td>
                                <span className={'badge badge-' + (c.status === 'passed' ? 'passed' : c.status === 'failed' ? 'failed' : 'pending')}>
                                  {c.status === 'passed' ? '通过' : c.status === 'failed' ? '失败' : c.status}
                                </span>
                              </td>
                              <td>{formatDurationMmSs(c.duration_ms)}</td>
                              <td style={{ textAlign: 'right' }}>
                                <Link to={`/runs/${id}/cases/${c.id}`} className="btn btn-sm run-report-detail-btn" title="查看该用例的报告详情（步骤、截图、录屏）">报告详情</Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {currentBrowserCases.length > 0 && (
                      <div className="run-report-case-pagination">
                        <span className="run-report-case-pagination__info">
                          共 {currentBrowserCases.length} 条，第 {casePageIndex}/{caseTotalPages} 页
                        </span>
                        <div className="run-report-case-pagination__btns">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={casePageIndex <= 1}
                            onClick={() => setCasePage((p) => Math.max(1, p - 1))}
                          >
                            上一页
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={casePageIndex >= caseTotalPages}
                            onClick={() => setCasePage((p) => Math.min(caseTotalPages, p + 1))}
                          >
                            下一页
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
