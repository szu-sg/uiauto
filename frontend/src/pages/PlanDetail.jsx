import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { authFetch } from '../authApi';

const API = '/api';

/** 展示用：遮盖 Webhook URL 中 key/token 等敏感查询参数，避免旁人窥屏 */
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

/** 浏览器及其内核版本（联动：先选浏览器，再选该浏览器下的版本） */
const BROWSER_WITH_VERSIONS = [
  { id: 'chromium', label: 'Chromium', versions: [
    { id: 'chromium', label: 'Chromium' },
    { id: 'chrome', label: 'Chrome' },
    { id: 'msedge', label: 'Edge' },
  ]},
  { id: 'firefox', label: 'Firefox', versions: [
    { id: 'firefox', label: 'Firefox' },
  ]},
  { id: 'webkit', label: 'WebKit', versions: [
    { id: 'webkit', label: 'WebKit' },
  ]},
];
function getVersionLabel(versionId) {
  for (const b of BROWSER_WITH_VERSIONS) {
    const v = b.versions.find((x) => x.id === versionId);
    if (v) return `${b.label} · ${v.label}`;
  }
  return versionId;
}

/** 前端兜底：路径取文件名并去掉 .spec.ts 等 */
function fallbackCaseName(pathStr) {
  if (!pathStr) return '未命名用例';
  const base = pathStr.split('/').pop() || pathStr;
  return base.replace(/\.(spec|test)\.(ts|js|mjs)$/i, '') || base || '未命名用例';
}

/**
 * 统一计划接口返回结构，兼容两种后端格式：
 * - 本仓库：cases_json、case_metadata 对象(path->meta)、case_display_names、creator 字符串
 * - 其他：test_case_list、case_metadata 数组、case_display_name_list、creator 对象
 */
function normalizePlanResponse(p) {
  if (!p || typeof p !== 'object') return p;
  let cases = p.cases;
  if (!Array.isArray(cases) && p.cases_json) {
    try {
      cases = JSON.parse(p.cases_json || '[]');
    } catch (_) {
      cases = [];
    }
  }
  if (!Array.isArray(cases) && Array.isArray(p.test_case_list)) {
    cases = p.test_case_list.map((t) => (t && (t.name ?? t.path)) || String(t));
  }
  if (!Array.isArray(cases) && Array.isArray(p.case_display_name_list)) {
    cases = p.case_display_name_list.slice();
  }
  if (!Array.isArray(cases)) cases = [];

  let case_metadata = p.case_metadata;
  if (Array.isArray(case_metadata)) {
    const byPath = {};
    case_metadata.forEach((item, i) => {
      if (!item || typeof item !== 'object') return;
      const path = cases[i];
      if (path != null) {
        byPath[path] = {
          name: item.name,
          description: item.description,
          priority: item.priority,
          author: item.author,
          createdAt: item.createdAt,
        };
      }
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
  };
}

export default function PlanDetail() {
  const { id } = useParams();
  const [plan, setPlan] = useState(null);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState(null);
  const [caseFilterName, setCaseFilterName] = useState('');
  const [caseFilterPath, setCaseFilterPath] = useState('');
  const [caseFilterPriority, setCaseFilterPriority] = useState('');
  const [casePage, setCasePage] = useState(1);
  const CASE_PAGE_SIZE = 10;
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleCron, setScheduleCron] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const [runBrowsers, setRunBrowsers] = useState([]);
  const [browsersSaving, setBrowsersSaving] = useState(false);
  const [triggerMode, setTriggerMode] = useState('immediate'); // 'immediate' | 'scheduled'
  const [notifyWebhookUrl, setNotifyWebhookUrl] = useState('');
  const [notifyWebhookFocus, setNotifyWebhookFocus] = useState(false);
  const [notifyOnCreated, setNotifyOnCreated] = useState(true);
  const [notifyOnSuccess, setNotifyOnSuccess] = useState(true);
  const [notifyOnFailure, setNotifyOnFailure] = useState(true);
  const [notifySaving, setNotifySaving] = useState(false);
  // 计划名编辑
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [caseMetaRefreshing, setCaseMetaRefreshing] = useState(false);
  const [planLoadError, setPlanLoadError] = useState(null);

  const refreshPlan = () => {
    setPlanLoadError(null);
    authFetch(API + '/plans/' + id)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? '计划不存在' : r.statusText))))
      .then((p) => {
        const normalized = normalizePlanResponse(p);
        setPlan(normalized);
        setScheduleEnabled(!!normalized.schedule_enabled);
        setRunBrowsers(Array.isArray(normalized.run_browsers) ? [...normalized.run_browsers] : []);
        setTriggerMode(normalized.schedule_enabled ? 'scheduled' : 'immediate');
        setScheduleCron(normalized.schedule_cron || '');
        setNotifyWebhookUrl(normalized.notify_webhook_url || '');
        setNotifyOnCreated(normalized.notify_on_created == null || !!Number(normalized.notify_on_created));
        setNotifyOnSuccess(normalized.notify_on_success == null || !!Number(normalized.notify_on_success));
        setNotifyOnFailure(normalized.notify_on_failure == null || !!Number(normalized.notify_on_failure));
      })
      .catch((err) => setPlanLoadError(err?.message || '加载失败'));
  };

  useEffect(() => {
    refreshPlan();
  }, [id]);

  const refreshCaseMetadata = () => {
    if (caseMetaRefreshing) return;
    setCaseMetaRefreshing(true);
    authFetch(API + '/plans/' + id + '/refresh-case-names', { method: 'POST' })
      .then(() => refreshPlan())
      .catch(() => setToast('刷新失败'))
      .finally(() => setCaseMetaRefreshing(false));
  };

  const startRun = () => {
    setRunning(true);
    authFetch(API + '/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: Number(id) }),
    })
      .then((r) => r.json())
      .then((data) => (window.location.href = '/runs/' + data.id))
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
        setToast('执行浏览器已保存');
        setTimeout(() => setToast(null), 2000);
      })
      .finally(() => setBrowsersSaving(false));
  };

  const removeRunBrowserVersion = (versionId) => {
    const next = runBrowsers.filter((b) => b !== versionId);
    setRunBrowsers(next);
    setBrowsersSaving(true);
    authFetch(API + '/plans/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_browsers: next.length ? next : null }),
    })
      .then(() => {
        setPlan((p) => (p ? { ...p, run_browsers: next } : p));
        setToast('已取消该组合');
        setTimeout(() => setToast(null), 2000);
      })
      .finally(() => setBrowsersSaving(false));
  };

  const saveNotify = () => {
    setNotifySaving(true);
    authFetch(API + '/plans/' + id + '/notify', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notify_webhook_url: notifyWebhookUrl.trim() || null,
        notify_on_created: notifyOnCreated,
        notify_on_success: notifyOnSuccess,
        notify_on_failure: notifyOnFailure,
      }),
    })
      .then(() => {
        setToast('通知设置已保存');
        setTimeout(() => setToast(null), 2000);
        refreshPlan();
      })
      .catch(() => setToast('通知设置保存失败'))
      .finally(() => setNotifySaving(false));
  };

  const saveSchedule = (opts = {}) => {
    const cron = scheduleCron.trim();
    const enable = opts.enabled !== undefined ? opts.enabled : scheduleEnabled;
    if (enable && !cron) return;
    setScheduleSaving(true);
    setScheduleEnabled(!!enable);
    authFetch(API + '/plans/' + id + '/schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule_enabled: !!enable, schedule_cron: cron || null }),
    })
      .then(() => {
        setToast('定时已保存');
        setTimeout(() => setToast(null), 2000);
      })
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
        setToast('计划名已保存');
        setTimeout(() => setToast(null), 2000);
      });
  };

  const removeCase = (pathToRemove) => {
    if (!window.confirm('确定从计划中移除该用例？')) return;
    const caseList = Array.isArray(plan.cases) ? plan.cases : (plan.cases_json ? (() => { try { return JSON.parse(plan.cases_json); } catch (_) { return []; } })() : []);
    const next = caseList.filter((p) => p !== pathToRemove);
    if (next.length === cases.length) return;
    authFetch(API + '/plans/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cases: next }),
    }).then(() => refreshPlan());
  };

  if (!plan) {
    return (
      <div className="loading-state">
        {planLoadError ? (
          <>
            <div className="empty-state__icon" aria-hidden>⚠</div>
            <p className="empty-state__title">加载失败</p>
            <p className="empty-state__hint">{planLoadError}，请检查网络或后端服务。</p>
            <Link to="/" className="btn btn-secondary">返回测试计划</Link>
          </>
        ) : (
          <>
            <div className="loading-state__icon" aria-hidden style={{ letterSpacing: '0.25em' }}>···</div>
            <p className="loading-state__text">加载计划详情</p>
          </>
        )}
      </div>
    );
  }

  const cases = Array.isArray(plan.cases) ? plan.cases : (() => {
    try {
      return plan.cases_json ? JSON.parse(plan.cases_json) : [];
    } catch (_) {
      return [];
    }
  })();

  const getCaseDisplayName = (c) => {
    const meta = plan.case_metadata && plan.case_metadata[c];
    return (meta && meta.name) || (plan.case_display_names && plan.case_display_names[c]) || fallbackCaseName(c);
  };
  const getCasePriority = (c) => {
    const meta = plan.case_metadata && plan.case_metadata[c];
    return (meta && meta.priority) || '—';
  };
  /** 优先级对应的 CSS 类名（用于颜色） */
  const getCasePriorityClass = (c) => {
    const p = getCasePriority(c);
    if (!p || p === '—') return '';
    const key = p.toUpperCase();
    if (key === 'P0' || key === '高') return 'plan-detail-priority--p0';
    if (key === 'P1' || key === '中') return 'plan-detail-priority--p1';
    if (key === 'P2' || key === '低') return 'plan-detail-priority--p2';
    if (key.startsWith('P')) return 'plan-detail-priority--p';
    return 'plan-detail-priority--other';
  };
  const getCaseDescription = (c) => {
    const meta = plan.case_metadata && plan.case_metadata[c];
    return (meta && meta.description) || (getCaseDisplayName(c)) || '—';
  };
  const getCaseCreatedAt = (c) => {
    const meta = plan.case_metadata && plan.case_metadata[c];
    return (meta && meta.createdAt) || '—';
  };
  const getCaseAuthor = (c) => {
    const meta = plan.case_metadata && plan.case_metadata[c];
    return (meta && meta.author) != null && String(meta.author).trim() !== '' ? meta.author : '—';
  };

  const filteredCases = cases.filter((c) => {
    const name = getCaseDisplayName(c);
    const pathMatch = !caseFilterPath.trim() || c.toLowerCase().includes(caseFilterPath.trim().toLowerCase());
    const nameMatch = !caseFilterName.trim() || name.toLowerCase().includes(caseFilterName.trim().toLowerCase());
    const priority = getCasePriority(c);
    const priorityMatch = !caseFilterPriority || priority === caseFilterPriority;
    return pathMatch && nameMatch && priorityMatch;
  });

  const totalPages = Math.max(1, Math.ceil(filteredCases.length / CASE_PAGE_SIZE));
  const pageIndex = Math.min(Math.max(1, casePage), totalPages);
  const paginatedCases = filteredCases.slice((pageIndex - 1) * CASE_PAGE_SIZE, pageIndex * CASE_PAGE_SIZE);

  return (
    <>
      {toast && <div className="plan-toast" role="status">{toast}</div>}
      <div className="breadcrumb">
        <Link to="/">测试计划</Link>
        <span className="sep">/</span>
        <span>{plan.name}</span>
      </div>
      <div className="page-header">
        <div className="page-header__title-wrap">
          {editingName ? (
            <>
              <input
                className="plan-detail-name-input"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && savePlanName()}
                autoFocus
              />
              <button type="button" className="btn btn-primary" onClick={savePlanName}>保存</button>
              <button type="button" className="btn btn-secondary" onClick={() => { setEditingName(false); setEditNameValue(plan.name); }}>取消</button>
            </>
          ) : (
            <>
              <h1 className="plan-detail-title">{plan.name}</h1>
              <button type="button" className="plan-detail-pencil" onClick={() => { setEditNameValue(plan.name); setEditingName(true); }} title="修改名称" aria-label="修改名称">✎</button>
            </>
          )}
        </div>
        <div className="card-actions">
          <Link to="/" className="btn btn-secondary">返回列表</Link>
          <Link to={'/reports?planId=' + id} className="btn btn-secondary">历史记录</Link>
        </div>
      </div>

      <div className="card card--compact plan-detail-meta-line">
        {plan.created_at && (
          <>
            <span className="card-muted">创建时间：</span>
            <span>{(() => {
                const s = String(plan.created_at).trim();
                const d = /^[\d-]+\s+[\d:]+$/.test(s) && !s.includes('Z') && !s.includes('+') ? new Date(s.replace(' ', 'T') + '+08:00') : new Date(s);
                return Number.isNaN(d.getTime()) ? plan.created_at : d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
              })()}</span>
            <span className="plan-detail-meta-line__sep" aria-hidden>·</span>
          </>
        )}
        <span className="card-muted">仓库：</span>
        <strong>{plan.repo_owner}/{plan.repo_name}</strong>
        <span className="card-muted plan-detail-meta-line__gap">分支：</span>
        <span>{plan.repo_branch || 'main'}</span>
      </div>

      <div className="card">
        <div className="plan-detail-case-section-head">
          <span className="section-title">用例（{cases.length} 个）</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={refreshCaseMetadata}
            disabled={caseMetaRefreshing || cases.length === 0}
          >
            {caseMetaRefreshing ? '刷新中…' : '刷新用例元数据'}
          </button>
        </div>
        <div className="plan-detail-case-filters">
          <label className="plan-detail-case-filter">
            <span className="plan-detail-case-filter__label">名称</span>
            <input
              type="text"
              className="plan-detail-case-filter__input"
              placeholder="按名称筛选"
              value={caseFilterName}
              onChange={(e) => { setCaseFilterName(e.target.value); setCasePage(1); }}
            />
          </label>
          <label className="plan-detail-case-filter">
            <span className="plan-detail-case-filter__label">路径</span>
            <input
              type="text"
              className="plan-detail-case-filter__input"
              placeholder="按路径筛选"
              value={caseFilterPath}
              onChange={(e) => { setCaseFilterPath(e.target.value); setCasePage(1); }}
            />
          </label>
          <label className="plan-detail-case-filter">
            <span className="plan-detail-case-filter__label">优先级</span>
            <select
              className="plan-detail-case-filter__input"
              value={caseFilterPriority}
              onChange={(e) => { setCaseFilterPriority(e.target.value); setCasePage(1); }}
            >
              <option value="">全部</option>
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="高">高</option>
              <option value="中">中</option>
              <option value="低">低</option>
            </select>
          </label>
        </div>
        <div className="plan-detail-case-table-wrap plan-detail-case-table-wrap--scroll">
          <table className="plan-detail-case-table">
            <thead>
              <tr>
                <th>用例描述</th>
                <th>用例优先级</th>
                <th>用例路径</th>
                <th>用例创建时间</th>
                <th>用例创建人</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCases.map((c) => (
                <tr key={c}>
                  <td className="plan-detail-case-desc-cell" title={getCaseDescription(c)}>{getCaseDescription(c)}</td>
                  <td title={getCasePriority(c) === '—' ? '可点击上方「刷新用例元数据」从仓库拉取优先级' : undefined}>
                    <span className={'plan-detail-priority ' + getCasePriorityClass(c)}>{getCasePriority(c)}</span>
                  </td>
                  <td className="plan-detail-case-path-cell" title={c}>{c}</td>
                  <td>{getCaseCreatedAt(c)}</td>
                  <td>{getCaseAuthor(c)}</td>
                  <td>
                    <button type="button" className="btn btn-secondary btn-danger btn-sm" onClick={() => removeCase(c)}>移除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredCases.length > 0 && (
          <div className="plan-detail-case-pagination">
            <span className="plan-detail-case-pagination__info">
              共 {filteredCases.length} 条，第 {pageIndex}/{totalPages} 页
            </span>
            <div className="plan-detail-case-pagination__btns">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={pageIndex <= 1}
                onClick={() => setCasePage((p) => Math.max(1, p - 1))}
              >
                上一页
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={pageIndex >= totalPages}
                onClick={() => setCasePage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card plan-detail-block">
        <div className="section-title">执行方式</div>
        <div className="plan-detail-exec-section">
          <div className="plan-detail-exec-block plan-detail-exec-block--column">
            <div className="plan-detail-exec-label">执行浏览器</div>
            <p className="card-muted" style={{ margin: '0 0 0.5rem 0', fontSize: '0.8125rem' }}>先选择浏览器，再选择该浏览器下的内核版本。不选则使用仓库 playwright 配置的默认项目。</p>
            {BROWSER_WITH_VERSIONS.map((browser) => (
              <div key={browser.id} className="plan-detail-browser-group">
                <div className="plan-detail-browser-group__name">{browser.label}</div>
                <div className="plan-detail-browser-group__versions">
                  {browser.versions.map((v) => (
                    <label key={v.id} className="plan-detail-version-check">
                      <input
                        type="checkbox"
                        checked={runBrowsers.includes(v.id)}
                        onChange={() => toggleRunBrowserVersion(v.id)}
                        disabled={browsersSaving}
                      />
                      <span>{v.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {runBrowsers.length > 0 && (
              <div className="plan-detail-selected-combos">
                <span className="plan-detail-selected-combos__label">已选组合：</span>
                {runBrowsers.map((versionId) => (
                  <span key={versionId} className="plan-detail-combo-chip">
                    {getVersionLabel(versionId)}
                    <button type="button" className="plan-detail-combo-chip__remove" onClick={() => removeRunBrowserVersion(versionId)} disabled={browsersSaving} aria-label="取消选中">×</button>
                  </span>
                ))}
              </div>
            )}
            {browsersSaving && <span className="card-muted" style={{ fontSize: '0.8125rem', display: 'block', marginTop: '0.35rem' }}>保存中…</span>}
          </div>
        </div>
      </div>

      <div className="card plan-detail-block">
        <div className="section-title">消息通知</div>
        <div className="plan-detail-notify-fields">
          <label className="auth-form__field plan-detail-notify-field">
            <span>群机器人 Webhook 地址</span>
            <input
              type="text"
              className="plan-detail-notify-input"
              value={notifyWebhookFocus ? notifyWebhookUrl : maskWebhookUrlForDisplay(notifyWebhookUrl)}
              onChange={(e) => setNotifyWebhookUrl(e.target.value)}
              onFocus={() => setNotifyWebhookFocus(true)}
              onBlur={() => setNotifyWebhookFocus(false)}
              placeholder="https://365.kdocs.cn/woa/api/v1/webhook/send?key=…"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="plan-detail-notify-toggles">
            <label className="plan-detail-notify-check">
              <input type="checkbox" checked={notifyOnCreated} onChange={(e) => setNotifyOnCreated(e.target.checked)} />
              <span>任务创建时通知</span>
            </label>
            <label className="plan-detail-notify-check">
              <input type="checkbox" checked={notifyOnSuccess} onChange={(e) => setNotifyOnSuccess(e.target.checked)} />
              <span>执行成功时通知</span>
            </label>
            <label className="plan-detail-notify-check">
              <input type="checkbox" checked={notifyOnFailure} onChange={(e) => setNotifyOnFailure(e.target.checked)} />
              <span>执行失败 / 取消时通知</span>
            </label>
          </div>
          <button type="button" className="btn btn-primary plan-detail-notify-save" onClick={saveNotify} disabled={notifySaving}>
            {notifySaving ? '保存中…' : '保存通知设置'}
          </button>
        </div>
      </div>

      <div className="card plan-detail-block">
        <div className="section-title">触发方式</div>
        <div className="plan-detail-exec-section">
          <div className="plan-detail-exec-block plan-detail-exec-block--column">
            <div className="plan-detail-trigger-cards">
              <div
                role="button"
                tabIndex={0}
                className={'plan-detail-trigger-card' + (triggerMode === 'immediate' ? ' plan-detail-trigger-card--active' : '')}
                onClick={() => triggerMode !== 'immediate' && (setTriggerMode('immediate'), saveSchedule({ enabled: false }))}
                onKeyDown={(e) => e.key === 'Enter' && triggerMode !== 'immediate' && (setTriggerMode('immediate'), saveSchedule({ enabled: false }))}
              >
                <div className="plan-detail-trigger-card__head">
                  <span className="plan-detail-trigger-card__radio" aria-hidden>
                    {triggerMode === 'immediate' ? '●' : '○'}
                  </span>
                  <span className="plan-detail-trigger-card__title">立即触发</span>
                </div>
                {triggerMode === 'immediate' && (
                  <div className="plan-detail-trigger-card__body">
                    <p className="plan-detail-trigger-card__hint">手动点击后立即执行一次计划</p>
                    <button type="button" className="btn btn-primary" onClick={startRun} disabled={running}>
                      {running ? '执行中...' : '立即执行'}
                    </button>
                  </div>
                )}
              </div>
              <div
                role="button"
                tabIndex={0}
                className={'plan-detail-trigger-card' + (triggerMode === 'scheduled' ? ' plan-detail-trigger-card--active' : '')}
                onClick={() => triggerMode !== 'scheduled' && setTriggerMode('scheduled')}
                onKeyDown={(e) => e.key === 'Enter' && triggerMode !== 'scheduled' && setTriggerMode('scheduled')}
              >
                <div className="plan-detail-trigger-card__head">
                  <span className="plan-detail-trigger-card__radio" aria-hidden>
                    {triggerMode === 'scheduled' ? '●' : '○'}
                  </span>
                  <span className="plan-detail-trigger-card__title">定时触发</span>
                </div>
                {triggerMode === 'scheduled' && (
                  <div className="plan-detail-trigger-card__body">
                    <div className="plan-detail-schedule-row">
                      <input
                        value={scheduleCron}
                        onChange={(e) => setScheduleCron(e.target.value)}
                        placeholder="0 9 * * *（分 时 日 月 周）"
                        className="plan-detail-cron-input"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button type="button" className="btn btn-secondary plan-detail-cron-save" onClick={(e) => { e.stopPropagation(); saveSchedule({ enabled: true }); }} disabled={scheduleSaving || !scheduleCron.trim()}>
                        {scheduleSaving ? '保存中...' : '保存'}
                      </button>
                    </div>
                    <p className="plan-detail-cron-link-hint">
                      不确定格式？可前往
                      <a href="https://crontab.guru/" target="_blank" rel="noopener noreferrer" className="plan-detail-cron-link" onClick={(e) => e.stopPropagation()}>cron 计算器</a>
                      调试表达式。
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
