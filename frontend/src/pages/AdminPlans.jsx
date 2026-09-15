import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { authFetch } from '../authApi';
import { formatDateTime } from '../utils/formatTime';
import EmptyState from '../components/ui/EmptyState';
import AdminSubnav from '../components/admin/AdminSubnav';
import WorkbenchLayout, { WorkbenchHeader, WorkbenchPanel, WorkbenchToolbar } from '../components/layout/WorkbenchLayout';

const API = '/api/admin';

export default function AdminPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    setLoading(true);
    authFetch(`${API}/plans`)
      .then((r) => r.json())
      .then((d) => setPlans(d.plans || []))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return plans;
    return plans.filter((p) => {
      const hay = [p.name, p.team_name].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [plans, q]);

  return (
    <WorkbenchLayout className="admin-spaces-page admin-spaces-page--v2 wb-page--fill">
      <WorkbenchHeader
        title="平台管理"
        actions={<Link to="/" className="btn btn-secondary btn-sm">返回工作台</Link>}
      />
      <AdminSubnav />
      <WorkbenchPanel
        className="admin-spaces-panel wb-panel--main"
        toolbar={!loading && plans.length > 0 ? (
          <WorkbenchToolbar
            search={(
              <input
                type="search"
                className="input"
                placeholder="搜索计划名、空间名…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            )}
            meta={`${filtered.length} / ${plans.length} 个计划`}
          />
        ) : null}
      >
        {loading ? (
          <EmptyState variant="loading" title="加载中…" />
        ) : plans.length === 0 ? (
          <EmptyState title="暂无测试计划" />
        ) : (
          <div className="ui-table-wrap">
            <table className="ui-table admin-spaces-table">
              <thead>
                <tr>
                  <th>计划名称</th>
                  <th>所属空间</th>
                  <th>状态</th>
                  <th className="admin-spaces-table__num">执行次数</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/plans/${p.id}`} className="metrics-rank-table__name">
                        {p.name}
                      </Link>
                    </td>
                    <td>{p.team_name || `团队 #${p.team_id}`}</td>
                    <td>{p.enabled ? '启用' : '停用'}</td>
                    <td className="admin-spaces-table__num">{p.run_count ?? 0}</td>
                    <td className="admin-spaces-table__time">{formatDateTime(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkbenchPanel>
    </WorkbenchLayout>
  );
}
