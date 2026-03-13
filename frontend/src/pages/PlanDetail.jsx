import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

const API = '/api';

const SCHEDULE_PRESETS = [
  { label: '每天 9:00', cron: '0 9 * * *' },
  { label: '每天 0:00', cron: '0 0 * * *' },
  { label: '每小时', cron: '0 * * * *' },
  { label: '每 30 分钟', cron: '30 * * * *' },
  { label: '自定义', cron: 'custom' },
];

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
  const [refreshingNames, setRefreshingNames] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleCron, setScheduleCron] = useState('');
  const [schedulePreset, setSchedulePreset] = useState('0 9 * * *');
  const [scheduleSaving, setScheduleSaving] = useState(false);

  // 计划名编辑
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  const refreshPlan = () => {
    fetch(API + '/plans/' + id).then((r) => r.json()).then((p) => {
      setPlan(p);
      setScheduleEnabled(!!p.schedule_enabled);
      const match = SCHEDULE_PRESETS.find((x) => x.cron !== 'custom' && x.cron === (p.schedule_cron || ''));
      if (match) {
        setSchedulePreset(match.cron);
        setScheduleCron(match.cron);
      } else {
        setSchedulePreset('custom');
        setScheduleCron(p.schedule_cron || '0 9 * * *');
      }
    });
  };

  useEffect(() => {
    refreshPlan();
  }, [id]);

  const refreshCaseNames = () => {
    setRefreshingNames(true);
    fetch(API + '/plans/' + id + '/refresh-case-names', { method: 'POST' })
      .then((r) => r.ok ? r.json() : {})
      .then(() => refreshPlan())
      .finally(() => setRefreshingNames(false));
  };

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

  const saveSchedule = () => {
    const cron = schedulePreset === 'custom' ? scheduleCron.trim() : schedulePreset;
    if (scheduleEnabled && !cron) return;
    setScheduleSaving(true);
    fetch(API + '/plans/' + id + '/schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule_enabled: scheduleEnabled, schedule_cron: cron || null }),
    })
      .then(() => {})
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
      });
  };

  const removeCase = (pathToRemove) => {
    const cases = typeof plan.cases === 'undefined' ? JSON.parse(plan.cases_json || '[]') : plan.cases;
    const next = cases.filter((p) => p !== pathToRemove);
    if (next.length === cases.length) return;
    fetch(API + '/plans/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cases: next }),
    }).then(() => refreshPlan());
  };

  if (!plan) return <p className="card-muted">加载中...</p>;

  const cases = typeof plan.cases === 'undefined' ? JSON.parse(plan.cases_json || '[]') : plan.cases;

  return (
    <>
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
          <Link to={'/reports?planId=' + id} className="btn btn-primary">执行历史</Link>
        </div>
      </div>

      {plan.created_at && (
        <div className="card card--compact">
          <span className="card-muted">创建时间：</span>
          <span style={{ marginLeft: '0.5rem' }}>{new Date(plan.created_at).toLocaleString('zh-CN')}</span>
        </div>
      )}

      <div className="card">
        <div className="section-title">仓库</div>
        <p style={{ margin: 0 }}>
          <strong>{plan.repo_owner}/{plan.repo_name}</strong>
          <span className="card-muted" style={{ marginLeft: '0.5rem' }}>分支 {plan.repo_branch || 'main'}</span>
        </p>
      </div>

      <div className="card">
        <div className="section-title">用例（{cases.length} 个）</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={refreshCaseNames} disabled={refreshingNames || cases.length === 0} style={{ fontSize: '0.8125rem' }}>{refreshingNames ? '同步中…' : '同步用例名'}</button>
        </div>
        <div className="plan-detail-case-table-wrap plan-detail-case-table-wrap--scroll">
          <table className="plan-detail-case-table">
            <thead>
              <tr>
                <th>用例名称</th>
                <th>用例路径</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c}>
                  <td>{(plan.case_display_names && plan.case_display_names[c]) || fallbackCaseName(c)}</td>
                      <td className="plan-detail-case-path-cell" title={c}>{c}</td>
                      <td>
                        <button type="button" className="btn btn-secondary btn-danger btn-sm" onClick={() => removeCase(c)}>删除</button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="section-title">执行方式</div>
        <div className="plan-detail-exec-section">
          <div className="plan-detail-exec-block">
            <div className="plan-detail-exec-label">定时执行</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} />
                <span>启用</span>
              </label>
              {scheduleEnabled && (
                <>
                  <select
                    value={schedulePreset}
                    onChange={(e) => setSchedulePreset(e.target.value)}
                    style={{
                      padding: '0.4rem 0.6rem',
                      borderRadius: 6,
                      border: '1px solid #3f3f46',
                      background: '#27272a',
                      color: '#e4e4e7',
                      fontSize: '0.875rem',
                    }}
                  >
                    {SCHEDULE_PRESETS.map((p) => (
                      <option key={p.cron} value={p.cron}>{p.label}</option>
                    ))}
                  </select>
                  {schedulePreset === 'custom' && (
                    <input
                      value={scheduleCron}
                      onChange={(e) => setScheduleCron(e.target.value)}
                      placeholder="0 9 * * *"
                      style={{
                        width: 140,
                        padding: '0.4rem 0.6rem',
                        border: '1px solid #3f3f46',
                        borderRadius: 6,
                        background: '#27272a',
                        color: '#e4e4e7',
                        fontSize: '0.875rem',
                        fontFamily: 'monospace',
                      }}
                    />
                  )}
                  <span className="card-muted" style={{ fontSize: '0.8rem' }}>
                    {schedulePreset !== 'custom' ? SCHEDULE_PRESETS.find((p) => p.cron === schedulePreset)?.label : 'Cron 表达式'}
                  </span>
                  <button type="button" className="btn btn-secondary" onClick={saveSchedule} disabled={scheduleSaving} style={{ marginLeft: '0.5rem' }}>
                    {scheduleSaving ? '保存中...' : '保存'}
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="plan-detail-exec-block">
            <div className="plan-detail-exec-label">立即执行</div>
            <button type="button" className="btn btn-primary" onClick={startRun} disabled={running}>
              {running ? '执行中...' : '立即执行'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
