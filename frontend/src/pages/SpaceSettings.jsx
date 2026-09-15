import { useEffect, useState, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { authFetch } from '../authApi';
import WorkbenchLayout, { WorkbenchPanel } from '../components/layout/WorkbenchLayout';
import { useUser } from '../context/UserContext';
import { currentTeamRole } from '../utils/teamDisplay';
import SpaceOverview from './space/SpaceOverview';
import SpaceMembers from './space/SpaceMembers';

const API = '/api';

const TABS = [
  { id: 'overview', label: '概览' },
  { id: 'members', label: '成员' },
];

export default function SpaceSettings() {
  const user = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const teamId = user?.current_team_id;
  const teamFromList = useMemo(
    () => (user?.teams || []).find((t) => t.id === teamId),
    [user?.teams, teamId],
  );

  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const myRole = team?.role ?? currentTeamRole(user) ?? teamFromList?.role ?? null;
  let tabParam = searchParams.get('tab') || 'overview';
  if (tabParam === 'general' || tabParam === 'advanced' || tabParam === 'metrics') tabParam = 'overview';
  const activeTab = TABS.some((t) => t.id === tabParam) ? tabParam : 'overview';

  useEffect(() => {
    if (!teamId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const r = await authFetch(`${API}/teams/${teamId}`);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || '无法加载空间信息');
        if (!cancelled) setTeam(data);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e.message || '加载失败');
          setTeam(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [teamId]);

  const setTab = (id) => {
    setSearchParams({ tab: id }, { replace: true });
  };

  if (!user) return null;
  if (!teamId) return <Navigate to="/" replace />;
  if (!loading && (loadError || !team)) {
    return <Navigate to="/" replace />;
  }

  const memberCount = team?.members?.length ?? teamFromList?.member_count;

  return (
    <WorkbenchLayout className="space-settings-page wb-page--fill">
      <WorkbenchPanel className="space-settings-layout">
        <nav className="space-settings-nav" aria-label="空间设置">
          <p className="space-settings-nav__title">空间设置</p>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`space-settings-nav__item${activeTab === t.id ? ' space-settings-nav__item--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="space-settings-main">
          {loading ? (
            <p className="space-settings-panel__loading">加载中…</p>
          ) : (
            <>
              {activeTab === 'overview' && (
                <SpaceOverview teamId={teamId} team={team} myRole={myRole} memberCount={memberCount} />
              )}
              {activeTab === 'members' && (
                <SpaceMembers teamId={teamId} myRole={myRole} />
              )}
            </>
          )}
        </div>
      </WorkbenchPanel>
    </WorkbenchLayout>
  );
}
