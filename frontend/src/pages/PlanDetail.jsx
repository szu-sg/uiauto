import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

const API = '/api';

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
  // 计划名编辑
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  const refreshPlan = () => {
    fetch(API + '/plans/' + id).then((r) => r.json()).then((p) => {
      setPlan(p);
      setScheduleEnabled(!!p.schedule_enabled);
      setRunBrowsers(Array.isArray(p.run_browsers) ? [...p.run_browsers] : []);
      setTriggerMode(p.schedule_enabled ? 'scheduled' : 'immediate');
      setScheduleCron(p.schedule_cron || '');
    });
  };

  useEffect(() => {
    refreshPlan();
  }, [id]);

  const startRun = () => {
    setRunning(true);
    fetch(API + '/runs', {
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
    fetch(API + '/plans/' + id, {
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
    fetch(API + '/plans/' + id, {
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

  const saveSchedule = (opts = {}) => {
    const cron = scheduleCron.trim();
    const enable = opts.enabled !== undefined ? opts.enabled : scheduleEnabled;
    if (enable && !cron) return;
    setScheduleSaving(true);
    setScheduleEnabled(!!enable);
    fetch(API + '/plans/' + id + '/schedule', {
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
    fetch(API + '/plans/' + id, {
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
    const cases = typeof plan.cases === 'undefined' ? JSON.parse(plan.cases_json || '[]') : plan.cases;
    const next = cases.filter((p) => p !== pathToRemove);
    if (next.length === cases.length) return;
    fetch(API + '/plans/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cases: next }),
    }).then(() => refreshPlan());
  };

  if (!plan) {
    return (
      <div className="loading-state">
        <div className="loading-state__icon" aria-hidden style={{ letterSpacing: '0.25em' }}>···</div>
        <p className="loading-state__text">加载计划详情</p>
      </div>
    );
  }

  const cases = typeof plan.cases === 'undefined' ? JSON.parse(plan.cases_json || '[]') : plan.cases;

  const getCaseDisplayName = (c) => {
    const meta = plan.case_metadata && plan.case_metadata[c];
    return (meta && meta.name) || (plan.case_display_names && plan.case_display_names[c]) || fallbackCaseName(c);
  };
  const getCasePriority = (c) => {
    const meta = plan.case_metadata && plan.case_metadata[c];
    return (meta && meta.priority) || '—';
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
            <span>{new Date(plan.created_at).toLocaleString('zh-CN')}</span>
            <span className="plan-detail-meta-line__sep" aria-hidden>·</span>
          </>
        )}
        <span className="card-muted">仓库：</span>
        <strong>{plan.repo_owner}/{plan.repo_name}</strong>
        <span className="card-muted plan-detail-meta-line__gap">分支：</span>
        <span>{plan.repo_branch || 'main'}</span>
      </div>

      <div className="card">
        <div className="section-title">用例（{cases.length} 个）</div>
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
                <th>用例名称</th>
                <th>用例路径</th>
                <th>优先级</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCases.map((c) => {
                const meta = plan.case_metadata && plan.case_metadata[c];
                const name = getCaseDisplayName(c);
                const desc = meta && meta.description;
                const tags = meta && meta.tags;
                const priority = getCasePriority(c);
                return (
                  <tr key={c}>
                    <td>
                      <div>
                        <span title={desc || undefined}>{name}</span>
                        {tags && tags.length > 0 && (
                          <span style={{ display: 'inline-flex', gap: '0.2rem', marginLeft: '0.35rem', flexWrap: 'wrap' }}>
                            {tags.map((t) => (
                              <span key={t} style={{ fontSize: '0.65rem', padding: '0.05rem 0.25rem', background: '#3f3f46', borderRadius: 3 }}>{t}</span>
                            ))}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="plan-detail-case-path-cell" title={c}>{c}</td>
                    <td>{priority}</td>
                    <td>
                      <button type="button" className="btn btn-secondary btn-danger btn-sm" onClick={() => removeCase(c)}>移除</button>
                    </td>
                  </tr>
                );
              })}
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
