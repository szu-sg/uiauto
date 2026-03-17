import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

const API = '/api';
const PAGE_SIZE_OPTIONS = [8, 12, 20, 50];
const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'done', label: '已完成' },
  { value: 'running', label: '运行中' },
  { value: 'pending', label: '排队中' },
  { value: 'failed', label: '执行失败' },
  { value: 'cancelled', label: '已取消' },
];

export default function ReportList() {
  const [searchParams] = useSearchParams();
  const planId = searchParams.get('planId');
  const [runs, setRuns] = useState([]);
  const [planName, setPlanName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [toast, setToast] = useState(null);

  const copyRunId = (e, runId) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(String(runId)).then(() => {
      setToast('已复制执行 ID');
      setTimeout(() => setToast(null), 2000);
    }).catch(() => setToast('复制失败'));
  };

  useEffect(() => {
    const url = planId ? `${API}/runs?planId=${planId}` : `${API}/runs`;
    fetch(url)
      .then((r) => r.json())
      .then(setRuns)
      .finally(() => setLoading(false));
  }, [planId]);

  useEffect(() => {
    if (!planId) return;
    fetch(API + '/plans/' + planId)
      .then((r) => r.json())
      .then((p) => setPlanName(p.name))
      .catch(() => setPlanName(null));
  }, [planId]);

  const filteredRuns = useMemo(() => {
    let list = runs;
    if (statusFilter) {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (keyword.trim()) {
      const k = keyword.trim().toLowerCase();
      list = list.filter((r) => {
        const planNameStr = (r.plan_name || '').toLowerCase();
        const idStr = String(r.id);
        return planNameStr.includes(k) || idStr.includes(k);
      });
    }
    return list;
  }, [runs, keyword, statusFilter]);

  const totalCount = filteredRuns.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageRuns = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRuns.slice(start, start + pageSize);
  }, [filteredRuns, currentPage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [keyword, statusFilter, pageSize]);

  const isPlanFilter = !!planId;
  const hasFilters = !!keyword || !!statusFilter;

  return (
    <>
      <div className="breadcrumb">
        <Link to="/reports">执行历史</Link>
        <span className="sep">/</span>
        <span>{isPlanFilter && planName ? planName : '全部'}</span>
      </div>
      <div className="page-header">
        <h1>{isPlanFilter && planName ? `${planName} - 执行历史` : '执行历史'}</h1>
        {isPlanFilter && <Link to="/reports" className="btn btn-secondary">全部执行历史</Link>}
      </div>
      <p className="page-intro">
        {isPlanFilter ? '该计划的历次执行记录，点击某次可查看测试报告。' : '各计划的历次执行记录，点击某次可进入测试报告查看详情。'}
      </p>
      {!loading && runs.length > 0 && (
        <div className="filter-bar">
          <div className="filter-bar__field">
            <label htmlFor="report-filter-keyword">关键词</label>
            <input
              id="report-filter-keyword"
              type="text"
              placeholder="计划名或执行 ID"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <div className="filter-bar__field">
            <label htmlFor="report-filter-status">状态</label>
            <select
              id="report-filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="filter-bar__actions">
            {hasFilters && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setKeyword(''); setStatusFilter(''); }}
              >
                清除筛选
              </button>
            )}
            <span className="filter-bar__summary">共 {totalCount} 条</span>
          </div>
        </div>
      )}
      {loading ? (
        <div className="empty-state">
          <div className="empty-state__icon" aria-hidden style={{ letterSpacing: '0.25em' }}>···</div>
          <p className="empty-state__title">加载中</p>
          <p className="empty-state__hint">正在获取执行历史</p>
        </div>
      ) : runs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon" aria-hidden>📋</div>
          <p className="empty-state__title">暂无执行记录</p>
          <p className="empty-state__hint">
            {isPlanFilter ? '该计划尚未执行过，在计划详情页点击「执行」即可产生执行记录与测试报告。' : '在「测试计划」中执行一次即可产生执行记录。'}
          </p>
          <Link to={isPlanFilter ? '/plans/' + planId : '/'} className="btn btn-primary">
            {isPlanFilter ? '去计划详情' : '去测试计划'}
          </Link>
        </div>
      ) : filteredRuns.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon" aria-hidden>🔍</div>
          <p className="empty-state__title">没有匹配的执行记录</p>
          <p className="empty-state__hint">试试调整关键词或状态筛选</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => { setKeyword(''); setStatusFilter(''); }}
          >
            清除筛选
          </button>
        </div>
      ) : (
        <>
        <div className="report-list-wrapper">
          {toast && <div className="plan-toast" role="status">{toast}</div>}
          <ul className="report-list">
            {pageRuns.map((r) => {
              const created = r.created_at ? new Date(r.created_at).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' }) : '—';
              let duration = '';
              if (r.started_at && r.finished_at) {
                const s = new Date(r.started_at).getTime();
                const f = new Date(r.finished_at).getTime();
                const sec = Math.round((f - s) / 1000);
                duration = sec < 60 ? `${sec} 秒` : `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`;
              }
              const casesCount = r.cases_count != null ? r.cases_count : 0;
              const statusKey = r.status === 'done' ? 'passed' : r.status === 'running' ? 'running' : r.status === 'failed' ? 'failed' : r.status === 'cancelled' ? 'cancelled' : 'pending';
              const statusLabel = r.status === 'done' ? '已完成' : r.status === 'running' ? '运行中' : r.status === 'failed' ? '执行失败' : r.status === 'cancelled' ? '已取消' : '排队中';
              const creator = r.plan_creator != null && String(r.plan_creator).trim() !== '' ? r.plan_creator : '—';
              return (
                <li key={r.id} className={`card report-card report-card--block report-card--${statusKey}`}>
                  <Link to={'/runs/' + r.id} className="report-card__link-wrap">
                    <div className="report-card__row report-card__row--head">
                      <div className="report-card__head">
                        <span className="report-card__title">{r.plan_name || `执行 #${r.id}`}</span>
                        <span
                          className="report-card__id"
                          title="点击复制"
                          onClick={(e) => copyRunId(e, r.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyRunId(e, r.id); } }}
                        >
                          ID：{r.id}
                        </span>
                      </div>
                      <span className={`badge badge-${statusKey} report-card__status`}>{statusLabel}</span>
                    </div>
                    <div className="report-card__meta">
                      <span>用例数 {casesCount}</span>
                      <span className="report-card__meta-sep" aria-hidden>·</span>
                      <span>{duration ? `执行耗时 ${duration}` : '执行耗时 —'}</span>
                      <span className="report-card__meta-sep" aria-hidden>·</span>
                      <span>创建时间 {created}</span>
                      <span className="report-card__meta-sep" aria-hidden>·</span>
                      <span>创建人 {creator}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        {totalCount > 0 && (
          <div className="pagination-bar">
            <div className="pagination-bar__size">
              <span>每页</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span>条</span>
            </div>
            <div className="pagination-bar__nav">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </button>
              <span className="pagination-bar__page-info">
                第 {currentPage} / {totalPages} 页
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
              </button>
            </div>
          </div>
        )}
        </>
      )}
    </>
  );
}
