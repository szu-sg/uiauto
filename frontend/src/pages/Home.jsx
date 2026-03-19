import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { authFetch } from '../authApi';

const API = '/api';
const PAGE_SIZE_OPTIONS = [10, 20, 50];

export default function Home() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [toast, setToast] = useState(null);

  const copyPlanId = (e, planId) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(String(planId)).then(() => {
      setToast('已复制计划 id');
      setTimeout(() => setToast(null), 2000);
    }).catch(() => setToast('复制失败'));
  };

  const refreshPlans = () => {
    authFetch(API + '/plans').then((r) => r.json()).then(setPlans);
  };

  useEffect(() => {
    authFetch(API + '/plans')
      .then((r) => r.json())
      .then(setPlans)
      .finally(() => setLoading(false));
  }, []);

  const safePlans = Array.isArray(plans) ? plans : [];
  const filteredPlans = useMemo(() => {
    if (!keyword.trim()) return safePlans;
    const k = keyword.trim().toLowerCase();
    return safePlans.filter((p) => {
      if (!p || typeof p !== 'object') return false;
      const name = (p.name || '').toLowerCase();
      const creator = (p.creator || '').toLowerCase();
      const repo = `${(p.repo_owner || '')}/${(p.repo_name || '')}`.toLowerCase();
      return name.includes(k) || creator.includes(k) || repo.includes(k);
    });
  }, [safePlans, keyword]);

  const totalCount = filteredPlans.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pagePlans = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPlans.slice(start, start + pageSize);
  }, [filteredPlans, currentPage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [keyword, pageSize]);

  return (
    <>
      <div className="page-header">
        <h1>测试计划</h1>
        <Link to="/plans/new" className="btn btn-primary">新建计划</Link>
      </div>
      {safePlans.length > 0 && (
        <div className="filter-bar">
          <div className="filter-bar__field">
            <label htmlFor="home-filter-keyword">关键词</label>
            <input
              id="home-filter-keyword"
              type="text"
              placeholder="计划名、创建人或仓库"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <div className="filter-bar__actions">
            {keyword && (
              <button type="button" className="btn btn-secondary" onClick={() => setKeyword('')}>
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
          <p className="empty-state__hint">正在获取测试计划列表</p>
        </div>
      ) : safePlans.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon" aria-hidden>📋</div>
          <p className="empty-state__title">还没有测试计划</p>
          <p className="empty-state__hint">从 GitHub 拉取用例并创建计划后，即可执行并查看报告</p>
          <Link to="/plans/new" className="btn btn-primary">新建计划</Link>
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon" aria-hidden>🔍</div>
          <p className="empty-state__title">没有匹配的计划</p>
          <p className="empty-state__hint">试试调整关键词筛选</p>
          <button type="button" className="btn btn-secondary" onClick={() => setKeyword('')}>清除筛选</button>
        </div>
      ) : (
        <>
        <div className="plan-list-wrapper">
          {toast && <div className="plan-toast" role="status">{toast}</div>}
          <ul className="plan-list">
            {pagePlans.map((p, idx) => {
              if (!p || typeof p !== 'object') return null;
              let caseCount = 0;
              try {
                caseCount = JSON.parse(p.cases_json || '[]').length;
              } catch (_) {}
              const created = (() => {
                if (!p.created_at) return '—';
                const s = String(p.created_at).trim();
                const d = /^[\d-]+\s+[\d:]+$/.test(s) && !s.includes('Z') && !s.includes('+') ? new Date(s.replace(' ', 'T') + '+08:00') : new Date(s);
                return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' });
              })();
              const repoLabel = `${p.repo_owner || ''}/${p.repo_name || ''}`.trim() || '—';
              const creator = p.creator != null && String(p.creator).trim() !== '' ? p.creator : '—';
              return (
                <li key={p.id ?? `plan-${idx}`} className="card plan-card plan-card--compact">
                  <Link to={`/plans/${p.id}`} className="plan-card__link-wrap">
                    <div className="plan-card__head">
                      <span className="plan-card__title">{p.name}</span>
                      <span
                        className="plan-card__id"
                        title="点击复制"
                        onClick={(e) => copyPlanId(e, p.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyPlanId(e, p.id); } }}
                      >
                        ID：{p.id}
                      </span>
                    </div>
                    <div className="plan-card__meta">
                      <span title={repoLabel}>仓库 {repoLabel}</span>
                      <span className="plan-card__meta-sep" aria-hidden>·</span>
                      <span>用例：{caseCount} 条</span>
                      <span className="plan-card__meta-sep" aria-hidden>·</span>
                      <span>创建时间 {created}</span>
                      <span className="plan-card__meta-sep" aria-hidden>·</span>
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
