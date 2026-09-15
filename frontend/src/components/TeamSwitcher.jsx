import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch, setToken } from '../authApi';
import { isPlatformSuperAdmin } from '../utils/teamDisplay';

const API = '/api';

export default function TeamSwitcher({ user, onTeamChange }) {
  const navigate = useNavigate();
  const teams = user?.teams || [];
  const currentId = user?.current_team_id;
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef(null);
  const isSuper = isPlatformSuperAdmin(user);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!teams.length) {
    if (isSuper) {
      return (
        <button
          type="button"
          className="team-switcher__btn"
          onClick={() => navigate('/admin/spaces')}
        >
          <span className="team-switcher__label">平台管理</span>
        </button>
      );
    }
    return null;
  }

  const current = teams.find((t) => t.id === currentId) || teams[0];

  const switchTeam = async (teamId) => {
    if (teamId === currentId || switching) return;
    setSwitching(true);
    try {
      const r = await authFetch(`${API}/teams/switch`, {
        method: 'POST',
        body: JSON.stringify({ team_id: teamId }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '切换失败');
      if (data.token) setToken(data.token);
      onTeamChange?.({
        ...user,
        current_team_id: data.current_team_id,
        teams: user.teams,
      });
      setOpen(false);
      window.location.reload();
    } catch (e) {
      window.alert(e.message || '切换团队失败');
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="team-switcher" ref={ref}>
      <button
        type="button"
        className="team-switcher__btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        disabled={switching}
      >
        <span className="team-switcher__label">{current?.name || '项目空间'}</span>
        <span className="team-switcher__caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="team-switcher__menu" role="menu">
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              className={`team-switcher__item${t.id === currentId ? ' team-switcher__item--active' : ''}`}
              onClick={() => switchTeam(t.id)}
            >
              <span>{t.name}</span>
              {t.id === currentId && <span className="team-switcher__check">✓</span>}
            </button>
          ))}
          <div className="team-switcher__sep" />
          <button
            type="button"
            className="team-switcher__footer-btn"
            onClick={() => { setOpen(false); navigate('/settings/space'); }}
          >
            空间设置
          </button>
          {isSuper && (
            <button
              type="button"
              className="team-switcher__footer-btn"
              onClick={() => { setOpen(false); navigate('/admin/spaces'); }}
            >
              平台管理
            </button>
          )}
        </div>
      )}
    </div>
  );
}
