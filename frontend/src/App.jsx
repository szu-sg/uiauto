import { useState, useEffect } from 'react';
import { Routes, Route, Link, NavLink, useLocation, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import PlanNew from './pages/PlanNew';
import PlanDetail from './pages/PlanDetail';
import PlanEdit from './pages/PlanEdit';
import RunReport from './pages/RunReport';
import RunCaseReport from './pages/RunCaseReport';
import ReportList from './pages/ReportList';
import Login from './pages/Login';
import Register from './pages/Register';
import { getToken, clearToken, authFetch } from './authApi';

const API = '/api';

function ServerStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (!getToken()) return;
    const fetchStatus = () => {
      authFetch(API + '/runs/status').then((r) => (r.ok ? r.json() : { running: false })).then(setStatus).catch(() => setStatus({ running: false }));
    };
    fetchStatus();
    const t = setInterval(fetchStatus, 3000);
    return () => clearInterval(t);
  }, []);
  if (!status?.running) return null;
  return (
    <div className="server-status">
      <span className="server-status__dot" aria-hidden />
      <span className="server-status__text">
        执行中：{status.planName || '计划'} — {status.phaseLabel || status.phase || '…'}
      </span>
      <Link to={'/runs/' + status.runId} className="server-status__link">查看报告</Link>
    </div>
  );
}

function Nav({ user, onLogout }) {
  const path = useLocation().pathname;
  const planActive = path === '/' || path.startsWith('/plans');
  const reportActive = path === '/reports' || path.startsWith('/runs');
  const hasUid = user?.uid != null && String(user.uid).trim() !== '';
  const nickname = (user?.real_name || '').trim();
  const accountLabel = hasUid
    ? `${nickname || user?.username || ''} · ${String(user.uid).trim()}`.trim()
    : user?.username || '';
  const avatarTitle = accountLabel || user?.username || '';
  return (
    <nav className="app-nav">
      <Link to="/" className="brand">UIAuto</Link>
      <NavLink to="/" end className={planActive ? 'active' : ''}>测试计划</NavLink>
      <NavLink to="/reports" className={reportActive ? 'active' : ''}>执行历史</NavLink>
      <div className="app-nav__trailer">
        <ServerStatus />
        <div className="app-nav__account">
          <span className="app-nav__avatar" title={avatarTitle} aria-hidden>
            <svg className="app-nav__avatar-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </span>
          <span className="app-nav__user">{accountLabel}</span>
          <button type="button" className="btn btn-secondary app-nav__logout" onClick={onLogout}>
            退出
          </button>
        </div>
      </div>
    </nav>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined);
  const location = useLocation();
  const isAuthPage = location.pathname.startsWith('/login') || location.pathname.startsWith('/register');

  useEffect(() => {
    const t = getToken();
    if (!t) {
      setUser(null);
      return;
    }
    fetch(API + '/auth/me', { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => r.json())
      .then((d) => setUser(d.user || null))
      .catch(() => {
        clearToken();
        setUser(null);
      });
  }, []);

  const onLogout = () => {
    clearToken();
    setUser(null);
    window.location.href = '/login';
  };

  if (user === undefined) {
    return (
      <div className="loading-state loading-state--full">
        <p className="loading-state__text">加载中…</p>
      </div>
    );
  }

  if (!user && !isAuthPage) {
    return <Navigate to="/login" replace />;
  }
  if (user && isAuthPage) {
    return <Navigate to="/" replace />;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={setUser} />} />
        <Route path="/register" element={<Register onLogin={setUser} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="app-shell">
      <Nav user={user} onLogout={onLogout} />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/plans/new" element={<PlanNew />} />
          <Route path="/plans/:id" element={<PlanDetail />} />
          <Route path="/plans/:id/edit" element={<PlanEdit />} />
          <Route path="/reports" element={<ReportList />} />
          <Route path="/runs/:id" element={<RunReport />} />
          <Route path="/runs/:runId/cases/:caseId" element={<RunCaseReport />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
