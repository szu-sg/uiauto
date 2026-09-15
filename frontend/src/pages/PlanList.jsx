import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../authApi';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { useCreatePlan } from '../context/CreatePlanContext';
import UserChip from '../components/UserChip';
import EmptyState from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/Skeleton';
import PlanTableActions from '../components/home/PlanTableActions';
import WorkbenchLayout, {
  WorkbenchPanel,
  WorkbenchToolbar,
  WorkbenchPagination,
} from '../components/layout/WorkbenchLayout';
import { displayCreatorText, isSameCreator } from '../utils/userDisplay';
import { formatDateTime, formatRelativeTime } from '../utils/formatTime';
import {
  formatPlanBrowsers,
  formatPlanEnvironment,
  formatPlanSchedule,
  parseCaseCount,
} from '../utils/planDisplay';
import { useTeamWrite } from '../hooks/useTeamWrite';
import SchedulePicker from '../components/plans/SchedulePicker';

const API = '/api';
const PAGE_SIZE_OPTIONS = [10, 20, 50];

export default function PlanList() {
  const user = useUser();
  const canWrite = useTeamWrite();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { openCreatePlan } = useCreatePlan();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [executingId, setExecutingId] = useState(null);
  const [runningPlanId, setRunningPlanId] = useState(null);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const pageCheckRef = useRef(null);

  useEffect(() => {
    authFetch(API + '/plans')
      .then((r) => r.json())
      .then(setPlans)
      .finally(() => setLoading(false));
  }, []);

  // 轮询当前执行中的任务，用于在列表中高亮对应计划行
  useEffect(() => {
    let alive = true;
    const fetchStatus = () => {
      authFetch(API + '/runs/status')
        .then((r) => (r.ok ? r.json() : { running: false }))
        .then((s) => {
          if (!alive) return;
          if (s?.running) setRunningPlanId(s.planId ?? null);
          else setRunningPlanId(null);
        })
        .catch(() => { if (alive) setRunningPlanId(null); });
    };
    fetchStatus();
    const t = setInterval(fetchStatus, 8000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const safePlans = Array.isArray(plans) ? plans : [];

  const filteredPlans = useMemo(() => {
    if (!keyword.trim()) return safePlans;
    const k = keyword.trim().toLowerCase();
    return safePlans.filter((p) => {
      if (!p || typeof p !== 'object') return false;
      const name = (p.name || '').toLowerCase();
      const creator = (p.creator || '').toLowerCase();
      const env = (p.environment_name || '').toLowerCase();
      return name.includes(k) || creator.includes(k) || env.includes(k);
    });
  }, [safePlans, keyword]);

  // 表头排序：名称 / 用例数 / 创建时间 / 定时，切换方向时自动取反
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'name' || key === 'schedule' ? 'asc' : 'desc'); }
  };

  const sortedPlans = useMemo(() => {
    const arr = [...filteredPlans];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let va; let vb;
      switch (sortKey) {
        case 'name':
          va = String(a.name || '').toLowerCase();
          vb = String(b.name || '').toLowerCase();
          return va.localeCompare(vb, 'zh-CN') * dir;
        case 'cases': {
          va = parseCaseCount(a); vb = parseCaseCount(b);
          break;
        }
        case 'schedule': {
          const av = a.schedule_cron || (a.schedule_once ? '~once' : '');
          const bv = b.schedule_cron || (b.schedule_once ? '~once' : '');
          va = String(av); vb = String(bv);
          return va.localeCompare(vb) * dir;
        }
        default: {
          va = a.created_at || ''; vb = b.created_at || '';
          return String(va).localeCompare(String(vb)) * dir;
        }
      }
      return (va - vb) * dir;
    });
    return arr;
  }, [filteredPlans, sortKey, sortDir]);

  const totalCount = sortedPlans.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const pagePlans = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedPlans.slice(start, start + pageSize);
  }, [sortedPlans, currentPage, pageSize]);

  const pageIds = useMemo(() => pagePlans.map((p) => p.id).filter(Boolean), [pagePlans]);
  const pageAllSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const selectedCount = selected.size;

  useEffect(() => {
    const el = pageCheckRef.current;
    if (!el) return;
    el.indeterminate = selectedCount > 0 && !pageAllSelected && pageIds.some((id) => selected.has(id));
  }, [selectedCount, pageAllSelected, pageIds, selected]);

  const toggleBulkSelectMode = () => {
    setBulkSelectMode((on) => {
      if (on) setSelected(new Set());
      return !on;
    });
  };

  const applyScheduleBatch = async ({ cron, once, disable }) => {
    const plan_ids = [...selected];
    if (!plan_ids.length) {
      showToast('请先选择计划');
      return;
    }
    setScheduleSaving(true);
    try {
      const body = disable
        ? { plan_ids, schedule_enabled: false, schedule_cron: null, schedule_once: false }
        : { plan_ids, schedule_enabled: true, schedule_cron: cron, schedule_once: !!once };
      const r = await authFetch(`${API}/plans/schedule/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '保存失败');
      const byId = new Map((data.updated || []).map((row) => [row.id, row]));
      setPlans((prev) => prev.map((p) => {
        const row = byId.get(p.id);
        if (!row) return p;
        return {
          ...p,
          schedule_enabled: row.schedule_enabled ? 1 : 0,
          schedule_cron: row.schedule_cron,
          schedule_once: row.schedule_once ? 1 : 0,
        };
      }));
      const failN = (data.errors || []).length;
      if (failN) showToast(`已更新 ${data.updated?.length ?? 0} 个，${failN} 个失败`, 3600);
      else showToast(disable ? `已关闭 ${plan_ids.length} 个计划的定时` : `已为 ${plan_ids.length} 个计划启用定时`);
      setScheduleModalOpen(false);
      setBulkSelectMode(false);
      setSelected(new Set());
    } catch (err) {
      showToast(err.message || '批量定时失败');
    } finally {
      setScheduleSaving(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [keyword, pageSize]);

  const startRun = async (e, planId) => {
    e.stopPropagation();
    setExecutingId(planId);
    try {
      const r = await authFetch(API + '/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: Number(planId) }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '启动失败');
      window.location.href = '/runs/' + data.id;
    } catch (err) {
      showToast(err.message || '启动失败，请先在计划详情配置执行环境', 3200);
    } finally {
      setExecutingId(null);
    }
  };

  const copyPlan = async (e, plan) => {
    e.stopPropagation();
    try {
      const r = await authFetch(`${API}/plans/${plan.id}/copy`, { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '复制失败');
      setPlans((prev) => [{
        ...plan,
        id: data.id,
        name: data.name,
        enabled: 1,
      }, ...prev]);
      showToast(`已复制为「${data.name}」`);
    } catch (err) {
      showToast(err.message || '复制失败');
    }
  };

  const deletePlan = async (e, plan) => {
    e.stopPropagation();
    const ok = await confirm({
      title: '删除测试计划',
      message: `确定删除「${plan.name}」？相关执行记录也将被删除。`,
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await authFetch(`${API}/plans/${plan.id}`, { method: 'DELETE' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '删除失败');
      setPlans((prev) => prev.filter((p) => p.id !== plan.id));
      showToast('计划已删除');
    } catch (err) {
      showToast(err.message || '删除失败');
    }
  };

  return (
    <WorkbenchLayout className="page-workbench page-workbench--plans wb-page--fill">
      {loading ? (
        <WorkbenchPanel className="wb-panel--loading">
          <TableSkeleton rows={6} cols={8} />
        </WorkbenchPanel>
      ) : safePlans.length === 0 ? (
        <EmptyState
          title="还没有测试计划"
          action={canWrite ? <button type="button" className="btn btn-primary" onClick={openCreatePlan}>新建测试计划</button> : null}
        />
      ) : filteredPlans.length === 0 ? (
        <EmptyState
          variant="search"
          title="没有匹配的计划"
          action={(
            <button type="button" className="btn btn-secondary" onClick={() => setKeyword('')}>
              清除筛选
            </button>
          )}
        />
      ) : (
        <WorkbenchPanel
          className="wb-panel--main"
          toolbar={(
            <WorkbenchToolbar
              search={(
                <input
                  id="plan-list-filter"
                  type="search"
                  className="input-soft"
                  placeholder="搜索名称、创建人、环境"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  aria-label="搜索计划"
                />
              )}
              filters={(
                <div className="wb-toolbar__actions">
                  {keyword ? (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setKeyword('')}>
                      清除
                    </button>
                  ) : null}
                  {canWrite && (
                    <>
                      <button
                        type="button"
                        className={`btn btn-secondary btn-sm${bulkSelectMode ? ' btn--active' : ''}`}
                        onClick={toggleBulkSelectMode}
                      >
                        {bulkSelectMode ? '取消批量' : '批量定时'}
                      </button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={openCreatePlan}>
                        新建测试计划
                      </button>
                    </>
                  )}
                </div>
              )}
              meta={(
                <>
                  共 <span className="text-accent">{totalCount}</span> 条
                </>
              )}
            />
          )}
          footer={totalCount > 0 && (
            <WorkbenchPagination
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={setPageSize}
              currentPage={currentPage}
              totalPages={totalPages}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
            />
          )}
        >
          <div className="wb-table-wrap plan-table-scroll">
            <table className="wb-table plan-table">
              <thead>
                <tr>
                  {bulkSelectMode && (
                    <th className="plan-table__check">
                      <input
                        ref={pageCheckRef}
                        type="checkbox"
                        checked={pageAllSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          const next = new Set(selected);
                          if (pageAllSelected) pageIds.forEach((id) => next.delete(id));
                          else pageIds.forEach((id) => next.add(id));
                          setSelected(next);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="全选当前页"
                      />
                    </th>
                  )}
                  <th className="plan-table__name-h">
                    <button
                      type="button"
                      className={`plan-sort-btn${sortKey === 'name' ? ' plan-sort-btn--active' : ''}`}
                      onClick={() => toggleSort('name')}
                      aria-label="按名称排序"
                    >
                      名称
                      <span className="plan-sort-btn__arrow" aria-hidden>{sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</span>
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className={`plan-sort-btn${sortKey === 'cases' ? ' plan-sort-btn--active' : ''}`}
                      onClick={() => toggleSort('cases')}
                      aria-label="按用例数排序"
                    >
                      用例数
                      <span className="plan-sort-btn__arrow" aria-hidden>{sortKey === 'cases' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</span>
                    </button>
                  </th>
                  <th>执行环境</th>
                  <th>执行浏览器</th>
                  <th>
                    <button
                      type="button"
                      className={`plan-sort-btn${sortKey === 'schedule' ? ' plan-sort-btn--active' : ''}`}
                      onClick={() => toggleSort('schedule')}
                      aria-label="按定时排序"
                    >
                      定时时间
                      <span className="plan-sort-btn__arrow" aria-hidden>{sortKey === 'schedule' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</span>
                    </button>
                  </th>
                  <th>创建人</th>
                  <th className="plan-table__actions-h">操作</th>
                </tr>
              </thead>
              <tbody>
                {pagePlans.map((p, idx) => {
                  if (!p || typeof p !== 'object') return null;
                  const caseCount = parseCaseCount(p);
                  const creatorIsMe = isSameCreator(p.creator, user);
                  const planEnabled = p.enabled !== 0 && p.enabled !== false;
                  const envLabel = formatPlanEnvironment(p);
                  const browserLabel = formatPlanBrowsers(p);
                  const scheduleLabel = formatPlanSchedule(p);

                  return (
                    <tr
                      key={p.id ?? `plan-${idx}`}
                      className={`wb-table__row${planEnabled ? '' : ' plan-table__row--disabled'}${runningPlanId === p.id ? ' plan-table__row--running' : ''}`}
                      tabIndex={0}
                      title={`创建于 ${formatDateTime(p.created_at)}`}
                      onClick={() => {
                        if (bulkSelectMode) {
                          const next = new Set(selected);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          setSelected(next);
                          return;
                        }
                        navigate(`/plans/${p.id}`);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/plans/${p.id}`);
                        }
                      }}
                    >
                      {bulkSelectMode && (
                        <td className="plan-table__check" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(p.id)}
                            onChange={() => {
                              const next = new Set(selected);
                              if (next.has(p.id)) next.delete(p.id);
                              else next.add(p.id);
                              setSelected(next);
                            }}
                            aria-label={`选择 ${p.name || '计划'}`}
                          />
                        </td>
                      )}
                      <td className="plan-table__name" title={p.name || ''}>
                        {runningPlanId === p.id && (
                          <span className="plan-running-dot" title="该计划正在执行中" aria-label="执行中" />
                        )}
                        {p.name}
                      </td>
                      <td className="plan-table__count">{caseCount}</td>
                      <td className="plan-table__env" title={envLabel}>{envLabel}</td>
                      <td className="plan-table__browser" title={browserLabel}>{browserLabel}</td>
                      <td className="plan-table__schedule" title={scheduleLabel}>{scheduleLabel}</td>
                      <td className="plan-table__creator">
                        {creatorIsMe ? (
                          <UserChip user={user} size="sm" />
                        ) : (
                          <UserChip label={displayCreatorText(p.creator, user)} size="sm" />
                        )}
                      </td>
                      <td className="plan-table__actions">
                        <PlanTableActions
                          readOnly={!canWrite}
                          executing={executingId === p.id}
                          enabled={planEnabled}
                          onView={(e) => {
                            e.stopPropagation();
                            navigate(`/plans/${p.id}`);
                          }}
                          onEdit={(e) => {
                            e.stopPropagation();
                            navigate(`/plans/${p.id}`);
                          }}
                          onExecute={(e) => startRun(e, p.id)}
                          onCopy={(e) => copyPlan(e, p)}
                          onDelete={(e) => deletePlan(e, p)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </WorkbenchPanel>
      )}
      {bulkSelectMode && selectedCount > 0 && (
        <div className="plan-bulk-bar glass-card" role="region" aria-label="批量操作">
          <span>已选 <strong>{selectedCount}</strong> 个计划</span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setScheduleModalOpen(true)}
          >
            设置定时
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => applyScheduleBatch({ disable: true })}
            disabled={scheduleSaving}
          >
            关闭定时
          </button>
        </div>
      )}

      {scheduleModalOpen && (
        <div
          className="ui-modal-backdrop"
          role="presentation"
          onClick={() => !scheduleSaving && setScheduleModalOpen(false)}
        >
          <div
            className="ui-modal ui-modal--schedule-batch"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-batch-schedule-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="ui-modal__header">
              <h2 id="plan-batch-schedule-title" className="ui-modal__title">
                批量设置定时（{selectedCount} 个计划）
              </h2>
              <button
                type="button"
                className="ui-modal__close"
                onClick={() => !scheduleSaving && setScheduleModalOpen(false)}
                aria-label="关闭"
              >
                ×
              </button>
            </header>
            <div className="ui-modal__body">
              <SchedulePicker
                enabled={false}
                cron=""
                once={false}
                nextRun={null}
                saving={scheduleSaving}
                onSave={({ cron, once }) => applyScheduleBatch({ cron, once })}
                onClear={() => applyScheduleBatch({ disable: true })}
              />
            </div>
          </div>
        </div>
      )}
    </WorkbenchLayout>
  );
}
