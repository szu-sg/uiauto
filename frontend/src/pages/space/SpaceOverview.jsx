import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authFetch } from '../../authApi';
import { useToast } from '../../context/ToastContext';
import { teamRoleLabel, formatTeamSlug } from '../../utils/teamDisplay';
import { formatDateTime } from '../../utils/formatTime';
import { WorkbenchStats } from '../../components/layout/WorkbenchLayout';
import EmptyState from '../../components/ui/EmptyState';

const API = '/api';

const QUICK_LINKS = [
  { to: '/cases', label: '用例库' },
  { to: '/plans', label: '测试计划' },
  { to: '/environments', label: '执行环境' },
  { to: '/settings/space?tab=members', label: '成员管理' },
];

export default function SpaceOverview({ teamId, team, myRole, memberCount }) {
  const { showToast } = useToast();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await authFetch(`${API}/teams/${teamId}/summary`);
        const data = await r.json().catch(() => ({}));
        if (!cancelled && r.ok) setSummary(data);
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [teamId]);

  const counts = summary?.counts;
  const members = summary?.member_count ?? memberCount;
  const displayName = summary?.team?.name ?? team?.name;
  const rawSlug = summary?.team?.slug ?? team?.slug;
  const slug = formatTeamSlug(rawSlug, summary?.team?.id ?? team?.id ?? teamId);
  const role = teamRoleLabel(summary?.my_role ?? myRole);
  const createdAt = summary?.team?.created_at ?? team?.created_at;

  const copySlug = async () => {
    if (!slug) return;
    try {
      await navigator.clipboard.writeText(slug);
      showToast('已复制空间标识');
    } catch {
      showToast('复制失败');
    }
  };

  const statItems = counts ? [
    { label: '用例', value: counts.cases ?? 0, tone: 'blue' },
    { label: '计划', value: counts.plans ?? 0, tone: 'violet' },
    { label: '环境', value: counts.environments ?? 0, tone: 'cyan' },
    { label: '成员', value: members ?? '—', tone: 'green' },
  ] : [];

  const infoRows = [
    { label: '名称', value: displayName || '—' },
    { label: '我的角色', value: role },
    {
      label: '标识',
      value: slug || '—',
      slug: true,
    },
    { label: '创建时间', value: formatDateTime(createdAt) },
  ];
  if (summary?.last_run_at) {
    infoRows.push({ label: '最近计划执行', value: formatDateTime(summary.last_run_at) });
  }

  return (
    <div className="space-settings-panel space-overview">
      <h2 className="space-settings-panel__title">概览</h2>

      {loading && !counts ? (
        <EmptyState variant="loading" title="加载统计…" />
      ) : (
        <>
          {statItems.length > 0 && (
            <div className="space-overview__stats">
              <WorkbenchStats items={statItems} />
            </div>
          )}

          <section className="space-overview-card space-overview-card--wide" aria-labelledby="space-info-heading">
            <h3 id="space-info-heading" className="space-overview-card__title">空间信息</h3>
            <table className="space-info-table">
              <tbody>
                {infoRows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    <td>
                      {row.slug ? (
                        <span className="space-overview-facts__slug">
                          <code className="space-settings-facts__code">{row.value}</code>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={copySlug}>复制</button>
                        </span>
                      ) : (
                        row.value
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="space-overview-quick" aria-labelledby="space-quick-heading">
            <h3 id="space-quick-heading" className="space-overview-card__title">快捷入口</h3>
            <div className="space-overview-quick__row">
              {QUICK_LINKS.map((item) => (
                <Link key={item.to} to={item.to} className="space-overview-quick__link">
                  {item.label}
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
