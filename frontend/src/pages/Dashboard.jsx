import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { authFetch } from '../authApi';
import StatusBadge from '../components/ui/StatusBadge';
import QuickStartGrid from '../components/home/QuickStartGrid';
import { useCreatePlan } from '../context/CreatePlanContext';
import { formatRelativeTime } from '../utils/formatTime';

const API = '/api';

function isWithinDays(dateStr, days) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return d.getTime() >= cutoff;
}

export default function Dashboard() {
  const { openCreatePlan } = useCreatePlan();
  const [plans, setPlans] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      authFetch(API + '/plans').then((r) => r.json()),
      authFetch(API + '/runs').then((r) => r.json()),
    ])
      .then(([plansData, runsData]) => {
        setPlans(Array.isArray(plansData) ? plansData : []);
        setRuns(Array.isArray(runsData) ? runsData : []);
      })
      .catch(() => {
        setPlans([]);
        setRuns([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const doneRuns = runs.filter((r) => r.status === 'done' || r.status === 'passed').length;
    const runningRuns = runs.filter((r) => r.status === 'running' || r.status === 'pending').length;
    const recentPlans = plans.filter((p) => isWithinDays(p.created_at, 7)).length;
    return {
      plans: plans.length,
      doneRuns,
      runningRuns,
      recentPlans,
    };
  }, [plans, runs]);

  const recentRuns = useMemo(() => runs.slice(0, 5), [runs]);

  return (
    <div className="wb-page page-dashboard">
      <section className="dash-stats" aria-label="数据概览">
        <article className="glass-card glass-hover dash-stat">
          <p className="dash-stat__label">全部测试计划</p>
          <p className="dash-stat__value">{loading ? '—' : stats.plans}</p>
        </article>
        <article className="glass-card glass-hover dash-stat">
          <p className="dash-stat__label">已完成执行</p>
          <p className="dash-stat__value dash-stat__value--success">{loading ? '—' : stats.doneRuns}</p>
        </article>
        <article className="glass-card glass-hover dash-stat">
          <p className="dash-stat__label">进行中任务</p>
          <p className="dash-stat__value dash-stat__value--primary">{loading ? '—' : stats.runningRuns}</p>
        </article>
        <article className="glass-card glass-hover dash-stat">
          <p className="dash-stat__label">近7天新建计划</p>
          <p className="dash-stat__value dash-stat__value--warning">{loading ? '—' : stats.recentPlans}</p>
        </article>
      </section>

      <QuickStartGrid onNewPlan={openCreatePlan} />

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
                const caseCount = r.cases_count ?? r.total_cases ?? '—';
                return (
                  <Link
                    key={r.id}
                    to={'/runs/' + r.id}
                    className="dash-recent__row"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div className="dash-recent__left">
                      <span className="dash-recent__tag">计划</span>
                      <span className="dash-recent__name">{r.plan_name || `执行 #${r.id}`}</span>
                      <span className="dash-recent__meta">{caseCount} 条用例</span>
                    </div>
                    <div className="dash-recent__right">
                      <StatusBadge status={r.status} />
                      <span>{formatRelativeTime(r.created_at)}</span>
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
