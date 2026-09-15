import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { authFetch } from '../authApi';
import { useUser } from '../context/UserContext';
import UserChip from '../components/UserChip';
import StatusBadge from '../components/ui/StatusBadge';
import WorkbenchLayout from '../components/layout/WorkbenchLayout';
import { userFromTriggerFields, displayCreatorText, isSameCreator } from '../utils/userDisplay';
import { formatDateTime, formatRelativeTime } from '../utils/formatTime';

const API = '/api';
const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'done', label: '已完成' },
  { value: 'running', label: '运行中' },
  { value: 'pending', label: '排队中' },
  { value: 'failed', label: '执行失败' },
  { value: 'cancelled', label: '已取消' },
];

function runDuration(r) {
  if (!r.started_at || !r.finished_at) return '—';
  const parseBj = (x) => {
    const s = String(x).trim();
    return (/^[\d-]+\s+[\d:]+$/.test(s) && !s.includes('Z') && !s.includes('+')
      ? new Date(s.replace(' ', 'T') + '+08:00')
      : new Date(s)).getTime();
  };
  const sec = Math.round((parseBj(r.finished_at) - parseBj(r.started_at)) / 1000);
  if (sec < 60) return `${sec} 秒`;
  return `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`;
}

function statusKey(status) {
  if (status === 'done') return 'passed';
  if (status === 'running') return 'running';
  if (status === 'failed') return 'failed';
  if (status === 'cancelled') return 'cancelled';
  return 'pending';
}

function statusLabel(status) {
  if (status === 'done') return '已完成';
  if (status === 'running') return '运行中';
  if (status === 'failed') return '执行失败';
  if (status === 'cancelled') return '已取消';
  return '排队中';
}

function passRateClass(passed, total) {
  if (total <= 0) return '';
  const pct = (passed / total) * 100;
  if (pct >= 80) return 'report-history-table__pass--high';
  if (pct > 0) return 'report-history-table__pass--mid';
  return 'report-history-table__pass--zero';
}

function RunTriggerCell({ row, currentUser }) {
  const triggerUser = userFromTriggerFields(row);
  if (triggerUser) {
    const chipUser = isSameCreator(triggerUser.real_name, currentUser) && currentUser
      ? currentUser
      : triggerUser;
    return <UserChip user={chipUser} size="sm" />;
  }
  if (row.plan_creator) {
    const creatorIsMe = isSameCreator(row.plan_creator, currentUser);
    return (
      <UserChip
        user={creatorIsMe ? currentUser : null}
        label={displayCreatorText(row.plan_creator, currentUser)}
        size="sm"
      />
    );
  }
  return <span className="case-repo-cell-muted">—</span>;
}

export default function ReportList() {
  const user = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get('planId');

  const [runs, setRuns] = useState([]);
  const [planName, setPlanName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const url = planId ? `${API}/runs?planId=${planId}` : `${API}/runs`;
    authFetch(url)
      .then((r) => r.json())
      .then(setRuns)
      .finally(() => setLoading(false));
  }, [planId]);

  useEffect(() => {
    if (!planId) return;
    authFetch(`${API}/plans/${planId}`)
      .then((r) => r.json())
      .then((p) => setPlanName(p.name))
      .catch(() => setPlanName(null));
  }, [planId]);

  const filteredRuns = useMemo(() => {
    let list = runs;
    if (statusFilter) list = list.filter((r) => r.status === statusFilter);
    if (keyword.trim()) {
      const k = keyword.trim().toLowerCase();
      list = list.filter((r) => (r.plan_name || '').toLowerCase().includes(k));
    }
    return list;
  }, [runs, keyword, statusFilter]);

  const summary = useMemo(() => {
    const running = runs.filter((r) => r.status === 'running').length;
    const failed = runs.filter((r) => r.status === 'failed').length;
    const doneRuns = runs.filter((r) => r.status === 'done');
    const avgPassRate = doneRuns.length
      ? Math.round(
        doneRuns.reduce((sum, r) => {
          const total = Number(r.total_cases || 0);
          const passed = Number(r.passed_count || 0);
          if (total <= 0) return sum;
          return sum + (passed / total) * 100;
        }, 0) / doneRuns.length,
      )
      : 0;
    return { running, failed, avgPassRate };
  }, [runs]);

  const totalCount = filteredRuns.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const pageRuns = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRuns.slice(start, start + PAGE_SIZE);
  }, [filteredRuns, currentPage]);

  useEffect(() => {
    setPage(1);
  }, [keyword, statusFilter, planId]);

  const isPlanFilter = !!planId;
  const hasFilters = !!keyword || !!statusFilter;
  const listTitle = isPlanFilter
    ? (planName ? `${planName} · 执行历史` : '计划执行历史')
    : '全部执行记录';

  const openRun = (runId) => navigate(`/runs/${runId}`);

  return (
    <WorkbenchLayout className="case-repo-page wb-page--fill report-history-page">
      <div className="glass-card case-repo-panel report-history-panel">
        <div className="case-repo-list-card">
          <div className="case-repo-list-card__header report-history-header">
            <div className="report-history-header__row report-history-header__row--main">
              <div className="case-repo-list-card__title-block">
                <h2 className="case-repo-list-card__title">{listTitle}</h2>
                {!loading && runs.length > 0 && (
                  <span className="case-repo-list-card__count report-history-summary">
                    共 <strong>{filteredRuns.length}</strong> 条
                    {!isPlanFilter && (
                      <>
                        <span className="report-history-summary__sep">·</span>
                        运行中 {summary.running}
                        <span className="report-history-summary__sep">·</span>
                        失败 {summary.failed}
                        <span className="report-history-summary__sep">·</span>
                        平均通过率 {summary.avgPassRate}%
                      </>
                    )}
                  </span>
                )}
              </div>
              <div className="case-repo-list-card__actions">
                {isPlanFilter ? (
                  <>
                    <Link to={`/plans/${planId}`} className="btn btn-secondary btn-sm">返回计划</Link>
                    <Link to="/reports" className="btn btn-primary btn-sm">全部历史</Link>
                  </>
                ) : (
                  <Link to="/plans" className="btn btn-primary btn-sm">去测试计划</Link>
                )}
              </div>
            </div>
            <div className="report-history-header__row report-history-header__row--filters">
              <div className="report-history-toolbar">
                <div className="case-repo-search report-history-search">
                  <span className="case-repo-search__icon" aria-hidden>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </span>
                  <input
                    type="search"
                    className="plan-detail-field case-repo-search__input"
                    placeholder="搜索计划名称"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    aria-label="搜索执行记录"
                  />
                </div>
                <select
                  className="report-history-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="状态筛选"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {hasFilters && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setKeyword(''); setStatusFilter(''); }}
                  >
                    清除
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="case-repo-list-card__body">
            {loading ? (
              <div className="case-repo-loading">加载中…</div>
            ) : runs.length === 0 ? (
              <div className="case-repo-empty case-repo-empty--compact">
                <p className="case-repo-empty__title">暂无执行记录</p>
                <p className="case-repo-empty__hint">
                  {isPlanFilter
                    ? '该计划还没有执行过，在计划详情页点击「立即执行」即可产生记录。'
                    : '在「测试计划」中执行一次即可产生执行记录。'}
                </p>
                {isPlanFilter ? (
                  <Link to={`/plans/${planId}`} className="btn btn-primary btn-sm">返回计划详情</Link>
                ) : (
                  <Link to="/plans" className="btn btn-primary btn-sm">去测试计划</Link>
                )}
              </div>
            ) : filteredRuns.length === 0 ? (
              <div className="case-repo-empty case-repo-empty--compact">
                <p className="case-repo-empty__title">未找到匹配的执行记录</p>
                <p className="case-repo-empty__hint">请调整搜索关键词或状态筛选</p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setKeyword(''); setStatusFilter(''); }}
                >
                  清除筛选
                </button>
              </div>
            ) : (
              <>
                <div className="ui-table-wrap case-repo-table-wrap case-repo-table-scroll">
                  <table className="ui-table case-repo-table report-history-table">
                    <colgroup>
                      <col className="report-history-table__col report-history-table__col--plan" />
                      <col className="report-history-table__col report-history-table__col--status" />
                      <col className="report-history-table__col report-history-table__col--pass" />
                      <col className="report-history-table__col report-history-table__col--duration" />
                      <col className="report-history-table__col report-history-table__col--trigger" />
                      <col className="report-history-table__col report-history-table__col--time" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>计划</th>
                        <th>状态</th>
                        <th>通过率</th>
                        <th>耗时</th>
                        <th>触发人</th>
                        <th>创建时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRuns.map((r) => {
                        const totalCases = r.total_cases != null ? r.total_cases : 0;
                        const passedCount = r.passed_count != null ? r.passed_count : 0;
                        const passRateText = totalCases > 0
                          ? `${passedCount}/${totalCases} (${Math.round((passedCount / totalCases) * 100)}%)`
                          : '—';

                        return (
                          <tr
                            key={r.id}
                            className="report-history-table__row"
                            tabIndex={0}
                            onClick={() => openRun(r.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openRun(r.id);
                              }
                            }}
                          >
                            <td className="report-history-table__plan">
                              <span className="report-history-table__plan-name">
                                {r.plan_name || '未命名计划'}
                              </span>
                            </td>
                            <td>
                              <StatusBadge status={statusKey(r.status)} label={statusLabel(r.status)} />
                            </td>
                            <td className={passRateClass(passedCount, totalCases)}>
                              {passRateText}
                            </td>
                            <td>{runDuration(r)}</td>
                            <td className="report-history-table__trigger">
                              <RunTriggerCell row={r} currentUser={user} />
                            </td>
                            <td className="report-history-table__time" title={formatDateTime(r.created_at)}>
                              {formatRelativeTime(r.created_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="case-repo-pagination">
                  <span className="case-repo-pagination__info">
                    第 {currentPage} / {totalPages} 页，本页 {pageRuns.length} 条
                  </span>
                  <div className="case-repo-pagination__nav">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={currentPage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      上一页
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      下一页
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </WorkbenchLayout>
  );
}
