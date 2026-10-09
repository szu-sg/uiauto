import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import WorkbenchLayout from '../components/layout/WorkbenchLayout';
import RecorderStepList from '../components/recorder/RecorderStepList';
import RecorderWorkspace from '../components/recorder/RecorderWorkspace';
import StepEditModal from '../components/recorder/StepEditModal';
import StepsJsonEditModal from '../components/recorder/StepsJsonEditModal';
import AuthJsonEditModal from '../components/recorder/AuthJsonEditModal';
import ScriptEditor from '../components/recorder/ScriptEditor';
import RecordedRunPanel from '../components/recorder/RecordedRunPanel';
import LocalRunnerBanner from '../components/recorder/LocalRunnerBanner';
import { useLocalRunner } from '../context/LocalRunnerContext';
import SaveCaseReportModal from '../components/cases/SaveCaseReportModal';
import TrialRunResultModal from '../components/cases/TrialRunResultModal';
import CaseVersionHistoryMenu from '../components/cases/CaseVersionHistoryMenu';
import { useTrialRun } from '../hooks/useTrialRun';
import { useRecorderScript } from '../hooks/useRecorderScript';
import { authFetch } from '../authApi';
import { useToast } from '../context/ToastContext';
import { LANGUAGE_OPTIONS } from '../utils/recorderStepEdit';
import { scriptExtension, slugifyCaseName, exportRecordedCase } from '../utils/playwrightCodegen';
import { formatPlaywrightScript, normalizeScriptText, scriptNeedsFormat } from '../utils/scriptFormat';
import { inferNameFromScript } from '../utils/importCaseParser';
import { useTeamWrite } from '../hooks/useTeamWrite';

const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'];
const TAG_PRESETS = ['冒烟', '回归', '核心流程'];
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const LOGIN_PREFERENCE_OPTIONS = [
  { value: 'auto', label: '自动（Cookie 有效则用 Cookie，否则用计划环境）' },
  { value: 'case_context', label: '仅用用例 Cookie' },
  { value: 'plan_env', label: '仅用计划/环境账号' },
];

export default function CaseRecordedEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const canWrite = useTeamWrite();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [caseItem, setCaseItem] = useState(null);
  const [meta, setMeta] = useState({ name: '', description: '', priority: 'P0', tags: [] });
  const [tagInput, setTagInput] = useState('');
  const [steps, setSteps] = useState([]);
  const [language, setLanguage] = useState('typescript');
  const [editModal, setEditModal] = useState(null);
  const [stepsJsonOpen, setStepsJsonOpen] = useState(false);
  const [saveReport, setSaveReport] = useState(null);
  const [trialRunReport, setTrialRunReport] = useState(null);
  const { openSetup, ready: runnerReadyGlobal } = useLocalRunner();
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [restoringVersion, setRestoringVersion] = useState(null);
  const [authState, setAuthState] = useState(null);
  const [authDirty, setAuthDirty] = useState(false);
  const [authClearPending, setAuthClearPending] = useState(false);
  const [authJsonOpen, setAuthJsonOpen] = useState(false);

  const {
    script,
    setScript,
    scriptStale,
    regenerateFromSteps,
  } = useRecorderScript({
    steps,
    metaName: meta.name,
    language,
    device: DEFAULT_VIEWPORT,
  });

  const {
    running,
    run,
    runnerReady,
    startRun,
    cancelRun,
  } = useTrialRun({
    onDone: (data) => {
      setTrialRunReport(data);
    },
  });

  useEffect(() => {
    setLoading(true);
    authFetch(`/api/cases/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('加载失败'))))
      .then((item) => {
        setCaseItem(item);
        const m = item.metadata || {};
        setMeta({
          name: item.name || '',
          description: item.description || '',
          priority: item.priority || 'P0',
          tags: Array.isArray(m.tags) ? m.tags : (Array.isArray(item.tags) ? item.tags : []),
          login_preference: m.login_preference || 'auto',
        });
        setAuthDirty(false);
        setAuthClearPending(false);
        setSteps(Array.isArray(m.steps) ? m.steps : []);
        setLanguage(m.language || 'typescript');
        const rawScript = String(item.script || m.script || '').trim();
        if (scriptNeedsFormat(rawScript)) {
          setScript(formatPlaywrightScript(rawScript));
          showToast('已自动修复脚本换行，保存后生效', 3500);
        } else {
          setScript(normalizeScriptText(rawScript));
        }
      })
      .catch((e) => showToast(e.message || '加载用例失败'))
      .finally(() => setLoading(false));
  }, [id, showToast, setScript]);

  useEffect(() => {
    if (!id || loading) return;
    authFetch(`/api/cases/${id}/auth`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!authDirty) setAuthState(data);
      })
      .catch(() => {
        if (!authDirty) setAuthState(null);
      });
  }, [id, loading, authDirty]);

  const caseSource = caseItem?.source || caseItem?.case_source || caseItem?.metadata?.source || 'recorded';
  const isScriptFirstCase = caseSource === 'imported' || caseSource === 'mcp' || caseSource === 'manual';

  const buildMetadata = () => {
    const base = {
      source: caseSource,
      tags: meta.tags,
      language,
      script,
      scriptStale,
      steps,
    };
    if (!isScriptFirstCase) {
      base.login_preference = meta.login_preference || 'auto';
    }
    return base;
  };

  const loadVersions = () => {
    setVersionsLoading(true);
    authFetch(`/api/cases/${id}/versions`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('加载版本失败'))))
      .then((items) => setVersions(Array.isArray(items) ? items : []))
      .catch(() => setVersions([]))
      .finally(() => setVersionsLoading(false));
  };

  useEffect(() => {
    if (!id || loading) return;
    loadVersions();
  }, [id, loading, caseItem?.current_version]);

  const handleGenerateScript = () => {
    regenerateFromSteps(() => showToast('已从步骤生成脚本'));
  };

  const addTag = (tag) => {
    const t = (tag || tagInput).trim();
    if (!t || meta.tags.includes(t)) return;
    setMeta((m) => ({ ...m, tags: [...m.tags, t] }));
    setTagInput('');
  };

  const removeTag = (tag) => {
    setMeta((m) => ({ ...m, tags: m.tags.filter((t) => t !== tag) }));
  };

  const saveCase = async () => {
    const name = meta.name.trim();
    if (!name) {
      showToast('请填写用例名称');
      return;
    }
    if (!steps.length && !script.trim()) {
      showToast('请添加步骤或填写脚本');
      return;
    }
    if (!script.trim()) {
      showToast('脚本不能为空');
      return;
    }

    setSaving(true);
    try {
      const body = {
        name,
        description: meta.description.trim() || null,
        priority: meta.priority,
        tags: meta.tags,
        script,
        metadata: buildMetadata(),
      };
      if (!isScriptFirstCase) {
        body.login_preference = meta.login_preference || 'auto';
      }
      const clearingAuth = authClearPending;
      if (clearingAuth) body.clear_auth = true;
      else if (authDirty && authState) body.storageState = authState;
      const r = await authFetch(`/api/cases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '保存失败');
      setCaseItem(data);
      setAuthDirty(false);
      setAuthClearPending(false);
      if (clearingAuth) setAuthState(null);
      loadVersions();
      const savedPath = data.path || caseItem?.path;
      setSaveReport({
        name,
        summary: data.summary || {
          stepsCount: steps.length,
          cookieCount: data.metadata?.cookieCount ?? caseItem?.metadata?.cookieCount ?? 0,
          scriptSaved: Boolean(script.trim()),
          authSaved: data.metadata?.hasAuth ?? (data.metadata?.cookieCount ?? caseItem?.metadata?.cookieCount ?? 0) > 0,
          scriptPath: savedPath || '—',
          authPath: (data.metadata?.hasAuth || (data.metadata?.cookieCount ?? 0) > 0) && savedPath
            ? `${String(savedPath).replace(/\.[^.]+$/, '')}.auth.json`
            : null,
        },
      });
    } catch (e) {
      showToast(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const restoreVersion = async (version) => {
    if (!window.confirm(`确定回滚到 v${version}？将基于该版本脚本生成新版本。`)) return;
    setRestoringVersion(version);
    try {
      const r = await authFetch(`/api/cases/${id}/versions/${version}/restore`, { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '回滚失败');
      const item = data.case || data;
      setCaseItem(item);
      const m = item.metadata || {};
      setScript(item.script || m.script || '');
      loadVersions();
      showToast(`已回滚至 v${version}`);
    } catch (e) {
      showToast(e.message || '回滚失败');
    } finally {
      setRestoringVersion(null);
    }
  };

  const resolveAuthForRun = async () => {
    try {
      const r = await authFetch(`/api/cases/${id}/auth`);
      if (r.ok) return await r.json();
    } catch (_) {
      /* 无 Cookie 时仍可试跑 */
    }
    return null;
  };

  const trialRun = async () => {
    if (!script.trim()) {
      showToast('脚本不能为空');
      return;
    }
    if (language === 'python') {
      showToast('试跑暂不支持 Python，请切换为 TypeScript 或 JavaScript');
      return;
    }
    const runName = meta.name.trim() || inferNameFromScript(script) || '试跑用例';
    try {
      const authState = await resolveAuthForRun();
      await startRun({
        caseName: runName,
        script: normalizeScriptText(script),
        filename: `case.${scriptExtension(language)}`,
        storageState: authState || undefined,
      });
    } catch (e) {
      if (e.code !== 'LOCAL_RUNNER_MISSING') showToast(e.message || '试跑启动失败');
    }
  };

  const exportCase = async () => {
    if (!script.trim()) {
      showToast('脚本不能为空');
      return;
    }
    const slug = slugifyCaseName(meta.name || caseItem?.path || 'recorded');
    let storageState = null;
    try {
      const r = await authFetch(`/api/cases/${id}/auth`);
      if (r.ok) storageState = await r.json();
    } catch (_) {
      /* 无 Cookie 时仍导出脚本 */
    }
    const { authExported } = exportRecordedCase({
      slug,
      language,
      script,
      storageState,
    });
    showToast(authExported ? '已导出脚本与 Cookie' : '已导出脚本，无 Cookie 文件', 2800);
  };

  const updateStepAt = (index, step) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? step : s)));
  };

  const deleteStep = (index) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const moveStep = (from, to) => {
    setSteps((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const insertStepAt = (index, step) => {
    setSteps((prev) => {
      const next = [...prev];
      next.splice(index, 0, step);
      return next;
    });
  };

  if (loading) {
    return (
      <WorkbenchLayout className="recorder-page wb-page--fill">
        <div className="recorder-shell"><p className="recorder-empty">加载中…</p></div>
      </WorkbenchLayout>
    );
  }

  if (!caseItem) {
    return (
      <WorkbenchLayout className="recorder-page wb-page--fill">
        <div className="recorder-shell">
          <p className="recorder-empty">用例不存在</p>
          <Link to="/cases" className="btn btn-secondary btn-sm">返回用例库</Link>
        </div>
      </WorkbenchLayout>
    );
  }

  const metaPanel = (
    <div className="recorder-panel recorder-panel--meta">
      <div className="recorder-panel__header">
        <h2 className="recorder-panel__title">用例信息</h2>
      </div>
      <div className="recorder-panel__body">
        <label className="recorder-field">
          <span>名称</span>
          <input
            className="plan-detail-field"
            value={meta.name}
            onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
          />
        </label>
        <label className="recorder-field">
          <span>备注</span>
          <textarea
            className="plan-detail-field recorder-field__textarea"
            placeholder="用例说明、测试要点等"
            rows={3}
            value={meta.description}
            onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))}
          />
        </label>
        <div className="recorder-field">
          <span>优先级</span>
          <div className="recorder-priority">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                className={`recorder-priority__btn${meta.priority === p ? ' is-active' : ''}`}
                onClick={() => setMeta((m) => ({ ...m, priority: p }))}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        {isScriptFirstCase ? (
          <p className="recorder-field recorder-field__hint">
            导入/脚本用例：登录与地址由脚本或测试计划执行环境提供，无需在此配置 Cookie。
          </p>
        ) : (
          <>
            <div className="recorder-field">
              <span>登录方式</span>
              <select
                className="plan-detail-field"
                value={meta.login_preference || 'auto'}
                onChange={(e) => setMeta((m) => ({ ...m, login_preference: e.target.value }))}
                disabled={!canWrite}
              >
                {LOGIN_PREFERENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="recorder-field">
              <span>登录 Cookie</span>
              <div className="recorder-auth-row">
                <span className="recorder-auth-row__meta">
                  {authClearPending
                    ? '已标记清空，保存后生效'
                    : (authState?.cookies?.length
                      ? `${authState.cookies.length} 条（含 wps_sid 等）`
                      : '未配置，计划执行将使用环境账号')}
                  {authDirty && !authClearPending ? ' · 未保存' : ''}
                </span>
                {canWrite && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setAuthJsonOpen(true)}
                  >
                    编辑 Cookie
                  </button>
                )}
              </div>
            </div>
          </>
        )}
        <div className="recorder-field">
          <span>标签</span>
          <div className="plan-detail-field recorder-tags-input">
            {meta.tags.map((t) => (
              <span key={t} className="recorder-tag">
                {t}
                <button type="button" aria-label={`移除 ${t}`} onClick={() => removeTag(t)}>×</button>
              </span>
            ))}
            <input
              placeholder={meta.tags.length ? '' : '回车添加'}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
          </div>
          <div className="recorder-tag-presets">
            {TAG_PRESETS.map((t) => (
              <button key={t} type="button" className="recorder-tag-preset" onClick={() => addTag(t)}>{t}</button>
            ))}
          </div>
        </div>
      </div>
      {canWrite && (
        <div className="recorder-panel__footer">
          <button type="button" className="btn btn-primary" disabled={saving} onClick={saveCase}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      )}
    </div>
  );

  const stepsPanel = (
    <div className="recorder-panel recorder-panel--steps">
      <div className="recorder-panel__header">
        <div className="recorder-panel__title-row">
          <h2 className="recorder-panel__title">录制步骤</h2>
          <span className="recorder-panel__badge">{steps.length}</span>
        </div>
        {canWrite && (
        <div className="recorder-panel__header-actions">
          <button
            type="button"
            className="recorder-btn recorder-btn--ghost"
            onClick={() => setEditModal({ mode: 'insert', index: steps.length, step: null })}
          >
            配置 Action
          </button>
          <button
            type="button"
            className="recorder-btn recorder-btn--ghost"
            onClick={() => setStepsJsonOpen(true)}
          >
            JSON 编辑
          </button>
          <button
            type="button"
            className="recorder-btn recorder-btn--ghost recorder-btn--accent"
            disabled={!steps.length}
            onClick={handleGenerateScript}
          >
            生成脚本
          </button>
        </div>
        )}
      </div>
      <RecorderStepList
        steps={steps}
        onEdit={canWrite ? (index) => setEditModal({ mode: 'edit', index, step: steps[index] }) : undefined}
        onDelete={canWrite ? deleteStep : undefined}
        onInsert={canWrite ? (index) => setEditModal({ mode: 'insert', index, step: null }) : undefined}
        onMove={canWrite ? moveStep : undefined}
        onAddAtEnd={canWrite ? () => setEditModal({ mode: 'insert', index: steps.length, step: null }) : undefined}
      />
    </div>
  );

  const codePanel = (
    <div className="recorder-panel recorder-panel--code">
      <div className="recorder-panel__header recorder-panel__header--code">
        <div className="recorder-panel__title-row">
          <h2 className="recorder-panel__title">脚本</h2>
          {scriptStale && (
            <span className="recorder-panel__stale-badge" title="脚本与当前步骤不一致，可点击「生成脚本」同步">
              与步骤不同步
            </span>
          )}
        </div>
        <div className="recorder-panel__header-actions recorder-panel__header-actions--code">
          <select
            className="plan-detail-field"
            value={language}
            aria-label="脚本语言"
            onChange={(e) => setLanguage(e.target.value)}
          >
            {LANGUAGE_OPTIONS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
          <RecordedRunPanel
            variant="toolbar"
            readOnly={!canWrite}
            running={running}
            run={run}
            runnerReady={runnerReady ?? runnerReadyGlobal}
            onRun={trialRun}
            onCancel={cancelRun}
            onSetupRunner={() => openSetup('run')}
            disabled={!script.trim()}
          />
          {canWrite && (
          <CaseVersionHistoryMenu
            versions={versions}
            currentVersion={caseItem.current_version}
            loading={versionsLoading}
            restoringVersion={restoringVersion}
            onRestore={restoreVersion}
          />
          )}
        </div>
      </div>
      <ScriptEditor
        value={script}
        onChange={setScript}
        readOnly={!canWrite}
      />
    </div>
  );

  return (
    <WorkbenchLayout className="recorder-page wb-page--fill">
      <div className="recorder-shell">
        <LocalRunnerBanner compact />
        <header className="recorder-toolbar recorder-toolbar--edit">
          <div className="recorder-toolbar__primary">
            <Link to="/cases" className="recorder-btn recorder-btn--ghost">← 用例库</Link>
            {!canWrite && (
              <span className="recorder-toolbar__readonly-badge">只读查看</span>
            )}
            <span className="recorder-toolbar__case-name">
              {meta.name || caseItem.path}
              {caseSource === 'imported' && (
                <span className="recorder-toolbar__source-tag">导入</span>
              )}
            </span>
          </div>
          <div className="recorder-toolbar__secondary">
            <Link
              to="/local-runner"
              className={`recorder-btn recorder-btn--ghost${runnerReady === false ? ' recorder-btn--warn' : ''}`}
            >
              {runnerReady ? '本机运行器 ✓' : '配置本机运行器'}
            </Link>
            <Link to="/cases/runs" className="recorder-btn recorder-btn--ghost">调试历史</Link>
            <button
              type="button"
              className="recorder-btn recorder-btn--ghost"
              onClick={exportCase}
            >
              导出
            </button>
          </div>
        </header>
        <RecorderWorkspace metaPanel={metaPanel} stepsPanel={stepsPanel} codePanel={codePanel} />
      </div>
      <StepEditModal
        open={!!editModal}
        mode={editModal?.mode}
        step={editModal?.step}
        insertIndex={editModal?.index}
        stepsCount={steps.length}
        onClose={() => setEditModal(null)}
        onSave={(step) => {
          if (editModal?.mode === 'edit') updateStepAt(editModal.index, step);
          else insertStepAt(editModal?.index ?? steps.length, step);
          setEditModal(null);
          showToast('步骤已更新');
        }}
        onError={(msg) => showToast(msg)}
      />
      <AuthJsonEditModal
        open={authJsonOpen}
        storageState={authState}
        onClose={() => setAuthJsonOpen(false)}
        onSave={(next) => {
          setAuthState(next);
          setAuthDirty(true);
          setAuthClearPending(false);
          setAuthJsonOpen(false);
          showToast('Cookie 已更新，请保存用例');
        }}
        onClear={() => {
          setAuthClearPending(true);
          setAuthDirty(true);
          setAuthState(null);
          setAuthJsonOpen(false);
          showToast('已标记清空 Cookie，保存用例后生效');
        }}
        onError={(msg) => showToast(msg)}
      />
      <StepsJsonEditModal
        open={stepsJsonOpen}
        steps={steps}
        onClose={() => setStepsJsonOpen(false)}
        onSave={(nextSteps) => {
          setSteps(nextSteps);
          setStepsJsonOpen(false);
          showToast('已应用 JSON 步骤');
        }}
        onError={(msg) => showToast(msg)}
      />
      <SaveCaseReportModal
        open={!!saveReport}
        caseName={saveReport?.name}
        summary={saveReport?.summary}
        onClose={() => setSaveReport(null)}
      />
      <TrialRunResultModal
        open={!!trialRunReport}
        caseName={meta.name.trim() || caseItem.path}
        result={trialRunReport}
        onClose={() => setTrialRunReport(null)}
      />
    </WorkbenchLayout>
  );
}
