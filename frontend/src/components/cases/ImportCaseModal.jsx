import { useEffect, useRef, useState } from 'react';
import { authFetch } from '../../authApi';
import {
  applyBundleToForm,
  inferNameFromScript,
  inferNameFromScriptFile,
  parseImportClipboard,
} from '../../utils/importCaseParser';

const API = '/api';
const PRIORITIES = ['P0', 'P1', 'P2', 'P3', 'P4'];
const TAG_PRESETS = ['冒烟', '回归', '核心流程'];
const SCRIPT_FILE_ACCEPT = '.ts,.js,.py,text/typescript,text/javascript,text/x-python';
const SPREADSHEET_ACCEPT = '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv';
const CONTEXT_FILE_ACCEPT = '.json,application/json';

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

function parseContextJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return { ok: true, data: null };
  try {
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return { ok: false, error: '上下文须为 JSON 对象（Playwright storage_state）' };
    }
    if (data.cookies !== undefined && !Array.isArray(data.cookies)) {
      return { ok: false, error: '上下文 cookies 须为数组' };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: '上下文 JSON 格式无效' };
  }
}

function downloadImportTemplate() {
  const headers = ['用例名称', '优先级', '模块', '标签', '备注', '操作', '脚本', 'Auth'];
  const sample = [
    '示例用例',
    'P0',
    '示例模块',
    '冒烟',
    '用例说明',
    '[]',
    "import { test } from '@playwright/test';\n\ntest('示例', async ({ page }) => {\n  await page.goto('https://example.com');\n});",
    '',
  ];
  const escape = (v) => {
    const s = String(v ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = [headers.join(','), sample.map(escape).join(',')].join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '用例导入模板.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function TagEditor({ tags, tagInput, onTagInputChange, onAddTag, onRemoveTag }) {
  return (
    <>
      <div className="plan-detail-field recorder-tags-input import-case-tags">
        {tags.map((t) => (
          <span key={t} className="recorder-tag">
            {t}
            <button type="button" aria-label={`移除 ${t}`} onClick={() => onRemoveTag(t)}>×</button>
          </span>
        ))}
        <input
          placeholder={tags.length ? '' : '回车添加标签'}
          value={tagInput}
          onChange={(e) => onTagInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAddTag();
            }
          }}
        />
      </div>
      <div className="recorder-tag-presets">
        {TAG_PRESETS.map((t) => (
          <button key={t} type="button" className="recorder-tag-preset" onClick={() => onAddTag(t)}>{t}</button>
        ))}
      </div>
    </>
  );
}

function PriorityPicker({ priority, onChange }) {
  return (
    <div className="import-case-priority">
      {PRIORITIES.map((p) => (
        <button
          key={p}
          type="button"
          className={`import-case-priority__btn${priority === p ? ' is-active' : ''}`}
          onClick={() => onChange(p)}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function CodeBlock({
  label,
  required,
  value,
  onChange,
  onPaste,
  placeholder,
  rows = 12,
  fileRef,
  fileAccept,
  onFilePick,
  fileLabel,
  onClearFile,
  uploadLabel = '导入文件',
  disabled = false,
  small = false,
}) {
  return (
    <div className={`import-case-code-block${small ? ' import-case-code-block--context' : ''}`}>
      <div className="import-case-code-block__head">
        <span className="create-plan-field__label">
          {label}
          {required && <span className="create-plan-required"> *</span>}
        </span>
        <div className="import-case-code-block__actions">
          <input
            ref={fileRef}
            type="file"
            accept={fileAccept}
            className="import-case-file-input"
            onChange={onFilePick}
            disabled={disabled}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
          >
            {uploadLabel}
          </button>
        </div>
      </div>
      {fileLabel && (
        <div className="import-case-file-chip">
          <span>{fileLabel}</span>
          <button type="button" onClick={onClearFile} aria-label="移除文件">×</button>
        </div>
      )}
      <textarea
        className={`import-case-code-block__editor${small ? ' import-case-code-block__editor--sm' : ''}`}
        rows={rows}
        value={value}
        onChange={onChange}
        onPaste={onPaste}
        placeholder={placeholder}
        spellCheck={false}
        disabled={disabled}
      />
    </div>
  );
}

export default function ImportCaseModal({
  open,
  onClose,
  onImported,
  folderId,
  folderLabel,
  showToast,
}) {
  const scriptFileRef = useRef(null);
  const contextFileRef = useRef(null);
  const spreadsheetFileRef = useRef(null);

  const [batchMode, setBatchMode] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('P0');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [script, setScript] = useState('');
  const [scriptFileLabel, setScriptFileLabel] = useState('');
  const [contextJson, setContextJson] = useState('');
  const [contextFileLabel, setContextFileLabel] = useState('');
  const [spreadsheetFile, setSpreadsheetFile] = useState(null);
  const [batchPreview, setBatchPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const reset = () => {
    setBatchMode(false);
    setName('');
    setDescription('');
    setPriority('P0');
    setTags([]);
    setTagInput('');
    setScript('');
    setScriptFileLabel('');
    setContextJson('');
    setContextFileLabel('');
    setSpreadsheetFile(null);
    setBatchPreview(null);
    setPreviewLoading(false);
    if (scriptFileRef.current) scriptFileRef.current.value = '';
    if (contextFileRef.current) contextFileRef.current.value = '';
    if (spreadsheetFileRef.current) spreadsheetFileRef.current.value = '';
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const switchMode = (nextBatch) => {
    setBatchMode(nextBatch);
    setError('');
    if (!nextBatch) {
      clearSpreadsheet();
    }
  };

  const addTag = (tag) => {
    const t = (tag || tagInput).trim();
    if (!t || tags.includes(t)) return;
    setTags((prev) => [...prev, t]);
    setTagInput('');
  };

  const removeTag = (tag) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const applyParsedPaste = (parsed) => {
    if (parsed.kind === 'bundle-json') {
      applyBundleToForm(parsed.bundle, {
        setName,
        setDescription,
        setPriority,
        setTags,
        setScript,
        setContextJson,
      });
      showToast?.('已识别 JSON 用例包');
      return;
    }
    if (parsed.kind === 'script-with-meta' || parsed.kind === 'script') {
      setScript(parsed.script || '');
      if (parsed.name && !name.trim()) setName(parsed.name);
      if (parsed.description) setDescription(parsed.description);
      if (parsed.priority) setPriority(parsed.priority);
      if (Array.isArray(parsed.tags) && parsed.tags.length) setTags(parsed.tags);
      showToast?.('已识别 Playwright 脚本');
    }
  };

  const onScriptPaste = (e) => {
    const text = e.clipboardData?.getData('text') || '';
    if (!text.trim()) return;
    const parsed = parseImportClipboard(text);
    if (parsed.kind === 'empty' || parsed.kind === 'unknown' || parsed.kind === 'batch-json') return;
    e.preventDefault();
    setError('');
    applyParsedPaste(parsed);
  };

  const onScriptFilePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!/\.(ts|js|py)$/.test(lower)) {
      setError('脚本文件仅支持 .ts、.js、.py');
      return;
    }
    setError('');
    try {
      const text = await readTextFile(file);
      setScript(text);
      setScriptFileLabel(file.name);
      if (!name.trim()) setName(inferNameFromScriptFile(file.name) || inferNameFromScript(text));
    } catch (err) {
      setError(err.message || '脚本文件读取失败');
    }
  };

  const onContextFilePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      setError('上下文文件仅支持 .json');
      return;
    }
    try {
      const text = await readTextFile(file);
      const parsed = parseContextJson(text);
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      setContextJson(JSON.stringify(parsed.data, null, 2));
      setContextFileLabel(file.name);
      setError('');
    } catch {
      setError('上下文文件读取失败');
    }
  };

  const loadBatchPreview = async (file) => {
    setPreviewLoading(true);
    setBatchPreview(null);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await authFetch(`${API}/cases/import/spreadsheet/preview`, {
        method: 'POST',
        body: fd,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '预览失败');
      setBatchPreview(data);
    } catch (err) {
      setSpreadsheetFile(null);
      if (spreadsheetFileRef.current) spreadsheetFileRef.current.value = '';
      setError(err.message || '表格解析失败');
    } finally {
      setPreviewLoading(false);
    }
  };

  const onSpreadsheetPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError('批量导入仅支持 .xlsx、.xls、.csv');
      return;
    }
    setSpreadsheetFile(file);
    loadBatchPreview(file);
  };

  const clearSpreadsheet = () => {
    setSpreadsheetFile(null);
    setBatchPreview(null);
    if (spreadsheetFileRef.current) spreadsheetFileRef.current.value = '';
  };

  const submitSpreadsheet = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('priority', priority);
    fd.append('tags', JSON.stringify(tags));
    if (folderId) fd.append('folder_id', String(folderId));

    const r = await authFetch(`${API}/cases/import/spreadsheet`, {
      method: 'POST',
      body: fd,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok && !data.imported) throw new Error(data.error || '表格导入失败');
    return data;
  };

  const submitSingle = async () => {
    const itemName = name.trim();
    if (!itemName) {
      setError('请填写用例名称');
      return;
    }
    if (!script.trim()) {
      setError('请填写或导入 Playwright 脚本');
      return;
    }
    const ctx = parseContextJson(contextJson);
    if (!ctx.ok) {
      setError(ctx.error);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const body = {
        name: itemName,
        script,
        source: 'imported',
        priority,
        tags,
        description: description.trim() || null,
      };
      if (ctx.data) body.auth = { storage_state: ctx.data };
      if (folderId) body.folder_id = folderId;

      const r = await authFetch(`${API}/cases/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || '导入失败');
      onImported?.(data);
      showToast?.('用例导入成功');
      handleClose();
    } catch (err) {
      setError(err.message || '导入失败');
    } finally {
      setLoading(false);
    }
  };

  const submitBatch = async () => {
    if (!spreadsheetFile) {
      setError('请先选择 Excel 或 CSV 文件');
      return;
    }
    if (previewLoading) {
      setError('请等待表格解析完成');
      return;
    }
    if (batchPreview && batchPreview.newCount === 0) {
      setError('全部为重复用例，无需导入');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await submitSpreadsheet(spreadsheetFile);
      const imported = data.imported ?? 0;
      const failed = data.failed ?? 0;
      const skipped = data.skipped ?? 0;
      onImported?.(data);
      handleClose();
      if (failed > 0) {
        showToast?.(`已导入 ${imported} 条，跳过重复 ${skipped} 条，${failed} 条失败`);
      } else if (skipped > 0) {
        showToast?.(`已导入 ${imported} 条，跳过重复 ${skipped} 条`);
      } else {
        showToast?.(`已成功导入 ${imported} 条用例`);
      }
    } catch (err) {
      setError(err.message || '批量导入失败');
    } finally {
      setLoading(false);
    }
  };

  const submit = () => {
    if (batchMode) submitBatch();
    else submitSingle();
  };

  const newImportCount = batchPreview?.newCount ?? 0;
  const submitLabel = batchMode
    ? (loading ? '导入中…' : `确认导入${newImportCount ? ` (${newImportCount})` : ''}`)
    : (loading ? '导入中…' : '确认导入');

  if (!open) return null;

  return (
    <div className="ui-modal-backdrop ui-modal-backdrop--dense" role="presentation" onClick={handleClose}>
      <div
        className="ui-modal ui-modal--import-case"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-case-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ui-modal__header import-case-header">
          <div className="ui-modal__header-text">
            <h2 id="import-case-title" className="ui-modal__title">
              {batchMode ? '批量导入' : '导入用例'}
            </h2>
          </div>
          <div className="import-case-header__actions">
            <button
              type="button"
              className="import-case-mode-toggle"
              onClick={() => switchMode(!batchMode)}
            >
              {batchMode ? '单条导入' : '批量导入'}
            </button>
            <button type="button" className="ui-modal__close" onClick={handleClose} aria-label="关闭">×</button>
          </div>
        </header>

        {folderLabel && (
          <div className="import-case-target">
            <span className="import-case-target__label">导入到</span>
            <span className="import-case-target__value">{folderLabel}</span>
          </div>
        )}

        <div className="import-case-form">
          {!batchMode ? (
            <>
              <div className="import-case-meta-grid">
                <label className="create-plan-field">
                  <span className="create-plan-field__label">
                    名称 <span className="create-plan-required">*</span>
                  </span>
                  <input
                    type="text"
                    className="create-plan-name-input import-case-name-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：登录后创建文档"
                  />
                </label>
                <div className="create-plan-field">
                  <span className="create-plan-field__label">优先级</span>
                  <PriorityPicker priority={priority} onChange={setPriority} />
                </div>
              </div>

              <label className="create-plan-field">
                <span className="create-plan-field__label">备注</span>
                <textarea
                  className="import-case-remark-input import-case-remark-input--compact"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="用例说明、测试目的等"
                />
              </label>

              <div className="create-plan-field">
                <span className="create-plan-field__label">标签</span>
                <TagEditor
                  tags={tags}
                  tagInput={tagInput}
                  onTagInputChange={setTagInput}
                  onAddTag={addTag}
                  onRemoveTag={removeTag}
                />
              </div>

              <CodeBlock
                label="脚本"
                required
                value={script}
                onChange={(e) => {
                  setScript(e.target.value);
                  if (error) setError('');
                }}
                onPaste={onScriptPaste}
                placeholder="import { test, expect } from '@playwright/test'; ..."
                rows={11}
                fileRef={scriptFileRef}
                fileAccept={SCRIPT_FILE_ACCEPT}
                onFilePick={onScriptFilePick}
                fileLabel={scriptFileLabel}
                onClearFile={() => {
                  setScript('');
                  setScriptFileLabel('');
                  if (scriptFileRef.current) scriptFileRef.current.value = '';
                }}
                uploadLabel="导入文件"
              />

              <CodeBlock
                label="上下文（可选）"
                value={contextJson}
                onChange={(e) => {
                  setContextJson(e.target.value);
                  setContextFileLabel('');
                  if (error) setError('');
                }}
                placeholder='{"cookies":[{"name":"...","value":"...","domain":"..."}],"origins":[]}'
                rows={5}
                fileRef={contextFileRef}
                fileAccept={CONTEXT_FILE_ACCEPT}
                onFilePick={onContextFilePick}
                fileLabel={contextFileLabel}
                onClearFile={() => {
                  setContextJson('');
                  setContextFileLabel('');
                  if (contextFileRef.current) contextFileRef.current.value = '';
                }}
                uploadLabel="导入 JSON"
                small
              />
            </>
          ) : (
            <div className="import-case-batch-panel">
              <p className="import-case-batch-panel__hint">
                「模块」列自动创建文件夹；「操作」列为 Playwright 录制步骤 JSON，可留空由脚本推断。
                重复用例（同名或相同脚本）将自动跳过。
              </p>

              <input
                ref={spreadsheetFileRef}
                type="file"
                accept={SPREADSHEET_ACCEPT}
                className="import-case-file-input"
                onChange={onSpreadsheetPick}
              />

              {!spreadsheetFile ? (
                <>
                  <div className="import-case-batch-panel__toolbar">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={downloadImportTemplate}>
                      下载导入模板
                    </button>
                  </div>
                  <button
                    type="button"
                    className="import-case-upload-zone"
                    onClick={() => spreadsheetFileRef.current?.click()}
                  >
                    <span className="import-case-upload-zone__title">选择 Excel / CSV 文件</span>
                    <span className="import-case-upload-zone__hint">支持 .xlsx、.xls、.csv</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="import-case-batch-file-bar">
                    <div className="import-case-batch-file-bar__info">
                      <span className="import-case-batch-file-bar__name">{spreadsheetFile.name}</span>
                      <span className="import-case-batch-file-bar__meta">
                        {previewLoading ? '正在解析…' : batchPreview
                          ? `共 ${batchPreview.total} 条 · 新增 ${batchPreview.newCount} 条 · 重复 ${batchPreview.duplicateCount} 条`
                          : '等待解析'}
                      </span>
                    </div>
                    <div className="import-case-batch-file-bar__actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => spreadsheetFileRef.current?.click()}
                      >
                        更换
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={clearSpreadsheet}>
                        移除
                      </button>
                    </div>
                  </div>

                  {previewLoading && (
                    <div className="import-case-batch-loading">正在解析表格并检测重复…</div>
                  )}

                  {!previewLoading && batchPreview?.rows?.length > 0 && (
                    <>
                      <div className="import-case-batch-stats">
                        <span className="import-case-batch-stats__item">
                          总计 <strong>{batchPreview.total}</strong> 条
                        </span>
                        <span className="import-case-batch-stats__item">
                          将导入 <strong>{batchPreview.newCount}</strong> 条
                        </span>
                        {batchPreview.duplicateCount > 0 && (
                          <span className="import-case-batch-stats__item import-case-batch-stats__item--warn">
                            跳过重复 <strong>{batchPreview.duplicateCount}</strong> 条
                          </span>
                        )}
                      </div>
                      <div className="import-case-preview-wrap">
                        <table className="import-case-preview-table">
                          <thead>
                            <tr>
                              <th>行</th>
                              <th>名称</th>
                              <th>模块</th>
                              <th>优先级</th>
                              <th>标签</th>
                              <th>备注</th>
                              <th>步骤</th>
                              <th>状态</th>
                            </tr>
                          </thead>
                          <tbody>
                            {batchPreview.rows.map((row) => (
                              <tr key={`${row.row}-${row.name}`}>
                                <td>{row.row}</td>
                                <td className="import-case-preview-table__name" title={row.name}>{row.name}</td>
                                <td>{row.module || '—'}</td>
                                <td>{row.priority || '—'}</td>
                                <td>{row.tags?.length ? row.tags.join('、') : '—'}</td>
                                <td className="import-case-preview-table__remark" title={row.description || ''}>
                                  {row.description || '—'}
                                </td>
                                <td>{row.stepsCount || 0}</td>
                                <td>
                                  {row.duplicate ? (
                                    <span
                                      className="import-case-preview-status import-case-preview-status--dup"
                                      title={row.duplicate.matchBy === 'name' ? '同名' : '相同脚本'}
                                    >
                                      重复
                                    </span>
                                  ) : (
                                    <span className="import-case-preview-status import-case-preview-status--new">新增</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {error && <p className="ui-modal__error" role="alert">{error}</p>}

        <footer className="ui-modal__footer">
          <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={loading}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={loading}>
            {submitLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
