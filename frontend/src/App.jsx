import { useState, useEffect } from 'react';

import { Routes, Route, Link, NavLink, useLocation, useSearchParams, Navigate } from 'react-router-dom';

import Dashboard from './pages/Dashboard';

import PlanList from './pages/PlanList';

import PlanNewRoute from './pages/PlanNewRoute';

import CaseRepository from './pages/CaseRepository';

import CaseRecord from './pages/CaseRecord';

import CaseRecordedEdit from './pages/CaseRecordedEdit';

import RecordedRunList from './pages/RecordedRunList';

import ExtensionDownload from './pages/ExtensionDownload';

import LocalRunnerSetup from './pages/LocalRunnerSetup';

import PlanCaseSelect from './pages/PlanCaseSelect';

import PlanDetail from './pages/PlanDetail';

import PlanEdit from './pages/PlanEdit';

import RunReport from './pages/RunReport';

import RunCaseReport from './pages/RunCaseReport';

import ReportList from './pages/ReportList';

import MetricsDashboard from './pages/MetricsDashboard';

import Environments from './pages/Environments';

import SpaceSettings from './pages/SpaceSettings';

import RequireTeamWrite from './components/auth/RequireTeamWrite';
import RequireSuperAdmin from './components/auth/RequireSuperAdmin';
import TeamMembershipGate from './components/auth/TeamMembershipGate';
import AdminSpaces from './pages/AdminSpaces';
import AdminUsers from './pages/AdminUsers';
import AdminPlans from './pages/AdminPlans';

import { CreatePlanProvider } from './context/CreatePlanContext';

import { useUser } from './context/UserContext';

import { canWriteTeamResources, isPlatformSuperAdmin } from './utils/teamDisplay';

import Login from './pages/Login';

import OAuthCallback from './pages/OAuthCallback';

import UserMenu from './components/ui/UserMenu';
import TeamSwitcher from './components/TeamSwitcher';

import { UserProvider } from './context/UserContext';

import { getToken, clearToken, authFetch, AUTH_DISABLED } from './authApi';



const API = '/api';



function GlobalExecBar() {

  const [status, setStatus] = useState(null);

  useEffect(() => {

    if (!getToken() && !AUTH_DISABLED) return;

    const fetchStatus = () => {

      authFetch(API + '/runs/status')

        .then((r) => (r.ok ? r.json() : { running: false }))

        .then(setStatus)

        .catch(() => setStatus({ running: false }));

    };

    fetchStatus();

    const t = setInterval(fetchStatus, 3000);

    return () => clearInterval(t);

  }, []);

  if (!status?.running) return null;

  return (

    <div className="global-exec-bar" role="status">

      <span className="global-exec-bar__dot" aria-hidden />

      <span>

        执行中：{status.planName || '计划'} — {status.phaseLabel || status.phase || '…'}

      </span>

      <Link to={'/runs/' + status.runId} className="global-exec-bar__link">查看报告</Link>

    </div>

  );

}

function AppBreadcrumb() {
  const { pathname, search } = useLocation();

  if (pathname === '/') {
    return (
      <nav className="app-topbar__breadcrumb" aria-label="当前位置">
        <span className="app-topbar__workspace">仪表盘 · 自动化工作台</span>
      </nav>
    );
  }

  if (pathname === '/plans') {
    return (
      <nav className="app-topbar__breadcrumb" aria-label="当前位置">
        <span className="app-topbar__workspace">测试计划 · 计划列表</span>
      </nav>
    );
  }

  if (pathname === '/reports') {
    return (
      <nav className="app-topbar__breadcrumb" aria-label="当前位置">
        <span className="app-topbar__workspace">执行历史</span>
      </nav>
    );
  }

  if (pathname === '/metrics') {
    return (
      <nav className="app-topbar__breadcrumb" aria-label="当前位置">
        <span className="app-topbar__workspace">度量大盘</span>
      </nav>
    );
  }

  if (pathname === '/environments') {
    return (
      <nav className="app-topbar__breadcrumb" aria-label="当前位置">
        <span className="app-topbar__workspace">执行环境</span>
      </nav>
    );
  }

  if (pathname === '/cases') {
    return (
      <nav className="app-topbar__breadcrumb" aria-label="当前位置">
        <span className="app-topbar__breadcrumb-current">用例仓库</span>
      </nav>
    );
  }

  if (pathname === '/record') {
    return (
      <nav className="app-topbar__breadcrumb" aria-label="当前位置">
        <span className="app-topbar__breadcrumb-current">用例录制</span>
      </nav>
    );
  }

  if (pathname === '/extension') {
    return (
      <nav className="app-topbar__breadcrumb" aria-label="当前位置">
        <Link to="/record">用例录制</Link>
        <span className="sep">/</span>
        <span className="app-topbar__breadcrumb-current">安装插件</span>
      </nav>
    );
  }

  if (pathname === '/local-runner') {
    return (
      <nav className="app-topbar__breadcrumb" aria-label="当前位置">
        <Link to="/record">用例录制</Link>
        <span className="sep">/</span>
        <span className="app-topbar__breadcrumb-current">本机运行器</span>
      </nav>
    );
  }

  if (/^\/plans\/\d+\/cases$/.test(pathname)) {
    return (
      <nav className="app-topbar__breadcrumb" aria-label="当前位置">
        <Link to="/plans">测试计划</Link>
        <span className="sep">/</span>
        <Link to={pathname.replace(/\/cases$/, '')}>计划详情</Link>
        <span className="sep">/</span>
        <span className="app-topbar__breadcrumb-current">选择用例</span>
      </nav>
    );
  }

  if (pathname === '/plans/new') {
    const planId = new URLSearchParams(search).get('planId');
    return (
      <nav className="app-topbar__breadcrumb" aria-label="当前位置">
        <Link to="/plans">测试计划</Link>
        <span className="sep">/</span>
        {planId ? (
          <>
            <Link to={`/plans/${planId}`}>计划详情</Link>
            <span className="sep">/</span>
            <span className="app-topbar__breadcrumb-current">配置用例</span>
          </>
        ) : (
          <span className="app-topbar__breadcrumb-current">新建计划</span>
        )}
      </nav>
    );
  }

  if (/^\/plans\/\d+\/edit$/.test(pathname)) {
    return (
      <nav className="app-topbar__breadcrumb" aria-label="当前位置">
        <Link to="/plans">测试计划</Link>
        <span className="sep">/</span>
        <span className="app-topbar__breadcrumb-current">编辑计划</span>
      </nav>
    );
  }

  if (/^\/plans\/\d+$/.test(pathname)) {
    return (
      <nav className="app-topbar__breadcrumb" aria-label="当前位置">
        <Link to="/plans">测试计划</Link>
        <span className="sep">/</span>
        <span className="app-topbar__breadcrumb-current">计划详情</span>
      </nav>
    );
  }

  if (/^\/runs\/\d+$/.test(pathname)) {
    return (
      <nav className="app-topbar__breadcrumb" aria-label="当前位置">
        <Link to="/reports">执行历史</Link>
        <span className="sep">/</span>
        <span className="app-topbar__breadcrumb-current">测试报告</span>
      </nav>
    );
  }

  if (/^\/runs\/\d+\/cases\//.test(pathname)) {
    return (
      <nav className="app-topbar__breadcrumb" aria-label="当前位置">
        <Link to="/reports">执行历史</Link>
        <span className="sep">/</span>
        <span className="app-topbar__breadcrumb-current">用例详情</span>
      </nav>
    );
  }

  return (
    <nav className="app-topbar__breadcrumb" aria-label="当前位置">
      <span className="app-topbar__breadcrumb-current">UIAuto</span>
    </nav>
  );
}

const IconBrand = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
    <path d="M10 8.5v7l5.5-3.5L10 8.5z" fill="currentColor" />
  </svg>
);

const IconHome = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M2 6.5L8 2l6 4.5V13a1 1 0 01-1 1H3a1 1 0 01-1-1V6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M6 14V9h4v5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

const IconPlan = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M5 5h6M5 8h4M5 11h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const IconReport = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M3 12V4a1 1 0 011-1h5l3 3v6a1 1 0 01-1 1H4a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M9 3v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M5 9h4M5 11h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const IconRecord = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="8" cy="8" r="2.2" fill="currentColor" />
  </svg>
);

const IconEnv = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="1" y="4" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.4"/>
    <circle cx="8" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.4"/>
  </svg>
);

const IconRepo = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path
      d="M8 1.5c-3.6 0-6.5 2.8-6.5 6.3 0 2.8 1.8 5.1 4.3 6 .3.1.5-.1.5-.4V12c-1.7.4-2.1-1-2.1-1-.3-.7-.7-.9-1.4-.9-.9.1-.9.9-.9 1.4 0 .9 1.3 1.1 1.6.9.1-.5.3-.8.5-1-1.4-.2-2.8-.8-2.8-3.5 0-.7.3-1.3.7-1.7-.1-.3-.4-1 .1-2.1 0 0 .6-.2 2 .8.6-.2 1.2-.3 1.9-.3s1.3.1 1.9.3c1.4-1 2-.8 2-.8.5 1.1.2 1.8.1 2.1.5.4.8 1 .8 1.7 0 2.7-1.6 3.3-2.8 3.5.3.3.5.7.5 1.2v1.8c0 .3.2.5.5.4 2.5-.9 4.3-3.2 4.3-6 0-3.5-2.9-6.3-6.5-6.3z"
      fill="currentColor"
    />
  </svg>
);

const IconMetrics = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M2 13V8M6 13V5M10 13V3M14 13V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

function AppSidebar() {
  const user = useUser();
  const canWrite = canWriteTeamResources(user);
  const isSuper = isPlatformSuperAdmin(user);
  const path = useLocation().pathname;
  const dashActive = path === '/';
  const planActive = path === '/plans' || /^\/plans\/\d+/.test(path);
  const recordActive = path === '/record';
  const casesActive = path === '/cases';
  const reportActive = path === '/reports' || path.startsWith('/runs');
  const envActive = path === '/environments';
  const metricsActive = path === '/metrics';

  return (
    <aside className="app-sidebar glass-card">
      <Link to="/" className="app-sidebar__brand">
        <span className="app-sidebar__brand-icon"><IconBrand /></span>
        UIAuto
      </Link>
      <nav className="app-sidebar__nav" aria-label="主导航">
        <NavLink to="/" end className={'app-sidebar__navlink' + (dashActive ? ' active' : '')}>
          <span className="app-sidebar__navicon"><IconHome /></span>
          <span>仪表盘</span>
        </NavLink>
        <NavLink to="/plans" className={'app-sidebar__navlink' + (planActive ? ' active' : '')}>
          <span className="app-sidebar__navicon"><IconPlan /></span>
          <span>测试计划</span>
        </NavLink>
        {canWrite && (
          <NavLink to="/record" className={'app-sidebar__navlink' + (recordActive ? ' active' : '')}>
            <span className="app-sidebar__navicon"><IconRecord /></span>
            <span>用例录制</span>
          </NavLink>
        )}
        <NavLink to="/cases" className={'app-sidebar__navlink' + (casesActive ? ' active' : '')}>
          <span className="app-sidebar__navicon"><IconRepo /></span>
          <span>用例仓库</span>
        </NavLink>
        <NavLink to="/reports" className={'app-sidebar__navlink' + (reportActive ? ' active' : '')}>
          <span className="app-sidebar__navicon"><IconReport /></span>
          <span>执行历史</span>
        </NavLink>
        <NavLink to="/metrics" className={'app-sidebar__navlink' + (metricsActive ? ' active' : '')}>
          <span className="app-sidebar__navicon"><IconMetrics /></span>
          <span>度量大盘</span>
        </NavLink>
        <NavLink to="/environments" className={'app-sidebar__navlink' + (envActive ? ' active' : '')}>
          <span className="app-sidebar__navicon"><IconEnv /></span>
          <span>执行环境</span>
        </NavLink>
      </nav>
      <nav className="app-sidebar__nav app-sidebar__nav--bottom" aria-label="管理">
        {isSuper && (
          <NavLink to="/admin/spaces" className={'app-sidebar__navlink' + (path.startsWith('/admin') ? ' active' : '')}>
            <span className="app-sidebar__navicon"><IconEnv /></span>
            <span>平台管理</span>
          </NavLink>
        )}
      </nav>
      <div className="app-sidebar__footer">Playwright UI自动化 v1.0</div>
    </aside>
  );
}

function AppTopbar({ user, onLogout, onTeamChange }) {
  const showRole = user?.role && user.role !== 'member';

  return (
    <header className="app-topbar glass-card">
      <AppBreadcrumb />
      <div className="app-topbar__actions">
        <TeamSwitcher user={user} onTeamChange={onTeamChange} />
        {showRole && (
          <span className={`app-nav__role app-nav__role--${user.role}`}>{user.role_label}</span>
        )}
        <UserMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}



const DEV_USER_FALLBACK = {
  username: 'local-dev@wps.cn',
  real_name: '本地测试',
  role: 'member',
  role_label: '成员',
};

export default function App() {

  const [user, setUser] = useState(undefined);

  const location = useLocation();
  const [searchParams] = useSearchParams();

  const isAuthPage = location.pathname.startsWith('/login');
  const oauthPending = searchParams.get('code') || searchParams.get('error');



  useEffect(() => {
    if (AUTH_DISABLED) {
      fetch(API + '/auth/me')
        .then((r) => r.json())
        .then((d) => setUser(d.user ? {
          ...d.user,
          current_team_id: d.current_team_id ?? d.user.current_team_id,
          current_team_role: d.current_team_role ?? d.user.current_team_role,
        } : DEV_USER_FALLBACK))
        .catch(() => setUser(DEV_USER_FALLBACK));
      return;
    }

    const t = getToken();

    if (!t) {

      setUser(null);

      return;

    }

    fetch(API + '/auth/me', { headers: { Authorization: `Bearer ${t}` } })

      .then((r) => r.json())

      .then((d) => setUser(d.user ? {
        ...d.user,
        current_team_id: d.current_team_id ?? d.user?.current_team_id,
        current_team_role: d.current_team_role ?? d.user?.current_team_role,
      } : null))

      .catch(() => {

        clearToken();

        setUser(null);

      });

  }, []);



  const onLogout = async () => {
    if (AUTH_DISABLED) {
      window.location.href = '/';
      return;
    }
    const t = getToken();
    if (t) {
      try {
        await fetch(`${API}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${t}` },
        });
      } catch (_) {}
    }
    clearToken();
    setUser(null);
    window.location.href = '/login';
  };



  if (user === undefined) {

    return (

      <div className="loading-state loading-state--full">

        <div className="ui-spinner" aria-hidden />

        <p className="loading-state__text">加载中…</p>

      </div>

    );

  }



  if (!user && !isAuthPage && !AUTH_DISABLED) {

    const search = location.search || '';

    if (oauthPending) {
      return <OAuthCallback onLogin={setUser} redirectTo="/" />;
    }

    return <Navigate to={`/login${search}`} replace />;

  }

  if (user && isAuthPage && !AUTH_DISABLED) {

    return <Navigate to="/" replace />;

  }



  if (!user && !AUTH_DISABLED) {

    return (

      <Routes>

        <Route path="/login" element={<Login onLogin={setUser} />} />

        <Route path="/register" element={<Navigate to="/login" replace />} />

        <Route path="*" element={<Navigate to="/login" replace />} />

      </Routes>

    );

  }



  return (

    <UserProvider user={user} onUserChange={setUser}>

      <CreatePlanProvider>

      <div className="app-shell app-shell--sidebar">

        <AppSidebar />

        <div className="app-main-wrap">
          <AppTopbar user={user} onLogout={onLogout} onTeamChange={setUser} />

          <GlobalExecBar />

          <main className="app-main">
            <div className="app-main__content">
            <TeamMembershipGate>
            <Routes>

              <Route path="/" element={<Dashboard />} />

              <Route path="/metrics" element={<MetricsDashboard />} />

              <Route path="/admin/users" element={<RequireSuperAdmin><AdminUsers /></RequireSuperAdmin>} />
              <Route path="/admin/plans" element={<RequireSuperAdmin><AdminPlans /></RequireSuperAdmin>} />

              <Route path="/plans" element={<PlanList />} />

              <Route path="/plans/new" element={<RequireTeamWrite redirectTo="/plans"><PlanNewRoute /></RequireTeamWrite>} />

              <Route path="/plans/:id/cases" element={<PlanCaseSelect />} />

              <Route path="/cases" element={<CaseRepository />} />

              <Route path="/cases/runs" element={<RecordedRunList />} />

              <Route path="/cases/:id/edit" element={<CaseRecordedEdit />} />
              <Route path="/cases/recorded/:id" element={<CaseRecordedEdit />} />

              <Route path="/record" element={<RequireTeamWrite><CaseRecord /></RequireTeamWrite>} />

              <Route path="/extension" element={<ExtensionDownload />} />

              <Route path="/local-runner" element={<LocalRunnerSetup />} />

              <Route path="/plans/:id" element={<PlanDetail />} />

              <Route path="/plans/:id/edit" element={<RequireTeamWrite redirectTo="/plans"><PlanEdit /></RequireTeamWrite>} />

              <Route path="/reports" element={<ReportList />} />

              <Route path="/environments" element={<Environments />} />

              <Route path="/settings/space" element={<SpaceSettings />} />

              <Route path="/admin/spaces" element={<RequireSuperAdmin><AdminSpaces /></RequireSuperAdmin>} />

              <Route path="/runs/:id" element={<RunReport />} />

              <Route path="/runs/:runId/cases/:caseId" element={<RunCaseReport />} />

              <Route path="/login" element={<Navigate to="/" replace />} />

              <Route path="*" element={<Navigate to="/" replace />} />

            </Routes>
            </TeamMembershipGate>
            </div>
          </main>
        </div>

      </div>

      </CreatePlanProvider>

    </UserProvider>

  );

}

