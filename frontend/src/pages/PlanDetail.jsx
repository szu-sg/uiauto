import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { authFetch } from '../authApi';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import UserChip from '../components/UserChip';
import EmptyState from '../components/ui/EmptyState';
import StatusBadge from '../components/ui/StatusBadge';
import SoftSelect from '../components/ui/SoftSelect';
import BrowserIcon from '../components/ui/BrowserIcon';
import SchedulePicker from '../components/plans/SchedulePicker';
import WorkbenchLayout from '../components/layout/WorkbenchLayout';
import {
  caseSearchHaystack,
  formatPriorityLabel,
  getCaseRemark,
  getCaseTags,
  priorityClass,
} from '../utils/caseDisplay';
import { displayCreatorText, displayName, isSameCreator } from '../utils/userDisplay';
import { formatRelativeTime, formatDateTime } from '../utils/formatTime';
import { useTeamWrite } from '../hooks/useTeamWrite';

const API = '/api';

const PLAN_TYPE_LABELS = {
  ui_auto: 'UI自动化',
  fastbot: 'Fastbot',
};

const DETAIL_TABS = [
  { id: 'case', label: '用例管理' },
  { id: 'execute', label: '执行配置' },
  { id: 'notify', label: '通知 & 定时调度' },
  { id: 'record', label: '执行记录' },
];

function planTypeLabel(type) {
  return PLAN_TYPE_LABELS[type] || PLAN_TYPE_LABELS.ui_auto;
}

function maskWebhookUrlForDisplay(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    for (const name of ['key', 'token', 'secret', 'sign', 'access_token']) {
      if (!u.searchParams.has(name)) continue;
      const v = u.searchParams.get(name);
      if (v == null || v === '') continue;
      u.searchParams.set(
        name,
        v.length <= 8 ? '••••••••' : `${v.slice(0, 2)}••••••${v.slice(-2)}`
      );
    }
    return u.toString();
  } catch {
    return s.replace(/([?&])(key|token|secret|sign|access_token)=([^&]*)/gi, (_m, sep, k, v) => {
      const masked = !v || v.length <= 8 ? '••••••••' : `${v.slice(0, 2)}••••••${v.slice(-2)}`;
      return `${sep}${k}=${masked}`;
    });
  }
}

const BROWSER_OPTIONS = [
  { id: 'chromium', label: 'Chromium', icon: 'chromium' },
  { id: 'chrome', label: 'Chrome', icon: 'chrome' },
  { id: 'msedge', label: 'Edge', icon: 'edge' },
  { id: 'firefox', label: 'Firefox', icon: 'firefox' },
  { id: 'webkit', label: 'WebKit', icon: 'webkit' },
];

const BROWSER_WITH_VERSIONS = [
  { id: 'chromium', label: 'Chromium', versions: [
    { id: 'chromium', label: 'Chromium', icon: 'chromium' },
    { id: 'chrome', label: 'Chrome', icon: 'chrome' },
    { id: 'msedge', label: 'Edge', icon: 'edge' },
  ]},
  { id: 'firefox', label: 'Firefox', versions: [
    { id: 'firefox', label: 'Firefox', icon: 'firefox' },
  ]},
  { id: 'webkit', label: 'WebKit', versions: [
    { id: 'webkit', label: 'WebKit', icon: 'webkit' },
  ]},
];

function getVersionLabel(versionId) {
  const flat = BROWSER_OPTIONS.find((b) => b.id === versionId);
  if (flat) return flat.label;
  for (const b of BROWSER_WITH_VERSIONS) {
    const v = b.versions.find((x) => x.id === versionId);
    if (v) return `${b.label} · ${v.label}`;
  }
  return versionId;
}

function normalizePlanResponse(p) {
  if (!p || typeof p !== 'object') return p;
  let cases = p.cases;
  if (!Array.isArray(cases) && p.cases_json) {
    try { cases = JSON.parse(p.cases_json || '[]'); } catch (_) { cases = []; }
  }
  if (!Array.isArray(cases)) cases = [];

  let case_metadata = p.case_metadata;
  if (Array.isArray(case_metadata)) {
    const byPath = {};
    case_metadata.forEach((item, i) => {
      if (!item || typeof item !== 'object') return;
      const path = cases[i];
      if (path != null) byPath[path] = { ...item };
    });
    case_metadata = byPath;
  } else if (case_metadata && typeof case_metadata !== 'object') {
    case_metadata = null;
  }

  let case_display_names = p.case_display_names;
  if (!case_display_names || typeof case_display_names !== 'object') {
    case_display_names = {};
    cases.forEach((path) => {
      const meta = case_metadata && case_metadata[path];
      case_display_names[path] = (meta && meta.name) || path;
    });
  }

  let creator = p.creator;
  if (creator != null && typeof creator === 'object') {
    creator = creator.name ?? creator.id ?? null;
  }

  return {
    ...p,
    cases,
    case_metadata: case_metadata || null,
    case_display_names,
    creator: creator != null ? String(creator) : p.creator,
    environment_summary: p.environment_summary || null,
  };
}

function fallbackCaseName(pathStr) {
  if (!pathStr) return '用例';
  const base = pathStr.split('/').pop() || pathStr;
  return base.replace(/\.(spec|test)\.(ts|js|mjs)$/i, '') || base;
}

function CaseTagList({ tags }) {
  if (!tags.length) return <span className="case-repo-cell-muted">—</span>;
  return (
    <div className="case-repo-tags">
      {tags.slice(0, 4).map((tag) => (
        <span key={tag} className="case-repo-tag">{tag}</span>
      ))}
      {tags.length > 4 && <span className="case-repo-tag case-repo-tag--more">+{tags.length - 4}</span>}
    </div>
  );
}

function CaseCreatorCell({ createdBy, currentUser }) {
  if (!createdBy) return <span className="case-repo-cell-muted">—</span>;
  const chipUser = isSameCreator(displayName(createdBy), currentUser) && currentUser
    ? currentUser
    : createdBy;
  return <UserChip user={chipUser} size="sm" />;
}

export default function PlanDetail() {
  const { id } = useParams();
  const user = useUser();
  const canWrite = useTeamWrite();
  const { showToast } = useToast();
  const [plan, setPlan] = useState(null);
  const [activeTab, setActiveTab] = useState('case');
  const [running, setRunning] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleCron, setScheduleCron] = useState('');
  const [scheduleOnce, setScheduleOnce] = useState(false);
  const [scheduleNextRun, setScheduleNextRun] = useState(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [runBrowsers, setRunBrowsers] = useState([]);
  const [browsersSaving, setBrowsersSaving] = useState(false);
  const [notifyWebhookUrl, setNotifyWebhookUrl] = useState('');
  const [notifyWebhookFocus, setNotifyWebhookFocus] = useState(false);
  const [notifyOnCreated, setNotifyOnCreated] = useState(true);
  const [notifyOnSuccess, setNotifyOnSuccess] = useState(true);
  const [notifyOnFailure, setNotifyOnFailure] = useState(true);
  const [notifySaving, setNotifySaving] = useState(false);
  const notifyWebhookDebounceRef = useRef(null);
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [planLoadError, setPlanLoadError] = useState(null);
  const [envList, setEnvList] = useState([]);
  const [savedPlanEnvId, setSavedPlanEnvId] = useState('');
  const [envBindingSaving, setEnvBindingSaving] = useState(false);
  const [caseKeyword, setCaseKeyword] = useState('');
  const [caseMetaRefreshing, setCaseMetaRefreshing] = useState(false);
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [envCheck, setEnvCheck] = useState({ ok: true, ready_to_execute: true, needs_plan_environment: false, portable_cases: [] });

  const refreshPlan = () => {
    setPlanLoadError(null);
    authFetch(API + '/plans/' + id)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? '计划不存在' : r.statusText))))
      .then((p) => {
        const normalized = normalizePlanResponse(p);
        setPlan(normalized);
        setScheduleEnabled(!!normalized.schedule_enabled);
        setRunBrowsers(Array.isArray(normalized.run_browsers) ? [...normalized.run_browsers] : []);
        setScheduleCron(normalized.schedule_cron || '');
        setScheduleOnce(!!normalized.schedule_once);
        setScheduleNextRun(normalized.next_schedule_run || null);
        setNotifyWebhookUrl(normalized.notify_webhook_url || '');
        setNotifyOnCreated(normalized.notify_on_created == null || !!Number(normalized.notify_on_created));
        setNotifyOnSuccess(normalized.notify_on_success == null || !!Number(normalized.notify_on_success));
        setNotifyOnFailure(normalized.notify_on_failure == null || !!Number(normalized.notify_on_failure));
        const pe = normalized.environment_id;
        setSavedPlanEnvId(pe != null && pe !== '' ? String(pe) : '');
        if (normalized.environment_summary) {
          setEnvCheck(normalized.environment_summary);
        }
      })
      .catch((err) => setPlanLoadError(err?.message || '加载失败'));
  };

  useEffect(() => { refreshPlan(); }, [id]);

  useEffect(() => {
    if (!id) return;
    authFetch(API + '/plans/' + id + '/environment-check')
      .then((r) => (r.ok ? r.json() : { ok: true }))
      .then((data) => setEnvCheck(data && typeof data === 'object' ? data : { ok: true }))
      .catch(() => setEnvCheck({ ok: true }));
  }, [id, plan?.case_ids_json, plan?.cases_json, savedPlanEnvId]);

  useEffect(
    () => () => {
      if (notifyWebhookDebounceRef.current) clearTimeout(notifyWebhookDebounceRef.current);
    },
    [],
  );

  useEffect(() => {
    authFetch(API + '/environments')
      .then((r) => (r.ok ? r.json() : []))
      .then(setEnvList)
      .catch(() => setEnvList([]));
  }, []);

  useEffect(() => {
    if (activeTab !== 'record') return;
    setRunsLoading(true);
    authFetch(`${API}/runs?planId=${id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setRuns(Array.isArray(data) ? data : []))
      .catch(() => setRuns([]))
      .finally(() => setRunsLoading(false));
  }, [activeTab, id]);

  const persistPlanEnvironment = (idStr) => {
    if (!idStr) return;
    setEnvBindingSaving(true);
    authFetch(API + '/plans/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment_id: Number(idStr) }),
    })
      .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || r.statusText)))))
      .then(() => {
        setPlan((p) => (p ? { ...p, environment_id: Number(idStr) } : p));
        showToast('执行环境已更新');
        refreshPlan();
      })
      .catch((e) => showToast(e.message || '保存失败'))
      .finally(() => setEnvBindingSaving(false));
  };

  const planCases = plan ? (Array.isArray(plan.plan_cases) ? plan.plan_cases : []) : [];
  const cases = planCases.length > 0
    ? planCases.map((c) => c.path)
    : (plan ? (Array.isArray(plan.cases) ? plan.cases : []) : []);
  const hasPlanEnv = Boolean(savedPlanEnvId)
    && envList.some((e) => String(e.id) === savedPlanEnvId);
  const canExecute = cases.length > 0
    && (envCheck.ready_to_execute ?? (!envCheck.needs_plan_environment || hasPlanEnv));

  const startRun = () => {
    if (!canExecute) {
      if (cases.length === 0) showToast('请先绑定用例', 2800);
      else if (!(envCheck.ready_to_execute ?? true)) showToast(envCheck.error || '请先在执行配置中选择环境', 3200);
      else if (envList.length === 0) showToast('请先创建执行环境', 2800);
      else showToast('请先选择执行环境', 2800);
      return;
    }
    setRunning(true);
    authFetch(API + '/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: Number(id) }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText || '启动失败');
        window.location.href = '/runs/' + data.id;
      })
      .catch((e) => showToast(e.message || '启动失败', 3200))
      .finally(() => setRunning(false));
  };

  const toggleRunBrowserVersion = (versionId) => {
    const next = runBrowsers.includes(versionId)
      ? runBrowsers.filter((b) => b !== versionId)
      : [...runBrowsers, versionId];
    setRunBrowsers(next);
    setBrowsersSaving(true);
    authFetch(API + '/plans/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_browsers: next.length ? next : null }),
    })
      .then(() => {
        setPlan((p) => (p ? { ...p, run_browsers: next } : p));
        showToast('执行浏览器已保存');
      })
      .finally(() => setBrowsersSaving(false));
  };

  const persistNotifyPatch = (partial) => {
    const body = {};
    if (partial.notify_webhook_url !== undefined) body.notify_webhook_url = partial.notify_webhook_url;
    if (partial.notify_on_created !== undefined) body.notify_on_created = partial.notify_on_created;
    if (partial.notify_on_success !== undefined) body.notify_on_success = partial.notify_on_success;
    if (partial.notify_on_failure !== undefined) body.notify_on_failure = partial.notify_on_failure;
    if (!Object.keys(body).length) return;
    setNotifySaving(true);
    authFetch(API + '/plans/' + id + '/notify', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(() => refreshPlan())
      .catch(() => showToast('通知设置保存失败'))
      .finally(() => setNotifySaving(false));
  };

  const scheduleNotifyWebhookPersist = (urlString) => {
    if (notifyWebhookDebounceRef.current) clearTimeout(notifyWebhookDebounceRef.current);
    notifyWebhookDebounceRef.current = setTimeout(() => {
      notifyWebhookDebounceRef.current = null;
      persistNotifyPatch({ notify_webhook_url: urlString.trim() || null });
    }, 650);
  };

  const saveSchedule = ({ cron, once }) => {
    if (!cron) return;
    setScheduleSaving(true);
    setScheduleEnabled(true);
    setScheduleCron(cron);
    setScheduleOnce(!!once);
    authFetch(API + '/plans/' + id + '/schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule_enabled: true, schedule_cron: cron, schedule_once: !!once }),
    })
      .then(() => {
        showToast(once ? '单次定时已保存' : '定时已保存');
        refreshPlan();
      })
      .catch(() => showToast('保存失败'))
      .finally(() => setScheduleSaving(false));
  };

  const clearSchedule = () => {
    setScheduleSaving(true);
    setScheduleEnabled(false);
    authFetch(API + '/plans/' + id + '/schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule_enabled: false, schedule_cron: null, schedule_once: false }),
    })
      .then(() => {
        setScheduleCron('');
        setScheduleOnce(false);
        setScheduleNextRun(null);
        showToast('已关闭定时');
      })
      .catch(() => showToast('关闭失败'))
      .finally(() => setScheduleSaving(false));
  };

  const savePlanName = () => {
    const name = editNameValue.trim();
    if (!name || !plan) return;
    authFetch(API + '/plans/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
      .then((r) => r.json())
      .then(() => {
        setPlan((p) => (p ? { ...p, name } : p));
        setEditingName(false);
        showToast('计划名已保存');
      });
  };

  const refreshCaseMetadata = () => {
    if (caseMetaRefreshing) return;
    setCaseMetaRefreshing(true);
    authFetch(API + '/plans/' + id + '/refresh-case-names', { method: 'POST' })
      .then(() => refreshPlan())
      .catch(() => showToast('刷新失败'))
      .finally(() => setCaseMetaRefreshing(false));
  };

  const resolveCaseDisplayName = (path) => {
    const meta = plan?.case_metadata?.[path];
    return (meta && meta.name) || plan?.case_display_names?.[path] || fallbackCaseName(path);
  };

  const filteredPlanCases = useMemo(() => {
    const rows = planCases.length > 0
      ? planCases
      : cases.map((path) => {
          const meta = plan?.case_metadata?.[path];
          return {
            id: null,
            path,
            name: resolveCaseDisplayName(path),
            priority: meta?.priority,
            description: meta?.description,
            tags: meta?.tags || [],
          };
        });
    if (!caseKeyword.trim()) return rows;
    const k = caseKeyword.trim().toLowerCase();
    return rows.filter((row) => caseSearchHaystack(row).includes(k));
  }, [planCases, cases, caseKeyword, plan]);

  if (!plan) {
    return planLoadError ? (
      <EmptyState
        variant="error"
        title="加载失败"
        hint={`${planLoadError}，请检查网络或后端服务。`}
        action={<Link to="/plans" className="btn btn-secondary">返回测试计划</Link>}
      />
    ) : (
      <EmptyState variant="loading" title="加载计划详情" hint="正在获取计划信息" />
    );
  }

  return (
    <WorkbenchLayout className={`plan-detail-page plan-detail-page--tabs${activeTab === 'case' && cases.length > 0 ? ' wb-page--fill' : ''}`}>
      <div className="glass-card plan-detail-hero">
        <div className="plan-detail-hero__inner">
          <div className="plan-detail-hero__head">
            <div className="plan-detail-hero__title-block">
              {editingName ? (
                <div className="plan-detail-head__edit">
                  <input
                    className="plan-detail-field plan-detail-name-input"
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && savePlanName()}
                    autoFocus
                  />
                  <button type="button" className="btn btn-primary btn-sm" onClick={savePlanName}>保存</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditingName(false); setEditNameValue(plan.name); }}>取消</button>
                </div>
              ) : (
                <div className="plan-detail-hero__title-row">
                  <h1 className="plan-detail-hero__title">{plan.name}</h1>
                  {canWrite && (
                  <button
                    type="button"
                    className="plan-detail-head__edit-btn"
                    onClick={() => { setEditNameValue(plan.name); setEditingName(true); }}
                    aria-label="修改名称"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                    </svg>
                  </button>
                  )}
                </div>
              )}
            </div>
            {canWrite && (
            <div className="plan-detail-hero__actions">
              <button
                type="button"
                className="btn btn-primary plan-detail-hero__execute"
                onClick={startRun}
                disabled={running || !canExecute}
              >
                {running ? '执行中…' : '立即执行'}
              </button>
            </div>
            )}
          </div>
          <div className="plan-detail-hero__meta">
            <span className="plan-detail-tag">{planTypeLabel(plan.plan_type)}</span>
            <span className="plan-detail-hero__meta-item">用例：<strong>{cases.length}</strong> 条</span>
            <span className="plan-detail-hero__meta-item">执行：服务器 Playwright</span>
            {plan.created_at && (
              <span className="plan-detail-hero__meta-item" title={formatDateTime(plan.created_at)}>
                创建时间：{formatDateTime(plan.created_at)}
              </span>
            )}
            <span className="plan-detail-hero__creator plan-detail-hero__meta-item">
              <span className="plan-detail-hero__creator-label">创建人</span>
              {isSameCreator(plan.creator, user) ? (
                <UserChip user={user} size="sm" />
              ) : (
                displayCreatorText(plan.creator, user)
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="glass-card plan-detail-tabs-wrap">
        <nav className="plan-detail-tabs" role="tablist" aria-label="计划配置">
          {DETAIL_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={'plan-detail-tabs__item' + (activeTab === tab.id ? ' plan-detail-tabs__item--active' : '')}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'case' && (
        <div className="glass-card plan-detail-panel plan-detail-case-panel">
          {cases.length === 0 ? (
            plan.plan_type === 'fastbot' ? (
              <EmptyState title="Fastbot 用例" hint="即将上线" />
            ) : (
              <div className="plan-detail-case-empty">
                <div className="plan-detail-case-empty__icon" aria-hidden>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                    <path d="M8 4h8l2 2v14H6V4h2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    <path d="M9 9h6M9 13h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="plan-detail-case-empty__title">当前计划未绑定任何自动化用例</p>
                {canWrite && (
                  <Link to={`/plans/${id}/cases`} className="btn btn-primary plan-detail-case-empty__cta">
                    从用例库选择用例
                  </Link>
                )}
              </div>
            )
          ) : (
            <div className="case-repo-list-card">
              <div className="case-repo-list-card__header">
                <div className="case-repo-list-card__top">
                  <div className="case-repo-list-card__title-block">
                    <h2 className="case-repo-list-card__title">绑定自动化用例</h2>
                    <span className="case-repo-list-card__count">
                      共 <strong>{cases.length}</strong> 条
                    </span>
                  </div>
                  <div className="case-repo-search">
                    <span className="case-repo-search__icon" aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                    </span>
                    <input
                      type="search"
                      className="plan-detail-field case-repo-search__input"
                      placeholder="搜索名称 / 标签 / 备注"
                      value={caseKeyword}
                      onChange={(e) => setCaseKeyword(e.target.value)}
                    />
                  </div>
                  {canWrite && (
                  <div className="case-repo-list-card__actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={refreshCaseMetadata}
                      disabled={caseMetaRefreshing}
                    >
                      {caseMetaRefreshing ? '刷新中…' : '刷新元数据'}
                    </button>
                    <Link to={`/plans/${id}/cases`} className="btn btn-primary btn-sm">从用例库选择</Link>
                  </div>
                  )}
                </div>
              </div>

              <div className="case-repo-list-card__body">
                {filteredPlanCases.length === 0 ? (
                  <div className="case-repo-empty case-repo-empty--compact">
                    <p className="case-repo-empty__title">未找到匹配的用例</p>
                  </div>
                ) : (
                  <div className="ui-table-wrap case-repo-table-wrap case-repo-table-scroll">
                    <table className="ui-table case-repo-table plan-detail-case-table">
                      <thead>
                        <tr>
                          <th className="case-repo-table__name-h">名称</th>
                          <th>优先级</th>
                          <th>标签</th>
                          <th>备注</th>
                          <th>创建人</th>
                          <th>创建时间</th>
                          <th className="case-repo-table__actions">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPlanCases.map((row) => {
                          const tags = getCaseTags(row);
                          return (
                            <tr key={row.path}>
                              <td className="case-repo-table__name">{row.name || resolveCaseDisplayName(row.path)}</td>
                              <td>
                                <span className={priorityClass(row.priority)}>
                                  {formatPriorityLabel(row.priority)}
                                </span>
                              </td>
                              <td><CaseTagList tags={tags} /></td>
                              <td
                                className="case-repo-table__remark"
                                title={row.description?.trim() || ''}
                              >
                                {getCaseRemark(row)}
                              </td>
                              <td className="case-repo-table__creator">
                                <CaseCreatorCell createdBy={row.created_by} currentUser={user} />
                              </td>
                              <td className="case-repo-table__time" title={row.created_at || ''}>
                                {formatDateTime(row.created_at)}
                              </td>
                              <td className="case-repo-table__actions">
                                {row.id ? (
                                  <Link to={`/cases/${row.id}/edit`} className="btn btn-secondary btn-sm">{canWrite ? '编辑' : '查看'}</Link>
                                ) : (
                                  <span className="case-repo-cell-muted">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="case-repo-pagination plan-detail-case-pagination">
                  <span className="case-repo-pagination__info">
                    已绑定 <strong>{cases.length}</strong> 条
                    {caseKeyword.trim() && filteredPlanCases.length !== cases.length
                      ? `，筛选显示 ${filteredPlanCases.length} 条`
                      : ''}
                  </span>
                  {canWrite && (
                  <div className="case-repo-pagination__nav">
                    <Link to={`/plans/${id}/cases`} className="btn btn-primary btn-sm">从用例库选择</Link>
                  </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'execute' && (
        <div className="plan-detail-tab-stack">
          {plan?.environment_summary?.summary_text && (
            <div className="glass-card plan-detail-panel plan-env-summary" role="status">
              <p className="plan-env-summary__text">{plan.environment_summary.summary_text}</p>
              {plan.environment_summary.total_cases > 0 && (
                <div className="plan-env-summary__stats">
                  <span>通用用例 {plan.environment_summary.portable_count}</span>
                  <span>绑定包 {plan.environment_summary.bundle_own_env_count}</span>
                </div>
              )}
            </div>
          )}
          {!(envCheck.ready_to_execute ?? true) && (
            <div className="plan-new-create-inline-error" role="alert">
              {envCheck.error || '执行前请为计划配置执行环境（添加用例无需先配置环境）。'}
            </div>
          )}
          <div className="glass-card plan-detail-panel">
            <h2 className="plan-detail-panel__title plan-detail-panel__title--solo">执行环境</h2>
            <div className="plan-detail-exec-row">
              <SoftSelect
                value={savedPlanEnvId}
                disabled={!canWrite || envBindingSaving || envList.length === 0}
                placeholder={envList.length === 0 ? '暂无环境' : '请选择运行环境'}
                aria-label="执行环境"
                options={envList.map((e) => ({ value: String(e.id), label: e.name }))}
                onChange={(v) => {
                  setSavedPlanEnvId(v);
                  persistPlanEnvironment(v);
                }}
                className="plan-detail-env-select"
              />
              <Link to="/environments" className="plan-config-section__link">管理环境</Link>
              {envBindingSaving && <span className="plan-detail-inline-status">保存中</span>}
            </div>
          </div>

          <div className="glass-card plan-detail-panel plan-detail-exec-note">
            <p className="plan-detail-exec-note__text">
              计划执行在<strong>服务器</strong>上运行 Playwright（无界面）。
              单条用例调试请在用例编辑页使用「一键运行」（本机浏览器）。
            </p>
          </div>

          <div className="glass-card plan-detail-panel">
            <h2 className="plan-detail-panel__title plan-detail-panel__title--solo">执行浏览器</h2>
            <div className="plan-detail-browser-tiles">
              {BROWSER_OPTIONS.map((browser) => {
                const checked = runBrowsers.includes(browser.id);
                return (
                  <button
                    key={browser.id}
                    type="button"
                    className={`plan-detail-browser-tile${checked ? ' plan-detail-browser-tile--active' : ''}`}
                    onClick={() => toggleRunBrowserVersion(browser.id)}
                    disabled={!canWrite || browsersSaving}
                    aria-pressed={checked}
                  >
                    <BrowserIcon id={browser.icon} size={36} className="plan-detail-browser-tile__icon" />
                    <span className="plan-detail-browser-tile__label">{browser.label}</span>
                    <span className="plan-detail-browser-tile__check" aria-hidden>
                      {checked ? (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
            {runBrowsers.length > 0 && (
              <div className="plan-detail-selected-combos">
                {runBrowsers.map((versionId) => (
                  <span key={versionId} className="plan-detail-combo-chip">{getVersionLabel(versionId)}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'notify' && (
        <div className="plan-detail-tab-stack plan-detail-tab-stack--wide-fields">
          <div className="glass-card plan-detail-panel">
            <h2 className="plan-detail-panel__title plan-detail-panel__title--solo">Webhook 消息通知</h2>
            <input
              type="text"
              className="plan-detail-field plan-detail-notify-input"
              readOnly={!canWrite}
              disabled={!canWrite}
              value={notifyWebhookFocus ? notifyWebhookUrl : maskWebhookUrlForDisplay(notifyWebhookUrl)}
              onChange={(e) => {
                const v = e.target.value;
                setNotifyWebhookUrl(v);
                scheduleNotifyWebhookPersist(v);
              }}
              onFocus={() => setNotifyWebhookFocus(true)}
              onBlur={(e) => {
                setNotifyWebhookFocus(false);
                if (notifyWebhookDebounceRef.current) {
                  clearTimeout(notifyWebhookDebounceRef.current);
                  notifyWebhookDebounceRef.current = null;
                }
                persistNotifyPatch({ notify_webhook_url: e.target.value.trim() || null });
              }}
              placeholder="https://企业通知机器人地址"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="plan-detail-notify-toggles">
              <label className="plan-detail-notify-check">
                <input type="checkbox" disabled={!canWrite} checked={notifyOnCreated} onChange={(e) => { const v = e.target.checked; setNotifyOnCreated(v); persistNotifyPatch({ notify_on_created: v }); }} />
                <span>任务创建完成通知</span>
              </label>
              <label className="plan-detail-notify-check">
                <input type="checkbox" disabled={!canWrite} checked={notifyOnSuccess} onChange={(e) => { const v = e.target.checked; setNotifyOnSuccess(v); persistNotifyPatch({ notify_on_success: v }); }} />
                <span>执行成功通知</span>
              </label>
              <label className="plan-detail-notify-check">
                <input type="checkbox" disabled={!canWrite} checked={notifyOnFailure} onChange={(e) => { const v = e.target.checked; setNotifyOnFailure(v); persistNotifyPatch({ notify_on_failure: v }); }} />
                <span>执行失败 / 取消通知</span>
              </label>
            </div>
            {notifySaving && <span className="plan-detail-inline-status">保存中</span>}
          </div>

          <div className="glass-card plan-detail-panel">
            <h2 className="plan-detail-panel__title plan-detail-panel__title--solo">定时调度任务</h2>
            <SchedulePicker
              readOnly={!canWrite}
              enabled={scheduleEnabled}
              cron={scheduleCron}
              once={scheduleOnce}
              nextRun={scheduleNextRun}
              saving={scheduleSaving}
              onSave={saveSchedule}
              onClear={clearSchedule}
            />
          </div>
        </div>
      )}

      {activeTab === 'record' && (
        <div className="glass-card plan-detail-panel">
          <div className="plan-detail-panel__head">
            <h2 className="plan-detail-panel__title">全部执行历史</h2>
            <Link to={'/reports?planId=' + id} className="plan-config-section__link">查看完整列表</Link>
          </div>
          {runsLoading ? (
            <EmptyState variant="loading" title="加载执行记录" />
          ) : runs.length === 0 ? (
            <EmptyState title="暂无执行记录" hint="执行计划后将在此展示" />
          ) : (
            <div className="ui-table-wrap">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>状态</th>
                    <th>开始时间</th>
                    <th>用例</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {runs.slice(0, 20).map((run) => (
                    <tr key={run.id}>
                      <td><StatusBadge status={run.status} /></td>
                      <td>{formatRelativeTime(run.started_at || run.created_at)}</td>
                      <td>{run.passed_count ?? 0}/{run.total_cases ?? run.cases_count ?? '—'}</td>
                      <td><Link to={'/runs/' + run.id} className="plan-config-section__link">报告</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </WorkbenchLayout>
  );
}
