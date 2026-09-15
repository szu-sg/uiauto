import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { authFetch } from '../authApi';
import { useUser } from '../context/UserContext';
import UserChip from '../components/UserChip';
import {
  caseMetadataEntry,
  caseSearchHaystack,
  formatPriorityLabel,
  getCaseRemark,
  getCaseTags,
  priorityClass,
} from '../utils/caseDisplay';
import { displayName, isSameCreator } from '../utils/userDisplay';
import { formatDateTime } from '../utils/formatTime';
import { useTeamWrite } from '../hooks/useTeamWrite';
import EmptyState from '../components/ui/EmptyState';
import WorkbenchLayout, { WorkbenchHeader } from '../components/layout/WorkbenchLayout';

const API = '/api';
const PAGE_SIZE_OPTIONS = [20, 50, 100];

function caseKey(item) {
  return `case:${item.id}`;
}

function CaseTagList({ tags }) {
  if (!tags.length) return <span className="case-repo-cell-muted">—</span>;
  return (
    <div className="case-repo-tags">
      {tags.slice(0, 4).map((tag) => (
        <span key={tag} className="case-repo-tag">{tag}</span>
      ))}
      {tags.length > 4 && <span className="case-repo-tag case-repo-tag--more">+{tags.length - 4}</span>}
    </div>
  );
}

function CaseCreatorCell({ createdBy, currentUser }) {
  if (!createdBy) return <span className="case-repo-cell-muted">—</span>;
  const chipUser = isSameCreator(displayName(createdBy), currentUser) && currentUser
    ? currentUser
    : createdBy;
  return <UserChip user={chipUser} size="sm" />;
}

export default function PlanCaseSelect() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useUser();
  const canWrite = useTeamWrite();
  const pageCheckRef = useRef(null);

  const [plan, setPlan] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      authFetch(API + '/plans/' + id).then((r) => (r.ok ? r.json() : Promise.reject(new Error('计划不存在')))),
      authFetch(API + '/cases').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([planData, catalogData]) => {
        const list = Array.isArray(catalogData) ? catalogData : [];
        setPlan(planData);
        setCatalog(list);
        const planCaseIds = Array.isArray(planData.case_ids)
          ? planData.case_ids.map(Number).filter((n) => n > 0)
          : (() => {
              try { return JSON.parse(planData.case_ids_json || '[]').map(Number).filter((n) => n > 0); } catch (_) { return []; }
            })();
        const planCases = Array.isArray(planData.cases)
          ? planData.cases
          : (() => { try { return JSON.parse(planData.cases_json || '[]'); } catch (_) { return []; } })();
        const initial = new Set();
        if (planCaseIds.length > 0) {
          for (const item of list) {
            if (planCaseIds.includes(item.id)) initial.add(caseKey(item));
          }
        }
        if (initial.size === 0 && planCases.length > 0) {
          for (const item of list) {
            if (planCases.includes(item.path) || planCases.includes(item.legacy_path)) {
              initial.add(caseKey(item));
            }
          }
        }
        setSelected(initial);
      })
      .catch((e) => setError(e.message || '加载失败'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!loading && plan && !canWrite) {
      navigate(`/plans/${id}`, { replace: true });
    }
  }, [loading, plan, canWrite, id, navigate]);

  const filtered = useMemo(() => {
    if (!keyword.trim()) return catalog;
    const k = keyword.trim().toLowerCase();
    return catalog.filter((item) => caseSearchHaystack(item).includes(k));
  }, [catalog, keyword]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageIndex = Math.min(Math.max(1, page), totalPages);
  const paginated = filtered.slice((pageIndex - 1) * pageSize, pageIndex * pageSize);
  const pageKeys = paginated.map(caseKey);
  const pageAllSelected = pageKeys.length > 0 && pageKeys.every((k) => selected.has(k));
  const pageSomeSelected = pageKeys.some((k) => selected.has(k)) && !pageAllSelected;

  useEffect(() => {
    if (pageCheckRef.current) pageCheckRef.current.indeterminate = pageSomeSelected;
  }, [pageSomeSelected, pageIndex, pageSize]);

  const toggle = (item) => {
    const key = caseKey(item);
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
    if (error) setError('');
  };

  const togglePageAll = () => {
    const next = new Set(selected);
    if (pageAllSelected) pageKeys.forEach((k) => next.delete(k));
    else pageKeys.forEach((k) => next.add(k));
    setSelected(next);
  };

  const save = () => {
    if (selected.size === 0) {
      setError('请至少选择一条用例');
      return;
    }
    const picked = catalog.filter((item) => selected.has(caseKey(item)));
    const case_ids = picked.map((item) => item.id);
    const cases = picked.map((item) => item.path);
    const case_metadata = {};
    picked.forEach((item) => {
      case_metadata[item.path] = caseMetadataEntry(item);
    });
    setError('');
    setSaving(true);
    authFetch(API + '/plans/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cases,
        case_ids,
        case_metadata,
      }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || '保存失败');
        navigate('/plans/' + id);
      })
      .catch((e) => setError(e.message || '保存失败'))
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <WorkbenchLayout className="case-repo-page plan-case-select-page wb-page--fill">
        <EmptyState variant="loading" title="加载用例" hint="正在获取计划与用例仓库数据" />
      </WorkbenchLayout>
    );
  }

  if (!plan) {
    return (
      <WorkbenchLayout className="case-repo-page plan-case-select-page wb-page--fill">
        <EmptyState
          variant="error"
          title="加载失败"
          hint={error || '计划不存在'}
          action={<Link to="/plans" className="btn btn-secondary">返回列表</Link>}
        />
      </WorkbenchLayout>
    );
  }

  return (
    <WorkbenchLayout className="case-repo-page plan-case-select-page wb-page--fill">
      <WorkbenchHeader
        title="选择测试用例"
        actions={(
          <>
            <Link to={`/plans/${id}`} className="btn btn-secondary btn-sm">返回详情</Link>
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={saving || selected.size === 0}
            >
              {saving ? '保存中…' : `确定（${selected.size} 条）`}
            </button>
          </>
        )}
      />

      {catalog.length === 0 ? (
        <EmptyState
          title="用例仓库为空"
          action={<Link to="/cases" className="btn btn-primary">前往用例仓库</Link>}
        />
      ) : (
        <div className="glass-card case-repo-panel plan-case-select-panel">
          <div className="case-repo-main">
            <div className="case-repo-list-card">
              <div className="case-repo-list-card__header">
                <div className="case-repo-list-card__top">
                  <div className="case-repo-list-card__title-block">
                    <h2 className="case-repo-list-card__title">用例库</h2>
                    <span className="case-repo-list-card__count">
                      已选 <strong>{selected.size}</strong> / {catalog.length}
                    </span>
                  </div>
                  <div className="case-repo-search">
                    <span className="case-repo-search__icon" aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                    </span>
                    <input
                      type="search"
                      className="plan-detail-field case-repo-search__input"
                      placeholder="搜索名称 / 标签 / 备注"
                      value={keyword}
                      onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
                    />
                  </div>
                  <div className="case-repo-list-card__actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())}>
                      清空选择
                    </button>
                  </div>
                </div>
              </div>

              <div className="case-repo-list-card__body">
                {filtered.length === 0 ? (
                  <div className="case-repo-empty case-repo-empty--compact">
                    <p className="case-repo-empty__title">未找到匹配的用例</p>
                  </div>
                ) : (
                  <>
                    <div className="ui-table-wrap case-repo-table-wrap case-repo-table-scroll case-repo-table-wrap--bulk">
                      <table className="ui-table case-repo-table plan-case-select-table">
                        <thead>
                          <tr>
                            <th className="case-repo-table__check">
                              <input
                                ref={pageCheckRef}
                                type="checkbox"
                                checked={pageAllSelected}
                                onChange={togglePageAll}
                                aria-label="全选当前页"
                              />
                            </th>
                            <th className="case-repo-table__name-h">名称</th>
                            <th>优先级</th>
                            <th>标签</th>
                            <th>备注</th>
                            <th>创建人</th>
                            <th>创建时间</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginated.map((item) => {
                            const key = caseKey(item);
                            const isSelected = selected.has(key);
                            const tags = getCaseTags(item);
                            return (
                              <tr
                                key={key}
                                className={isSelected ? 'case-repo-row--selected' : ''}
                                onClick={() => toggle(item)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(item); } }}
                              >
                                <td className="case-repo-table__check" onClick={(e) => e.stopPropagation()}>
                                  <input type="checkbox" checked={isSelected} onChange={() => toggle(item)} />
                                </td>
                                <td className="case-repo-table__name">{item.name || '用例'}</td>
                                <td>
                                  <span className={priorityClass(item.priority)}>
                                    {formatPriorityLabel(item.priority)}
                                  </span>
                                </td>
                                <td><CaseTagList tags={tags} /></td>
                                <td
                                  className="case-repo-table__remark"
                                  title={item.description?.trim() || ''}
                                >
                                  {getCaseRemark(item)}
                                </td>
                                <td className="case-repo-table__creator">
                                  <CaseCreatorCell createdBy={item.created_by} currentUser={user} />
                                </td>
                                <td className="case-repo-table__time" title={item.created_at || ''}>
                                  {formatDateTime(item.created_at)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="case-repo-pagination plan-case-select-pagination">
                      <div className="plan-case-select-pagination__size">
                        <span>每页</span>
                        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                          {PAGE_SIZE_OPTIONS.map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                        <span>条</span>
                      </div>
                      <span className="case-repo-pagination__info">
                        共 {filtered.length} 条，第 {pageIndex}/{totalPages} 页
                      </span>
                      <div className="case-repo-pagination__nav">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={pageIndex <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                          上一页
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={pageIndex >= totalPages}
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        >
                          下一页
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {error && <div className="plan-case-select-error" role="alert">{error}</div>}
            </div>
          </div>
        </div>
      )}
    </WorkbenchLayout>
  );
}
