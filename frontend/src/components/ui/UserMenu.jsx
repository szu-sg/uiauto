import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UserAvatar from '../UserAvatar';
import { displayName } from '../../utils/userDisplay';

export default function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!user) return null;

  return (
    <div className="ui-user-menu" ref={ref}>
      <button
        type="button"
        className="ui-user-menu__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <UserAvatar user={user} size="sm" />
        <span className="ui-user-menu__name">{displayName(user)}</span>
        <span className="ui-user-menu__chev" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="ui-user-menu__panel" role="menu">
          <div className="ui-user-menu__head">
            <UserAvatar user={user} size="md" />
            <div>
              <div className="ui-user-menu__head-name">{displayName(user)}</div>
              {user.email && <div className="ui-user-menu__head-email">{user.email}</div>}
            </div>
          </div>
          <button type="button" className="ui-user-menu__item" role="menuitem" onClick={() => { setOpen(false); navigate('/plans'); }}>
            测试计划
          </button>
          <button type="button" className="ui-user-menu__item" role="menuitem" onClick={() => { setOpen(false); navigate('/reports'); }}>
            执行记录
          </button>
          <button type="button" className="ui-user-menu__item" role="menuitem" onClick={() => { setOpen(false); navigate('/environments'); }}>
            执行环境
          </button>
          <div className="ui-user-menu__sep" />
          <button type="button" className="ui-user-menu__item ui-user-menu__item--danger" role="menuitem" onClick={() => { setOpen(false); onLogout?.(); }}>
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
