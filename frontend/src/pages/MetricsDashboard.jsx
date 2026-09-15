import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { authFetch } from '../authApi';
import StatusBadge from '../components/ui/StatusBadge';
import WorkbenchLayout from '../components/layout/WorkbenchLayout';
import { formatRelativeTime } from '../utils/formatTime';

const API = '/api';

function formatDayLabel(dateKey) {
  const d = new Date(`${dateKey}T00:00:00+08:00`);
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getMonth() + 1}/${d.getDate()} 周${weekdays[d.getDay()]}`;
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

export default function MetricsDashboard({ embedded = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch(`${API}/metrics`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const trendMax = useMemo(() => {
    if (!data?.trend7d?.length) return 1;
    return Math.max(1, ...data.trend7d.map((d) => d.count));
  }, [data]);

  const coreCards = loading ? null : [
    { label: '测试计划', value: data?.plans ?? 0, sub: `启用 ${data?.enabledPlans ?? 0}`, tone: 'primary' },
    { label: '计划用例', value: data?.planCaseTotal ?? 0, sub: `仓库 ${data?.catalogCases ?? 0} 条`, tone: 'blue' },
    { label: '执行总数', value: data?.runs ?? 0, sub: `近7天 ${data?.runsLast7Days ?? 0} 次`, tone: 'cyan' },
    { label: '平均通过率', value: `${data?.avgPassRate ?? 0}%`, sub: `已完成 ${data?.doneRuns ?? 0} 次`, tone: 'success' },
    { label: '运行中', value: data?.runningRuns ?? 0, sub: '当前任务', tone: 'warning' },
    { label: '执行失败', value: data?.failedRuns ?? 0, sub: '累计失败', tone: 'danger' },
    { label: '录制用例', value: data?.recordedCases ?? 0, sub: '录制生成', tone: 'purple' },
    { label: '执行环境', value: data?.environments ?? 0, sub: '已配置', tone: 'muted' },
  ];

  const content = (
    <>
      {!embedded && (
        <div className="metrics-page__head">
          <h1 className="metrics-page__title">度量大盘</h1>
        </div>
      )}

      <section className="metrics-cards" aria-label="核心指标">
        {(loading ? Array.from({ length: 8 }, (_, i) => ({ key: i })) : coreCards).map((card, i) => (
          <article key={card.key ?? card.label} className={`glass-card metrics-card metrics-card--${card.tone || 'muted'}`}>
            {loading ? (
              <>
                <p className="metrics-card__label">—</p>
                <p className="metrics-card__value">—</p>
              </>
            ) : (
              <>
                <p className="metrics-card__label">{card.label}</p>
                <p className="metrics-card__value">{card.value}</p>
                <p className="metrics-card__sub">{card.sub}</p>
              </>
            )}
          </article>
        ))}
      </section>

      <div className="metrics-grid">
        <section className="glass-card metrics-panel" aria-label="近7天执行趋势">
          <div className="metrics-panel__head">
            <h2 className="metrics-panel__title">近 7 天执行趋势</h2>
          </div>
          {loading ? (
            <p className="metrics-panel__empty">加载中…</p>
          ) : (
            <div className="metrics-trend">
              {data?.trend7d?.map((item) => (
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

        <section className="glass-card metrics-panel" aria-label="计划执行排行">
          <div className="metrics-panel__head">
            <h2 className="metrics-panel__title">计划执行排行</h2>
            <Link to="/plans" className="metrics-panel__link">查看计划</Link>
          </div>
          {loading ? (
            <p className="metrics-panel__empty">加载中…</p>
          ) : !data?.topPlans?.length ? (
            <p className="metrics-panel__empty">暂无执行数据</p>
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
                {data.topPlans.map((p) => (
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

      <section className="glass-card metrics-panel metrics-panel--wide" aria-label="最近执行">
        <div className="metrics-panel__head">
          <h2 className="metrics-panel__title">最近执行</h2>
          <Link to="/reports" className="metrics-panel__link">全部历史</Link>
        </div>
        {loading ? (
          <p className="metrics-panel__empty">加载中…</p>
        ) : !data?.recentRuns?.length ? (
          <p className="metrics-panel__empty">暂无执行记录</p>
        ) : (
          <div className="metrics-recent-list">
            {data.recentRuns.map((r) => {
              const total = Number(r.totalCases || 0);
              const passed = Number(r.passedCount || 0);
              const passText = total > 0 ? `${passed}/${total}` : '—';
              return (
                <Link key={r.id} to={`/runs/${r.id}`} className="metrics-recent-row">
                  <span className="metrics-recent-row__name">{r.planName || '未命名计划'}</span>
                  <StatusBadge status={statusKey(r.status)} label={statusLabel(r.status)} />
                  <span className="metrics-recent-row__pass">{passText}</span>
                  <span className="metrics-recent-row__time">{formatRelativeTime(r.createdAt)}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );

  if (embedded) {
    return (
      <div className="metrics-page metrics-page--embedded space-settings-panel">
        <h2 className="space-settings-panel__title">度量</h2>
        {content}
      </div>
    );
  }

  return (
    <WorkbenchLayout className="metrics-page wb-page">
      {content}
    </WorkbenchLayout>
  );
}
