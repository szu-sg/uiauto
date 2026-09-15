import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import WorkbenchLayout from '../components/layout/WorkbenchLayout';
import RecorderStepList from '../components/recorder/RecorderStepList';
import RecorderWorkspace from '../components/recorder/RecorderWorkspace';
import StepEditModal from '../components/recorder/StepEditModal';
import StepsJsonEditModal from '../components/recorder/StepsJsonEditModal';
import ScriptEditor from '../components/recorder/ScriptEditor';
import RecordedRunPanel from '../components/recorder/RecordedRunPanel';
import LocalRunnerBanner from '../components/recorder/LocalRunnerBanner';
import { useLocalRunner } from '../context/LocalRunnerContext';
import SaveCaseReportModal from '../components/cases/SaveCaseReportModal';
import TrialRunResultModal from '../components/cases/TrialRunResultModal';
import { useRecorderSession } from '../hooks/useRecorderSession';
import { useTrialRun } from '../hooks/useTrialRun';
import { useRecorderScript } from '../hooks/useRecorderScript';
import { authFetch } from '../authApi';
import { useToast } from '../context/ToastContext';
import { LANGUAGE_OPTIONS } from '../utils/recorderStepEdit';
import { scriptExtension, slugifyCaseName, exportRecordedCase } from '../utils/playwrightCodegen';
import { inferNameFromScript } from '../utils/importCaseParser';
import { normalizeScriptText } from '../utils/scriptFormat';

const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'];
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

export default function CaseRecord() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const folderIdParam = searchParams.get('folder_id');
  const saveFolderId = useMemo(() => {
    const n = Number(folderIdParam);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [folderIdParam]);
  const { showToast } = useToast();
  const {
    session,
    loading,
    status,
    steps,
    storageState,
    cookieCount,
    sessionError,
    wsError,
    sendCommand,
    deleteStep,
    moveStep,
    updateStepAt,
    insertStepAt,
    reconnect,
    syncStorageState,
    replaceSteps,
  } = useRecorderSession();

  const [meta, setMeta] = useState({
    name: '',
    description: '',
    priority: 'P0',
    tags: [],
  });
  const [tagInput, setTagInput] = useState('');
  const [language, setLanguage] = useState('typescript');
  const [saving, setSaving] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [stepsJsonOpen, setStepsJsonOpen] = useState(false);
  const [saveReport, setSaveReport] = useState(null);
  const [savedCaseId, setSavedCaseId] = useState(null);
  const [trialRunReport, setTrialRunReport] = useState(null);
  const { openSetup, ready: runnerReadyGlobal } = useLocalRunner();

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

  const connectionState = useMemo(() => {
    if (loading) return { tone: 'loading', text: '正在初始化录制会话…' };
    if (sessionError) return { tone: 'error', text: sessionError };
    if (wsError) return { tone: 'error', text: wsError };
    if (!status.extConnected) return { tone: 'warn', text: '插件未连接 — 请先安装扩展并保持本页打开' };
    if (status.recording) {
      return {
        tone: 'active',
        text: status.paused
          ? '录制中（已暂停）'
          : `正在录制，请在目标页面操作${cookieCount > 0 ? ` · 已同步 wps_sid 等 ${cookieCount} 条` : ''}`,
      };
    }
    if (!meta.name.trim()) {
      return { tone: 'ok', text: '插件已连接 — 可开始录制，保存前请填写用例名称' };
    }
    return { tone: 'ok', text: '插件已连接，可以开始录制' };
  }, [loading, sessionError, wsError, status, meta.name, cookieCount]);

  const canStartRecording = !loading && !sessionError && status.extConnected;
  const metaLocked = status.recording;

  const handleGenerateScript = () => {
    regenerateFromSteps(() => showToast('已从步骤生成脚本'));
  };

  const startRecording = () => sendCommand('start');

  const openInsert = (index) => {
    setEditModal({ mode: 'insert', index, step: null });
  };

  const openEdit = (index) => {
    setEditModal({ mode: 'edit', index, step: steps[index] });
  };

  const handleEditSave = (step) => {
    if (editModal?.mode === 'edit') {
      updateStepAt(editModal.index, step);
      showToast('步骤已更新');
    } else {
      insertStepAt(editModal?.index ?? steps.length, step);
      showToast('步骤已添加');
    }
    setEditModal(null);
  };

  const exportScript = async () => {
    if (!script.trim()) {
      showToast('脚本不能为空');
      return;
    }
    const slug = slugifyCaseName(meta.name || 'recorded');
    const authState = await resolveAuthForRun();
    const { authExported } = exportRecordedCase({
      slug,
      language,
      script,
      storageState: authState,
    });
    showToast(authExported ? '已导出脚本与 Cookie' : '已导出脚本，未同步到 Cookie', 2800);
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

  const buildMetadata = () => ({
    source: 'recorded',
    tags: meta.tags,
    language,
    script,
    scriptStale,
    steps,
  });

  const resolveAuthForRun = async () => {
    const synced = await syncStorageState();
    if (synced?.cookies?.length) return synced;
    if (storageState?.cookies?.length) return storageState;
    return null;
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
      const authState = await resolveAuthForRun();
      if (!authState?.cookies?.length) {
        showToast('未同步到 wps_sid，请确认已在 Chrome 登录被测站且扩展已更新到 v1.2.6', 4000);
      }
      const payload = {
        name,
        description: meta.description.trim() || null,
        priority: meta.priority,
        tags: meta.tags,
        script,
        metadata: buildMetadata(),
        storageState: authState || undefined,
      };
      let r;
      if (savedCaseId) {
        r = await authFetch(`/api/cases/${savedCaseId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        r = await authFetch('/api/cases', {
          method: 'POST',
          body: JSON.stringify({
            items: [{
              ...payload,
              source: 'recorded',
              ...(saveFolderId ? { folder_id: saveFolderId } : {}),
            }],
          }),
        });
      }
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `保存失败 (${r.status})`);
      const savedId = savedCaseId || data.items?.[0]?.id || data.id;
      if (savedId) setSavedCaseId(Number(savedId));
      if (data.items?.[0]?.updated) {
        showToast('已更新同名用例，未新建副本', 3200);
      }
      const savedPath = data.items?.[0]?.path || data.path;
      const summary = data.items?.[0]?.summary || data.summary;
      setSaveReport({
        id: savedId,
        name,
        summary: summary || {
          stepsCount: steps.length,
          cookieCount: authState?.cookies?.length ?? 0,
          scriptSaved: Boolean(script.trim()),
          authSaved: (authState?.cookies?.length ?? 0) > 0,
          scriptPath: savedPath || '—',
          authPath: authState?.cookies?.length && savedPath
            ? `${String(savedPath).replace(/\.[^.]+$/, '')}.auth.json`
            : null,
        },
      });
    } catch (e) {
      showToast(e?.message || '保存失败，请确认后端已启动');
    } finally {
      setSaving(false);
    }
  };

  const closeSaveReport = () => setSaveReport(null);

  const goToSavedCase = () => {
    if (saveReport?.id) navigate(`/cases/${saveReport.id}/edit`);
    else navigate('/cases?tab=recorded');
    setSaveReport(null);
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

  const canSave = meta.name.trim() && (steps.length > 0 || script.trim());

  const metaPanel = (
    <div className={`recorder-panel recorder-panel--meta${metaLocked ? ' recorder-panel--locked' : ''}`}>
      <div className="recorder-panel__header">
        <h2 className="recorder-panel__title">用例信息</h2>
      </div>
      <div className="recorder-panel__body">
        <label className="recorder-field">
          <span>名称 <em className="recorder-field__req">保存时必填</em></span>
          <input
            className="plan-detail-field"
            placeholder="知识库首页-深度研究入口"
            value={meta.name}
            disabled={metaLocked}
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
            disabled={metaLocked}
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
                disabled={metaLocked}
                onClick={() => setMeta((m) => ({ ...m, priority: p }))}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
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
              placeholder={meta.tags.length ? '' : '回车添加标签'}
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
      <div className="recorder-panel__footer">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || !canSave}
          onClick={saveCase}
        >
          {saving ? '保存中…' : '保存录制用例'}
        </button>
      </div>
    </div>
  );

  const stepsPanel = (
    <div className="recorder-panel recorder-panel--steps">
      <div className="recorder-panel__header">
        <div className="recorder-panel__title-row">
          <h2 className="recorder-panel__title">录制步骤</h2>
          <span className="recorder-panel__badge">{steps.length}</span>
        </div>
        <div className="recorder-panel__header-actions">
          <button
            type="button"
            className="recorder-btn recorder-btn--ghost"
            onClick={() => openInsert(steps.length)}
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
      </div>
      <RecorderStepList
        steps={steps}
        onEdit={openEdit}
        onDelete={deleteStep}
        onInsert={openInsert}
        onMove={moveStep}
        onAddAtEnd={() => openInsert(steps.length)}
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
            running={running}
            run={run}
            runnerReady={runnerReady ?? runnerReadyGlobal}
            onRun={trialRun}
            onCancel={cancelRun}
            onSetupRunner={() => openSetup('run')}
            disabled={!script.trim()}
          />
        </div>
      </div>
      <ScriptEditor
        value={script}
        onChange={setScript}
        readOnly={false}
      />
    </div>
  );

  return (
    <WorkbenchLayout className="recorder-page wb-page--fill">
      <div className="recorder-shell">
        <LocalRunnerBanner compact />
        {(!loading && !status.extConnected) && (
          <div className="recorder-guide" role="alert">
            <div className="recorder-guide__icon" aria-hidden>🧩</div>
            <div className="recorder-guide__body">
              <p className="recorder-guide__title">
                {sessionError || wsError ? '录制通道不可用' : '浏览器扩展未连接'}
              </p>
              <p className="recorder-guide__text">
                {sessionError || wsError
                  ? (sessionError || wsError)
                  : '要开始录制用例，需要先安装浏览器扩展并在本页保持打开。'}
              </p>
              <ol className="recorder-guide__steps">
                {!(sessionError || wsError) && (
                  <>
                    <li>点击「安装插件」下载扩展（Chrome 右上角 → 扩展程序 → 开启开发者模式 → 加载已解压的扩展程序）</li>
                    <li>选择 <code>extension/</code> 目录并加载</li>
                    <li>保持本页打开，扩展会自动建立连接</li>
                  </>
                )}
              </ol>
            </div>
            <div className="recorder-guide__actions">
              <Link to="/extension" className="btn btn-secondary btn-sm">安装插件</Link>
              <button type="button" className="btn btn-ghost btn-sm" onClick={reconnect}>重新连接</button>
            </div>
          </div>
        )}
        <header className="recorder-toolbar">
          <div className="recorder-toolbar__primary">
            <button
              type="button"
              className="recorder-btn recorder-btn--start"
              disabled={!canStartRecording}
              onClick={startRecording}
            >
              ▶ 开始
            </button>
            <button
              type="button"
              className="recorder-btn recorder-btn--pause"
              disabled={!status.recording}
              onClick={() => sendCommand('pause')}
            >
              ⏸ 暂停
            </button>
            <button
              type="button"
              className="recorder-btn recorder-btn--stop"
              disabled={!status.recording && !status.paused}
              onClick={() => sendCommand('stop')}
            >
              ⏹ 停止
            </button>
            <span className="recorder-toolbar__sep" />
            <button type="button" className="recorder-btn recorder-btn--ghost" disabled={!steps.length} onClick={() => sendCommand('clear')}>
              清空
            </button>
            <button type="button" className="recorder-btn recorder-btn--ghost" disabled={!script.trim()} onClick={exportScript}>
              导出
            </button>
          </div>

          <div className={`recorder-status recorder-status--${connectionState.tone}`} aria-live="polite">
            <span className="recorder-status__dot" aria-hidden />
            <span className="recorder-status__text">{connectionState.text}</span>
            {session?.sessionId && !sessionError && (
              <span className="recorder-status__meta">#{session.sessionId}</span>
            )}
          </div>

          <div className="recorder-toolbar__secondary">
            <Link
              to="/local-runner"
              className={`recorder-btn recorder-btn--ghost${runnerReady === false ? ' recorder-btn--warn' : ''}`}
            >
              {runnerReady ? '本机运行器 ✓' : '配置本机运行器'}
            </Link>
            <Link to="/cases/runs" className="recorder-btn recorder-btn--ghost">调试历史</Link>
            <Link to="/extension" className="recorder-btn recorder-btn--ghost">安装插件</Link>
            <button type="button" className="recorder-btn recorder-btn--ghost" onClick={reconnect}>重连</button>
          </div>
        </header>

        <RecorderWorkspace
          metaPanel={metaPanel}
          stepsPanel={stepsPanel}
          codePanel={codePanel}
        />
      </div>

      <StepEditModal
        open={!!editModal}
        mode={editModal?.mode}
        step={editModal?.step}
        insertIndex={editModal?.index}
        stepsCount={steps.length}
        onClose={() => setEditModal(null)}
        onSave={handleEditSave}
        onError={(msg) => showToast(msg)}
      />
      <StepsJsonEditModal
        open={stepsJsonOpen}
        steps={steps}
        onClose={() => setStepsJsonOpen(false)}
        onSave={(nextSteps) => {
          replaceSteps(nextSteps);
          setStepsJsonOpen(false);
          showToast('已应用 JSON 步骤');
        }}
        onError={(msg) => showToast(msg)}
      />
      <SaveCaseReportModal
        open={!!saveReport}
        caseName={saveReport?.name}
        summary={saveReport?.summary}
        onClose={closeSaveReport}
        onPrimary={goToSavedCase}
        primaryLabel="查看用例"
      />
      <TrialRunResultModal
        open={!!trialRunReport}
        caseName={meta.name.trim() || '当前用例'}
        result={trialRunReport}
        onClose={() => setTrialRunReport(null)}
      />
    </WorkbenchLayout>
  );
}

const TAG_PRESETS = ['冒烟', '回归', '核心流程'];
