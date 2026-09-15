import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { authFetch } from '../authApi';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { formatTeamSlug } from '../utils/teamDisplay';
import { displayName } from '../utils/userDisplay';
import { formatDateTime } from '../utils/formatTime';
import EmptyState from '../components/ui/EmptyState';
import AdminSubnav from '../components/admin/AdminSubnav';
import WorkbenchLayout, {
  WorkbenchHeader,
  WorkbenchPanel,
  WorkbenchStats,
  WorkbenchToolbar,
} from '../components/layout/WorkbenchLayout';

const API = '/api/admin';

function filterTeams(teams, keyword) {
  const q = keyword.trim().toLowerCase();
  if (!q) return teams;
  return teams.filter((t) => {
    const hay = [t.name, t.slug, t.owner_name].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function CreateSpaceModal({
  open,
  onClose,
  onCreated,
  submitting,
  setSubmitting,
}) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [ownerQ, setOwnerQ] = useState('');
  const [ownerHits, setOwnerHits] = useState([]);
  const [ownerId, setOwnerId] = useState('');
  const [ownerPick, setOwnerPick] = useState(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setSlug('');
      setOwnerQ('');
      setOwnerHits([]);
      setOwnerId('');
      setOwnerPick(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = ownerQ.trim();
    if (q.length < 2) {
      setOwnerHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      authFetch(`${API}/users/lookup?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setOwnerHits(d.users || []))
        .catch(() => setOwnerHits([]));
    }, 300);
    return () => window.clearTimeout(t);
  }, [ownerQ, open]);

  if (!open) return null;

  const pickOwner = (id) => {
    setOwnerId(id);
    const hit = ownerHits.find((u) => u.id === Number(id));
    if (hit) setOwnerPick(hit);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !ownerId || submitting) return;
    setSubmitting(true);
    try {
      const r = await authFetch(`${API}/teams`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || undefined,
          owner_user_id: Number(ownerId),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '创建失败');
      showToast('项目空间已创建');
      onCreated();
      onClose();
    } catch (err) {
      showToast(err.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ui-modal-backdrop" role="presentation" onClick={() => !submitting && onClose()}>
      <div
        className="ui-modal admin-create-space-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-space-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ui-modal__header">
          <h2 id="create-space-title" className="ui-modal__title">新建项目空间</h2>
          <button type="button" className="ui-modal__close" onClick={onClose} aria-label="关闭">×</button>
        </header>
        <form onSubmit={submit}>
          <label className="create-plan-field">
            <span className="create-plan-field__label">空间名称</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
          </label>
          <label className="create-plan-field">
            <span className="create-plan-field__label">标识 slug（可选）</span>
            <input className="input" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="doc-qa" />
          </label>
          <label className="create-plan-field">
            <span className="create-plan-field__label">所有者（已 SSO）</span>
            <input
              className="input"
              value={ownerQ}
              onChange={(e) => { setOwnerQ(e.target.value); setOwnerPick(null); setOwnerId(''); }}
              placeholder="搜索姓名 / 邮箱"
            />
          </label>
          {ownerPick && (
            <p className="admin-create-space-modal__picked">
              已选：{displayName(ownerPick)} — {ownerPick.email || ownerPick.username}
            </p>
          )}
          {!ownerPick && ownerHits.length > 0 && (
            <select className="input" value={ownerId} onChange={(e) => pickOwner(e.target.value)}>
              <option value="">选择用户…</option>
              {ownerHits.map((u) => (
                <option key={u.id} value={u.id}>{displayName(u)} — {u.email || u.username}</option>
              ))}
            </select>
          )}
          <div className="ui-modal__actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>取消</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim() || !ownerId}>
              {submitting ? '创建中…' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminSpaces() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [teams, setTeams] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listQ, setListQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      authFetch(`${API}/teams`).then((r) => r.json()),
      authFetch(`${API}/stats`).then((r) => r.json()),
    ])
      .then(([teamsData, statsData]) => {
        setTeams(teamsData.teams || []);
        setStats(statsData?.total_users != null ? statsData : null);
      })
      .catch(() => {
        setTeams([]);
        setStats(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filteredTeams = useMemo(() => filterTeams(teams, listQ), [teams, listQ]);

  const statItems = useMemo(() => {
    if (!stats) return [];
    return [
      { label: '平台用户', value: stats.total_users, tone: 'blue' },
      { label: '已加入空间', value: stats.users_in_spaces, tone: 'cyan' },
      { label: '项目空间', value: stats.total_teams, tone: 'violet' },
    ];
  }, [stats]);

  const closeTeam = async (team) => {
    if (team.status === 'closed') return;
    const ok = await confirm({
      title: '关闭空间',
      message: `关闭后「${team.name}」成员将无法再访问该空间。`,
      confirmLabel: '关闭空间',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await authFetch(`${API}/teams/${team.id}/close`, { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '关闭失败');
      showToast('空间已关闭');
      load();
    } catch (e) {
      showToast(e.message || '关闭失败');
    }
  };

  const saveRename = async (teamId) => {
    const next = renameValue.trim();
    if (!next) return;
    setSubmitting(true);
    try {
      const r = await authFetch(`${API}/teams/${teamId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: next }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '保存失败');
      showToast('空间名称已更新');
      setRenamingId(null);
      load();
    } catch (e) {
      showToast(e.message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WorkbenchLayout className="admin-spaces-page admin-spaces-page--v2 wb-page--fill">
      <WorkbenchHeader
        title="平台管理"
        actions={(
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
              新建空间
            </button>
            <Link to="/" className="btn btn-secondary btn-sm">返回工作台</Link>
          </>
        )}
      />

      <AdminSubnav />

      {!loading && statItems.length > 0 && <WorkbenchStats items={statItems} />}

      <WorkbenchPanel
        className="admin-spaces-panel wb-panel--main"
        toolbar={!loading && teams.length > 0 ? (
          <WorkbenchToolbar
            search={(
              <input
                type="search"
                className="input"
                placeholder="搜索名称、标识、所有者…"
                value={listQ}
                onChange={(e) => setListQ(e.target.value)}
              />
            )}
            meta={`${filteredTeams.length} / ${teams.length} 个空间`}
          />
        ) : null}
      >
        {loading ? (
          <EmptyState variant="loading" title="加载中…" />
        ) : teams.length === 0 ? (
          <EmptyState
            title="尚无项目空间"
            hint="点击右上角「新建空间」创建第一个项目空间。"
            action={(
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
                新建空间
              </button>
            )}
          />
        ) : filteredTeams.length === 0 ? (
          <EmptyState
            variant="search"
            title="没有匹配的空间"
            action={(
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setListQ('')}>
                清空搜索
              </button>
            )}
          />
        ) : (
          <div className="ui-table-wrap">
            <table className="ui-table admin-spaces-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>标识</th>
                  <th>所有者</th>
                  <th className="admin-spaces-table__num">成员</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th className="admin-spaces-table__actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeams.map((t) => (
                  <tr key={t.id}>
                    <td className="admin-spaces-table__name">
                      {renamingId === t.id ? (
                        <div className="admin-spaces-rename">
                          <input
                            className="input input--sm"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            maxLength={40}
                          />
                          <button type="button" className="btn btn-primary btn-sm" disabled={submitting} onClick={() => saveRename(t.id)}>保存</button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenamingId(null)}>取消</button>
                        </div>
                      ) : (
                        <>
                          {t.name}
                          {t.status !== 'closed' && (
                            <button
                              type="button"
                              className="admin-spaces-rename-trigger"
                              onClick={() => { setRenamingId(t.id); setRenameValue(t.name); }}
                            >
                              改名
                            </button>
                          )}
                        </>
                      )}
                    </td>
                    <td><code className="space-settings-facts__code">{formatTeamSlug(t.slug, t.id)}</code></td>
                    <td>{t.owner_name || '—'}</td>
                    <td className="admin-spaces-table__num">{t.member_count}</td>
                    <td>
                      <span className={`admin-spaces-status admin-spaces-status--${t.status === 'closed' ? 'closed' : 'active'}`}>
                        {t.status === 'closed' ? '已关闭' : '运行中'}
                      </span>
                    </td>
                    <td className="admin-spaces-table__time">{formatDateTime(t.created_at)}</td>
                    <td className="admin-spaces-table__actions">
                      {t.status !== 'closed' && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => closeTeam(t)}>
                          关闭
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkbenchPanel>

      <CreateSpaceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={load}
        submitting={submitting}
        setSubmitting={setSubmitting}
      />
    </WorkbenchLayout>
  );
}
