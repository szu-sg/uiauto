import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { authFetch } from '../authApi';
import { displayName } from '../utils/userDisplay';
import { formatDateTime } from '../utils/formatTime';
import EmptyState from '../components/ui/EmptyState';
import AdminSubnav from '../components/admin/AdminSubnav';
import WorkbenchLayout, { WorkbenchHeader, WorkbenchPanel, WorkbenchToolbar } from '../components/layout/WorkbenchLayout';

const API = '/api/admin';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    setLoading(true);
    authFetch(`${API}/users`)
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => {
      const hay = [u.real_name, u.username, u.email, u.uid].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [users, q]);

  return (
    <WorkbenchLayout className="admin-spaces-page admin-spaces-page--v2 wb-page--fill">
      <WorkbenchHeader
        title="平台管理"
        actions={<Link to="/" className="btn btn-secondary btn-sm">返回工作台</Link>}
      />
      <AdminSubnav />
      <WorkbenchPanel
        className="admin-spaces-panel wb-panel--main"
        toolbar={!loading && users.length > 0 ? (
          <WorkbenchToolbar
            search={(
              <input
                type="search"
                className="input"
                placeholder="搜索姓名、邮箱、账号…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            )}
            meta={`${filtered.length} / ${users.length} 人`}
          />
        ) : null}
      >
        {loading ? (
          <EmptyState variant="loading" title="加载中…" />
        ) : users.length === 0 ? (
          <EmptyState title="暂无用户" hint="用户完成 WPS 登录后会出现在此列表。" />
        ) : (
          <div className="ui-table-wrap">
            <table className="ui-table admin-spaces-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>邮箱 / 账号</th>
                  <th>平台角色</th>
                  <th className="admin-spaces-table__num">所在空间数</th>
                  <th>注册时间</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td>{displayName(u)}</td>
                    <td className="space-members-table__muted">{u.email || u.username || '—'}</td>
                    <td>{u.role === 'super_admin' ? '超级管理员' : '用户'}</td>
                    <td className="admin-spaces-table__num">{u.team_count ?? 0}</td>
                    <td className="admin-spaces-table__time">{formatDateTime(u.created_at)}</td>
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
