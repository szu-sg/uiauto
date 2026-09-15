import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../authApi';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import UserChip from '../../components/UserChip';
import AddMemberModal from '../../components/space/AddMemberModal';
import { displayName } from '../../utils/userDisplay';
import { formatDateTime } from '../../utils/formatTime';
import MemberRolePicker from '../../components/space/MemberRolePicker';
import {
  canManageTeamMembers,
  canInviteTeamMembers,
  teamRoleLabel,
} from '../../utils/teamDisplay';

const API = '/api';

export default function SpaceMembers({ teamId, myRole }) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const canManage = canManageTeamMembers(myRole);
  const canInvite = canInviteTeamMembers(myRole);
  const [members, setMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await authFetch(`${API}/teams/${teamId}/members`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '加载成员失败');
      setMembers(data.members || []);
      setPendingInvites(data.pending_invites || []);
    } catch (e) {
      setError(e.message || '加载成员失败');
      setMembers([]);
      setPendingInvites([]);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const inviteFromModal = async ({ email, role }) => {
    setSubmitting(true);
    try {
      const r = await authFetch(`${API}/teams/${teamId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '添加失败');
      showToast(data.pending ? '已发送邀请，对方登录后将自动加入' : '已添加成员');
      setModalOpen(false);
      await loadMembers();
    } catch (err) {
      showToast(err.message || '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  const changeRole = async (userId, role) => {
    if (!canManage || submitting) return;
    setSubmitting(true);
    try {
      const r = await authFetch(`${API}/teams/${teamId}/members/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '更新角色失败');
      showToast('角色已更新');
      await loadMembers();
    } catch (err) {
      showToast(err.message || '更新角色失败');
      await loadMembers();
    } finally {
      setSubmitting(false);
    }
  };

  const removeMember = async (userId, name) => {
    if (!canManage || submitting) return;
    const ok = await confirm?.({
      title: '移除成员',
      message: `确定将「${name}」移出当前空间？`,
      confirmLabel: '移除',
      danger: true,
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const r = await authFetch(`${API}/teams/${teamId}/members/${userId}`, {
        method: 'DELETE',
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '移除失败');
      showToast('已移除成员');
      await loadMembers();
    } catch (err) {
      showToast(err.message || '移除失败');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelInvite = async (inviteId, email) => {
    if (!canManage || submitting) return;
    const ok = await confirm?.({
      title: '取消邀请',
      message: `取消对 ${email} 的待加入邀请？`,
      confirmLabel: '取消邀请',
      danger: true,
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const r = await authFetch(`${API}/teams/${teamId}/invites/${inviteId}`, {
        method: 'DELETE',
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '操作失败');
      showToast('已取消邀请');
      await loadMembers();
    } catch (err) {
      showToast(err.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const totalCount = members.length + pendingInvites.length;

  return (
    <div className="space-settings-panel space-members-page">
      <div className="space-settings-panel__head space-members-page__head">
        <div>
          <h2 className="space-settings-panel__title">成员</h2>
          {!loading && (
            <span className="space-settings-panel__meta">
              {members.length} 人已加入
              {pendingInvites.length > 0 ? ` · ${pendingInvites.length} 人待加入` : ''}
            </span>
          )}
        </div>
        {canInvite && !loading && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setModalOpen(true)}
          >
            添加成员
          </button>
        )}
      </div>

      {loading && <p className="space-settings-panel__loading">加载中…</p>}
      {error && !loading && (
        <div className="space-settings-panel__error">
          <p>{error}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={loadMembers}>
            重试
          </button>
        </div>
      )}

      {!loading && !error && totalCount === 0 && (
        <p className="space-settings-panel__hint">暂无成员，请添加成员后协作。</p>
      )}

      {!loading && !error && (members.length > 0 || pendingInvites.length > 0) && (
        <div className="ui-table-wrap space-members-table-wrap">
          <table className="ui-table space-members-table">
            <thead>
              <tr>
                <th>成员</th>
                <th>邮箱</th>
                <th>角色</th>
                <th>状态</th>
                <th>时间</th>
                {canManage && <th className="space-members-table__actions">操作</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const name = displayName(m);
                const roleEditable = canManage && m.role !== 'owner';
                return (
                  <tr key={`m-${m.user_id}`}>
                    <td>
                      <UserChip user={m} showSubtitle={false} size="sm" />
                    </td>
                    <td className="space-members-table__muted">{m.email || m.username || '—'}</td>
                    <td>
                      <MemberRolePicker
                        role={m.role}
                        editable={roleEditable}
                        disabled={submitting}
                        onChange={(r) => changeRole(m.user_id, r)}
                      />
                    </td>
                    <td><span className="space-member-status space-member-status--active">已加入</span></td>
                    <td className="space-members-table__muted" title={m.joined_at || ''}>
                      {formatDateTime(m.joined_at)}
                    </td>
                    {canManage && (
                      <td className="space-members-table__actions">
                        {m.role === 'owner' ? (
                          <span className="space-members-table__muted" title="至少保留一名所有者">
                            —
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={submitting}
                            onClick={() => removeMember(m.user_id, name)}
                          >
                            移除
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {pendingInvites.map((inv) => (
                <tr key={`i-${inv.id}`} className="space-members-table__pending">
                  <td>{inv.real_name || '—'}</td>
                  <td className="space-members-table__muted">{inv.email}</td>
                  <td>{teamRoleLabel(inv.role)}</td>
                  <td><span className="space-member-status space-member-status--pending">待登录加入</span></td>
                  <td className="space-members-table__muted">{formatDateTime(inv.created_at)}</td>
                  {canManage && (
                    <td className="space-members-table__actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={submitting}
                        onClick={() => cancelInvite(inv.id, inv.email)}
                      >
                        取消
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddMemberModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={inviteFromModal}
        submitting={submitting}
      />
    </div>
  );
}
