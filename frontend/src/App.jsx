import { useState, useEffect } from 'react';
import { Routes, Route, Link, NavLink, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import PlanNew from './pages/PlanNew';
import PlanDetail from './pages/PlanDetail';
import PlanEdit from './pages/PlanEdit';
import RunReport from './pages/RunReport';
import RunCaseReport from './pages/RunCaseReport';
import ReportList from './pages/ReportList';

const API = '/api';

function ServerStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    const fetchStatus = () => {
      fetch(API + '/runs/status').then((r) => r.json()).then(setStatus).catch(() => setStatus({ running: false }));
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

function Nav() {
  const path = useLocation().pathname;
  const planActive = path === '/' || path.startsWith('/plans');
  const reportActive = path === '/reports' || path.startsWith('/runs');
  return (
    <nav className="app-nav">
      <Link to="/" className="brand">UIAuto</Link>
      <NavLink to="/" end className={planActive ? 'active' : ''}>测试计划</NavLink>
      <NavLink to="/reports" className={reportActive ? 'active' : ''}>执行历史</NavLink>
      <ServerStatus />
    </nav>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <Nav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/plans/new" element={<PlanNew />} />
          <Route path="/plans/:id" element={<PlanDetail />} />
          <Route path="/plans/:id/edit" element={<PlanEdit />} />
          <Route path="/reports" element={<ReportList />} />
          <Route path="/runs/:id" element={<RunReport />} />
          <Route path="/runs/:runId/cases/:caseId" element={<RunCaseReport />} />
        </Routes>
      </main>
    </div>
  );
}
