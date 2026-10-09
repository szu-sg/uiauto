import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

import { authFetch } from '../authApi';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import UserChip from '../components/UserChip';
import StatusBadge from '../components/ui/StatusBadge';
import CopyButton from '../components/ui/CopyButton';
import EmptyState from '../components/ui/EmptyState';
import PassRateRing from '../components/ui/PassRateRing';
import WorkbenchLayout, {
  WorkbenchHeader,
  WorkbenchPanel,
  WorkbenchToolbar,
  WorkbenchPagination,
} from '../components/layout/WorkbenchLayout';
import { userFromTriggerFields, displayCreatorText, isSameCreator } from '../utils/userDisplay';
import { getCaseSourceInfo } from '../utils/caseDisplay';
import { formatDateTime, formatDurationMmSs, parseAppDateTime } from '../utils/formatTime';

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

export default function RunReport() {
  const { id } = useParams();
  const user = useUser();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [run, setRun] = useState(null);
  const [polling, setPolling] = useState(true);
  const [failLogOpen, setFailLogOpen] = useState(true);
  const [activeBrowserTab, setActiveBrowserTab] = useState(null);
  const [casePage, setCasePage] = useState(1);
  const [liveLogOpen, setLiveLogOpen] = useState(true);
  const liveLogRef = useRef(null);
  const CASE_PAGE_SIZE_OPTIONS = [10, 20, 50];
  const [casePageSize, setCasePageSize] = useState(10);
  const [liveElapsedMs, setLiveElapsedMs] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchRun = () => {
      authFetch(API + '/runs/' + id)
        .then((r) => {
          if (!r.ok) throw new Error('加载失败');
          return r.json();
        })
        .then((data) => {
          setRun(data);
          if (['done', 'failed', 'cancelled'].includes(data.status)) setPolling(false);
        })
        .catch(() => {});
    };
    fetchRun();
    if (!polling) return;
    const t = setInterval(fetchRun, 2000);
    return () => clearInterval(t);
  }, [id, polling]);

  useEffect(() => {
    if (!run?.started_at || !['running', 'pending'].includes(run.status)) {
      setLiveElapsedMs(null);
      return;
    }
    const start = parseAppDateTime(run.started_at);
    if (Number.isNaN(start)) return;
    const tick = () => setLiveElapsedMs(Math.max(0, Date.now() - start));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [run?.started_at, run?.status]);

  // 实时日志自动滚到底部
  useEffect(() => {
    if (liveLogRef.current && liveLogOpen) {
      liveLogRef.current.scrollTop = liveLogRef.current.scrollHeight;
    }
  }, [run?.log_text, liveLogOpen]);

  if (!run) {
    return <EmptyState variant="loading" title="加载测试报告" hint="正在获取执行详情" />;
  }

  const canCancel = run.status === 'pending' || run.status === 'running';
  const cases = run.cases || [];
  const planName = run.plan_name || ('计划 #' + run.plan_id);
  const total = cases.length;
  const passed = cases.filter((c) => c.status === 'passed').length;
  const doneCount = cases.filter((c) => c.status === 'passed' || c.status === 'failed').length;
  const runningCount = cases.filter((c) => c.status === 'running').length;
  const phaseLabels = { cloning: '正在克隆仓库', installing: '正在安装依赖', running: '正在执行用例' };
  const progressPhaseLabel = phaseLabels[run.progress_phase] || run.progress_phase;
  const progressText = run.status === 'running' && progressPhaseLabel
    ? (run.progress_phase === 'running' && total > 0
      ? `${progressPhaseLabel}（已完成 ${doneCount}/${total}${runningCount > 0 ? `，${runningCount} 条执行中` : ''}）`
      : progressPhaseLabel)
    : null;
  const failedCount = cases.filter((c) => c.status === 'failed').length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const completionRate = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const isLiveRun = run.status === 'running' || run.status === 'pending';
  const totalMs = cases.reduce((s, c) => s + (c.duration_ms || 0), 0);
  const runDurationMs = run.started_at && run.finished_at
    ? Math.max(0, parseAppDateTime(run.finished_at) - parseAppDateTime(run.started_at))
    : null;

  const runBrowsers = Array.isArray(run.run_browsers) ? run.run_browsers : [];
  const casesByBrowser = {};
  for (const c of cases) {
    const key = (c.browser && String(c.browser).trim()) || '__default__';
    if (!casesByBrowser[key]) casesByBrowser[key] = [];
    casesByBrowser[key].push(c);
  }
  const keysWithCases = Object.keys(casesByBrowser).filter((k) => casesByBrowser[k].length > 0);
  const browserOrder = [
    ...runBrowsers.filter((b) => keysWithCases.includes(b)),
    ...keysWithCases.filter((k) => !runBrowsers.includes(k)),
  ];
  const browserSections = browserOrder.length > 0 ? browserOrder : keysWithCases;
  const effectiveTab = activeBrowserTab && browserSections.includes(activeBrowserTab) ? activeBrowserTab : (browserSections[0] ?? null);
  const currentBrowserCases = effectiveTab ? (casesByBrowser[effectiveTab] || []) : [];
  const caseTotalPages = Math.max(1, Math.ceil(currentBrowserCases.length / casePageSize));
  const casePageIndex = Math.min(Math.max(1, casePage), caseTotalPages);
  const paginatedCases = currentBrowserCases.slice((casePageIndex - 1) * casePageSize, casePageIndex * casePageSize);
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

  const handleCancel = async () => {
    const ok = await confirm({
      title: '停止任务',
      message: '确定要停止该任务吗？',
      danger: true,
      confirmLabel: '停止',
    });
    if (!ok) return;
    authFetch(API + '/runs/' + id + '/cancel', { method: 'POST' })
      .then((r) => r.json())
      .then(() => {
        setPolling(false);
        setRun((prev) => prev ? { ...prev, status: 'cancelled' } : null);
      })
      .catch((e) => showToast(e.message));
  };

  return (
    <WorkbenchLayout className="run-report-page wb-page--fill">
      <WorkbenchHeader
        compact
        title={(
          <span className="run-report-header-row__left">
            <span>测试报告</span>
            <CopyButton text={String(run.id)} label={`#${run.id}`} />
            <StatusBadge
              status={run.status === 'done' ? 'passed' : run.status}
              label={run.status === 'done' ? '已完成' : run.status === 'running' ? '运行中' : run.status === 'failed' ? '执行失败' : run.status === 'cancelled' ? '已取消' : '排队中'}
            />
          </span>
        )}
        description={
          isLiveRun
            ? (progressText || (total > 0 ? `进度 ${doneCount}/${total}` : '任务执行中'))
            : (total > 0 ? `通过率 ${passRate}% · ${passed}/${total} 通过` : '暂无用例')
        }
        meta={(
          <>
            <Link to={'/plans/' + run.plan_id} className="run-report-meta-plan">{planName}</Link>
            <span className="wb-header__meta-sep">·</span>
            {(() => {
              const triggerUser = userFromTriggerFields(run);
              const fallback = displayCreatorText(run.plan_creator, user);
              if (triggerUser) return <UserChip user={triggerUser} size="sm" />;
              if (isSameCreator(run.plan_creator, user)) return <UserChip user={user} size="sm" />;
              return <span>{fallback}</span>;
            })()}
            {run.started_at && (
              <>
                <span className="wb-header__meta-sep">·</span>
                <span title={formatDateTime(run.started_at)}>开始 {formatDateTime(run.started_at)}</span>
              </>
            )}
            {run.finished_at && (
              <>
                <span className="wb-header__meta-sep">·</span>
                <span title={formatDateTime(run.finished_at)}>结束 {formatDateTime(run.finished_at)}</span>
              </>
            )}
          </>
        )}
        actions={(
          <>
            {canCancel && (
              <button type="button" className="btn btn-danger" onClick={handleCancel}>
                停止任务
              </button>
            )}
            <Link to={'/plans/' + run.plan_id} className="btn btn-secondary">返回计划</Link>
          </>
        )}
      />

      <section className="run-report-summary" aria-label="执行概览">
        <div className="run-report-summary__main">
          <div className="run-report-summary__ring">
            <PassRateRing
              rate={isLiveRun ? completionRate : passRate}
              mode={isLiveRun ? 'progress' : 'pass'}
              size={92}
              stroke={10}
              centerText={isLiveRun ? `${completionRate}%` : undefined}
              ariaLabel={isLiveRun ? `已完成 ${doneCount}/${total}` : `通过率 ${passRate}%`}
            />
            <div className="run-report-summary__ring-meta">
              <span className="run-report-summary__pass-value">
                {isLiveRun ? `${doneCount}/${total}` : `${passed}/${total}`}
              </span>
              <span className="run-report-summary__pass-label">
                {isLiveRun ? '已完成' : '用例通过'}
                {!isLiveRun && failedCount > 0 && ` · 失败 ${failedCount}`}
              </span>
              {isLiveRun && (
                <span className="run-report-summary__pass-sub">
                  通过 {passed} · 失败 {failedCount}
                  {runningCount > 0 ? ` · 执行中 ${runningCount}` : ''}
                </span>
              )}
              {isLiveRun && <span className="run-report-summary__pass-live">每 2 秒自动刷新</span>}
            </div>
          </div>
          <div className="run-report-summary__bar" aria-hidden>
            <span className="run-report-summary__bar-pass" style={{ width: `${total > 0 ? (passed / total) * 100 : 0}%` }} />
            {failedCount > 0 && (
              <span className="run-report-summary__bar-fail" style={{ width: `${total > 0 ? (failedCount / total) * 100 : 0}%` }} />
            )}
          </div>
        </div>
        <div className="run-report-summary__metrics">
          <div className="run-report-summary__metric">
            <span className="run-report-summary__metric-label">用例总耗时</span>
            <span className="run-report-summary__metric-value">{formatDurationMmSs(totalMs)}</span>
          </div>
          <div className="run-report-summary__metric">
            <span className="run-report-summary__metric-label">{isLiveRun ? '已用时长' : '执行时长'}</span>
            <span className="run-report-summary__metric-value">
              {isLiveRun && liveElapsedMs != null
                ? formatDurationMmSs(liveElapsedMs)
                : runDurationMs != null
                  ? formatDurationMmSs(runDurationMs)
                  : '—'}
            </span>
          </div>
          {run.started_at && (
            <div className="run-report-summary__metric">
              <span className="run-report-summary__metric-label">开始时间</span>
              <span className="run-report-summary__metric-value run-report-summary__metric-value--sm">
                {formatDateTime(run.started_at)}
              </span>
            </div>
          )}
        </div>
      </section>

      {run.status === 'failed' && run.log_text && (
        <div className="run-report-fail-banner" role="alert">
          <div className="run-report-fail-banner__head">
            <strong>失败原因</strong>
            <button
              type="button"
              className="run-report-fail-banner__toggle"
              onClick={() => setFailLogOpen((v) => !v)}
            >
              {failLogOpen ? '收起' : '展开'}
            </button>
          </div>
          {failLogOpen && (
            <pre className="run-report-fail-banner__text">{run.log_text}</pre>
          )}
        </div>
      )}

      {run.status === 'running' && (
        <div className="run-live-log glass-card">
          <div className="run-live-log__header" onClick={() => setLiveLogOpen((v) => !v)}>
            <span className="run-live-log__dot" aria-hidden="true" />
            <span className="run-live-log__title">实时日志</span>
            <span className="run-live-log__toggle">{liveLogOpen ? '收起' : '展开'}</span>
          </div>
          {liveLogOpen && (
            <pre
              ref={liveLogRef}
              className="run-live-log__body"
              aria-live="polite"
              aria-label="实时执行日志"
            >
              {run.log_text || (isLiveRun ? '等待用例输出…' : '暂无日志')}
            </pre>
          )}
        </div>
      )}

      {browserSections.length === 0 ? (
        <WorkbenchPanel>
          <EmptyState title="暂无用例结果" hint="该任务还未产出可展示的用例结果，请稍后刷新。" />
        </WorkbenchPanel>
      ) : (
        <WorkbenchPanel
          className="run-report-cases-panel wb-panel--main glass-card"
          toolbar={(
            <WorkbenchToolbar
              filters={(
                <div className="run-report-tabs" role="tablist" aria-label="按浏览器查看结果">
                  {browserSections.map((browserKey) => {
                    const label = browserKey === '__default__' ? '默认' : getBrowserLabel(browserKey);
                    const tabStats = getTabStats(browserKey);
                    const isActive = effectiveTab === browserKey;
                    return (
                      <button
                        key={browserKey}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        className={'run-report-tab' + (isActive ? ' run-report-tab--active' : '')}
                        onClick={() => handleTabClick(browserKey)}
                      >
                        <span className="run-report-tab__label">{label}</span>
                        <span className="run-report-tab__stats">
                          {tabStats.passed}/{tabStats.total}
                          {tabStats.failed > 0 && <span className="run-report-tab__failed"> · {tabStats.failed} 败</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              meta={run.status === 'running' && total > 0 ? '执行中实时更新' : `共 ${currentBrowserCases.length} 条`}
            />
          )}
          footer={currentBrowserCases.length > 0 && (
            <WorkbenchPagination
              pageSize={casePageSize}
              pageSizeOptions={CASE_PAGE_SIZE_OPTIONS}
              onPageSizeChange={(n) => { setCasePageSize(n); setCasePage(1); }}
              currentPage={casePageIndex}
              totalPages={caseTotalPages}
              onPrev={() => setCasePage((p) => Math.max(1, p - 1))}
              onNext={() => setCasePage((p) => Math.min(caseTotalPages, p + 1))}
            />
          )}
        >
          <div className="wb-table-wrap">
            <table className="ui-table case-repo-table run-report-case-table">
              <colgroup>
                <col className="run-report-case-table__col run-report-case-table__col--name" />
                <col className="run-report-case-table__col run-report-case-table__col--source" />
                <col className="run-report-case-table__col run-report-case-table__col--status" />
                <col className="run-report-case-table__col run-report-case-table__col--duration" />
                <col className="run-report-case-table__col run-report-case-table__col--actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>用例</th>
                  <th>来源</th>
                  <th>状态</th>
                  <th>耗时</th>
                  <th className="run-report-case-table__actions-h">
                    <span className="run-report-case-table__actions-head">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedCases.map((c) => {
                  const source = getCaseSourceInfo(c.case_path, c.case_metadata);
                  const showPath = c.case_display_name && c.case_path !== c.case_display_name;
                  return (
                  <tr
                    key={c.id}
                    className={'wb-table__row run-report-case-row' + (c.status === 'failed' ? ' run-report-case-row--failed' : '')}
                    tabIndex={0}
                    onClick={() => navigate(`/runs/${id}/cases/${c.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/runs/${id}/cases/${c.id}`);
                      }
                    }}
                  >
                    <td className="run-report-case-cell">
                      <div className="wb-table__primary">
                        <span className="wb-table__name run-report-case-name" title={c.case_display_name || c.case_path}>
                          {c.case_display_name || c.case_path}
                        </span>
                        {showPath && (
                          <span className="wb-table__sub run-report-case-path" title={c.case_path}>{c.case_path}</span>
                        )}
                      </div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <span className={`run-case-source run-case-source--${source.kind}`} title={source.repo ? `${source.repo}@${source.branch}` : undefined}>
                        {source.shortLabel}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <StatusBadge
                        status={c.status === 'passed' ? 'passed' : c.status === 'failed' ? 'failed' : c.status === 'running' ? 'running' : 'pending'}
                        label={c.status === 'passed' ? '通过' : c.status === 'failed' ? '失败' : c.status === 'running' ? '执行中' : '等待'}
                      />
                    </td>
                    <td className="run-report-case-duration">{formatDurationMmSs(c.duration_ms)}</td>
                    <td className="run-report-case-table__actions" onClick={(e) => e.stopPropagation()}>
                      <div className="run-report-case-actions">
                        <Link to={`/runs/${id}/cases/${c.id}`} className="run-report-case-actions__link">详情</Link>
                        {c.video_path && (
                          <Link
                            to={`/runs/${id}/cases/${c.id}#recording`}
                            className="run-report-case-actions__link run-report-case-actions__link--muted"
                          >
                            录屏
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </WorkbenchPanel>
      )}
    </WorkbenchLayout>
  );
}
