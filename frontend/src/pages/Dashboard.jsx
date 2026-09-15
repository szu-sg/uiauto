import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { authFetch } from '../authApi';
import StatusBadge from '../components/ui/StatusBadge';
import PassRateRing from '../components/ui/PassRateRing';
import QuickStartGrid from '../components/home/QuickStartGrid';
import { useCreatePlan } from '../context/CreatePlanContext';
import { formatRelativeTime } from '../utils/formatTime';

const API = '/api';

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

function formatDayLabel(dateKey) {
  const d = new Date(`${dateKey}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getMonth() + 1}/${d.getDate()} 周${weekdays[d.getDay()]}`;
}

export default function Dashboard() {
  const { openCreatePlan } = useCreatePlan();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      authFetch(API + '/metrics').then((r) => (r.ok ? r.json() : null)),
      authFetch(API + '/plans').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([metrics, plans]) => {
        setData({ metrics, plans: Array.isArray(plans) ? plans : [] });
      })
      .catch(() => setData({ metrics: null, plans: [] }))
      .finally(() => setLoading(false));
  }, []);

  const trendMax = useMemo(() => {
    const arr = data?.metrics?.trend7d || [];
    return Math.max(1, ...arr.map((d) => d.count));
  }, [data]);

  const recentRuns = data?.metrics?.recentRuns || [];
  const topPlans = data?.metrics?.topPlans || [];
  const stats = data?.metrics || {};

  return (
    <div className="wb-page page-dashboard">
      <section className="dash-stats" aria-label="数据概览">
        <article className="glass-card glass-hover dash-stat dash-stat--ring">
          <p className="dash-stat__label">平均通过率</p>
          <div className="dash-stat__ring-row">
            {loading ? <p className="dash-stat__ring-loading">—</p> : (
              <>
                <PassRateRing rate={stats.avgPassRate ?? 0} />
                <div className="dash-stat__ring-sub">
                  <span>已完成 {stats.doneRuns ?? 0} 次</span>
                  <span className="dash-stat__ring-sub--muted">执行失败 {stats.failedRuns ?? 0} 次</span>
                </div>
              </>
            )}
          </div>
        </article>
        <article className="glass-card glass-hover dash-stat">
          <p className="dash-stat__label">全部测试计划</p>
          <p className="dash-stat__value">{loading ? '—' : stats.plans ?? 0}</p>
          <p className="dash-stat__hint">
            启用 {(stats.enabledPlans ?? 0)} · 用例 {(stats.planCaseTotal ?? 0)} 条
          </p>
        </article>
        <article className="glass-card glass-hover dash-stat">
          <p className="dash-stat__label">执行总数</p>
          <p className="dash-stat__value dash-stat__value--primary">{loading ? '—' : stats.runs ?? 0}</p>
          <p className="dash-stat__hint">近7天 {(stats.runsLast7Days ?? 0)} 次</p>
        </article>
        <article className="glass-card glass-hover dash-stat">
          <p className="dash-stat__label">进行中任务</p>
          <p className="dash-stat__value dash-stat__value--warning">{loading ? '—' : stats.runningRuns ?? 0}</p>
          <p className="dash-stat__hint">
            录制用例 {(stats.recordedCases ?? 0)} · 环境 {(stats.environments ?? 0)}
          </p>
        </article>
      </section>

      <QuickStartGrid onNewPlan={openCreatePlan} />

      <div className="dash-grid">
        <section aria-label="近7天执行趋势" className="glass-card dash-panel">
          <div className="dash-section-head">
            <h2 className="dash-section-title">近 7 天执行趋势</h2>
          </div>
          {loading ? (
            <p className="dash-recent__meta">加载中…</p>
          ) : !stats.trend7d?.length ? (
            <p className="dash-recent__meta">暂无执行数据，创建计划后即可开始运行</p>
          ) : (
            <div className="metrics-trend" style={{ height: 150 }}>
              {stats.trend7d.map((item) => (
                <div key={item.date} className="metrics-trend__item">
                  <div className="metrics-trend__bar-wrap" title={`${item.count} 次`}>
                    <div
                      className="metrics-trend__bar"
                      style={{ height: `${Math.max(8, (item.count / trendMax) * 100)}%` }}
                    />
                  </div>
                  <span className="metrics-trend__count">{item.count}</span>
                  <span className="metrics-trend__label">{formatDayLabel(item.date)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-label="计划执行排行" className="glass-card dash-panel">
          <div className="dash-section-head">
            <h2 className="dash-section-title">计划执行排行</h2>
            <Link to="/plans">查看计划</Link>
          </div>
          {loading ? (
            <p className="dash-recent__meta">加载中…</p>
          ) : !topPlans.length ? (
            <p className="dash-recent__meta">暂无执行数据</p>
          ) : (
            <table className="metrics-rank-table">
              <thead>
                <tr>
                  <th>计划</th>
                  <th>执行次数</th>
                  <th>已完成</th>
                  <th>失败</th>
                </tr>
              </thead>
              <tbody>
                {topPlans.map((p) => (
                  <tr key={p.planId}>
                    <td>
                      <Link to={`/plans/${p.planId}`} className="metrics-rank-table__name">
                        {p.planName}
                      </Link>
                    </td>
                    <td>{p.total}</td>
                    <td className="metrics-rank-table__ok">{p.done}</td>
                    <td className="metrics-rank-table__fail">{p.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section aria-label="最近执行任务">
        <div className="dash-section-head">
          <h2 className="dash-section-title" style={{ margin: 0 }}>最近执行任务</h2>
          <Link to="/reports">查看全部</Link>
        </div>
        <div className="glass-card glass-hover dash-recent">
          {loading ? (
            <p className="dash-recent__meta">加载中…</p>
          ) : recentRuns.length === 0 ? (
            <p className="dash-recent__meta">暂无执行记录，创建计划后即可开始运行</p>
          ) : (
            <div className="dash-recent__list">
              {recentRuns.map((r) => {
                const total = Number(r.totalCases || 0);
                const passed = Number(r.passedCount || 0);
                const passText = total > 0 ? `${passed}/${total}` : '—';
                return (
                  <Link
                    key={r.id}
                    to={'/runs/' + r.id}
                    className="dash-recent__row"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div className="dash-recent__left">
                      <span className="dash-recent__tag">计划</span>
                      <span className="dash-recent__name">{r.planName || `执行 #${r.id}`}</span>
                      <span className="dash-recent__meta">{passText} 条用例</span>
                    </div>
                    <div className="dash-recent__right">
                      <StatusBadge status={statusKey(r.status)} label={statusLabel(r.status)} />
                      <span>{formatRelativeTime(r.createdAt)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
