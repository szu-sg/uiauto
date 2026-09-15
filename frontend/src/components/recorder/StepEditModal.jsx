import { useEffect, useMemo, useState } from 'react';
import {
  ASSERT_OPERATORS,
  EDIT_STEP_TYPES,
  assertNeedsText,
  buildStepFromForm,
  defaultStepJsonTemplate,
  formFromStep,
  parseStepFromJson,
  stepNeedsLocator,
  stepNeedsValue,
} from '../../utils/recorderStepEdit';

export default function StepEditModal({ open, mode, step, insertIndex, stepsCount, onClose, onSave, onError }) {
  const [form, setForm] = useState(() => formFromStep(step));
  const [panelMode, setPanelMode] = useState('form');
  const [jsonText, setJsonText] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(formFromStep(step));
    setPanelMode('form');
    setJsonText(step ? JSON.stringify(step, null, 2) : defaultStepJsonTemplate());
  }, [open, step]);

  const title = useMemo(() => {
    if (mode === 'insert') {
      const pos = insertIndex != null && insertIndex < stepsCount
        ? `（将插入为第 ${insertIndex + 1} 步）`
        : '（追加到末尾）';
      return `配置 Action${pos}`;
    }
    return '编辑 Action';
  }, [mode, insertIndex, stepsCount]);

  if (!open) return null;

  const type = form.type;
  const showLocator = stepNeedsLocator(type);
  const showValue = stepNeedsValue(type);
  const showAssertText = type === 'assert' && assertNeedsText(form.assertOperator);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const switchToJson = () => {
    if (panelMode === 'form') {
      const result = buildStepFromForm(form, step);
      if (result.step) {
        setJsonText(JSON.stringify(result.step, null, 2));
      }
    }
    setPanelMode('json');
  };

  const handleSave = () => {
    if (panelMode === 'json') {
      const result = parseStepFromJson(jsonText, step);
      if (result.error) {
        onError?.(result.error);
        return;
      }
      onSave(result.step);
      return;
    }
    const result = buildStepFromForm(form, step);
    if (result.error) {
      onError?.(result.error);
      return;
    }
    onSave(result.step);
  };

  const groupedTypes = EDIT_STEP_TYPES.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  return (
    <div className="recorder-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="recorder-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="step-edit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="step-edit-title" className="recorder-modal__title">{title}</h3>

        <div className="recorder-modal__mode-tabs" role="tablist" aria-label="编辑方式">
          <button
            type="button"
            role="tab"
            aria-selected={panelMode === 'form'}
            className={`recorder-modal__mode-tab${panelMode === 'form' ? ' is-active' : ''}`}
            onClick={() => setPanelMode('form')}
          >
            表单
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={panelMode === 'json'}
            className={`recorder-modal__mode-tab${panelMode === 'json' ? ' is-active' : ''}`}
            onClick={switchToJson}
          >
            JSON
          </button>
        </div>

        {panelMode === 'json' ? (
          <>
            <p className="recorder-modal__hint">直接编辑单个 Action 的 JSON 对象。</p>
            <textarea
              className="recorder-json-editor recorder-json-editor--step"
              spellCheck={false}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
            />
          </>
        ) : (
          <>
        <label className="recorder-modal__field">
          <span>步骤类型</span>
          <select
            className="plan-detail-field"
            value={form.type}
            onChange={(e) => setField('type', e.target.value)}
          >
            {Object.entries(groupedTypes).map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {type === 'goto' && (
          <label className="recorder-modal__field">
            <span>网址 URL</span>
            <input
              className="plan-detail-field"
              type="url"
              placeholder="https://..."
              value={form.url}
              onChange={(e) => setField('url', e.target.value)}
            />
          </label>
        )}

        {type === 'wait' && (
          <label className="recorder-modal__field">
            <span>等待时长（毫秒）</span>
            <input
              className="plan-detail-field"
              type="number"
              min={100}
              max={120000}
              step={100}
              value={form.ms}
              onChange={(e) => setField('ms', e.target.value)}
            />
          </label>
        )}

        {type === 'label' && (
          <label className="recorder-modal__field">
            <span>注释说明</span>
            <textarea
              className="plan-detail-field"
              rows={3}
              maxLength={120}
              placeholder="例如：登录流程、进入知识库…"
              value={form.labelText}
              onChange={(e) => setField('labelText', e.target.value)}
            />
          </label>
        )}

        {type === 'scroll' && (
          <>
            <label className="recorder-modal__field">
              <span>滚动容器（整页填 html）</span>
              <input
                className="plan-detail-field"
                value={form.scrollTarget}
                onChange={(e) => setField('scrollTarget', e.target.value)}
              />
            </label>
            <div className="recorder-modal__field">
              <span>垂直方向</span>
              <div className="recorder-scroll-row">
                <select className="plan-detail-field" value={form.scrollVDir} onChange={(e) => setField('scrollVDir', e.target.value)}>
                  <option value="none">不滚动</option>
                  <option value="down">向下 ↓</option>
                  <option value="up">向上 ↑</option>
                </select>
                <input className="plan-detail-field" type="number" min={0} step={50} value={form.scrollVPx} onChange={(e) => setField('scrollVPx', e.target.value)} />
                <span>px</span>
              </div>
            </div>
            <div className="recorder-modal__field">
              <span>水平方向</span>
              <div className="recorder-scroll-row">
                <select className="plan-detail-field" value={form.scrollHDir} onChange={(e) => setField('scrollHDir', e.target.value)}>
                  <option value="none">不滚动</option>
                  <option value="right">向右 →</option>
                  <option value="left">向左 ←</option>
                </select>
                <input className="plan-detail-field" type="number" min={0} step={50} value={form.scrollHPx} onChange={(e) => setField('scrollHPx', e.target.value)} />
                <span>px</span>
              </div>
            </div>
          </>
        )}

        {showLocator && (
          <label className="recorder-modal__field">
            <span>元素定位</span>
            <input
              className="plan-detail-field"
              placeholder="getByRole('button', { name: '确定' })"
              value={form.locator}
              onChange={(e) => setField('locator', e.target.value)}
            />
          </label>
        )}

        {showValue && (
          <label className="recorder-modal__field">
            <span>{type === 'select' ? '选项值' : '输入内容'}</span>
            <input
              className="plan-detail-field"
              value={form.value}
              onChange={(e) => setField('value', e.target.value)}
            />
          </label>
        )}

        {type === 'assert' && (
          <>
            <div className="recorder-modal__field">
              <span>断言方式</span>
              <div className="recorder-assert-chips">
                {ASSERT_OPERATORS.map((op) => (
                  <button
                    key={op.value}
                    type="button"
                    className={`recorder-assert-chip${form.assertOperator === op.value ? ' is-active' : ''}`}
                    onClick={() => setField('assertOperator', op.value)}
                  >
                    {op.label}
                  </button>
                ))}
              </div>
            </div>
            {showAssertText && (
              <label className="recorder-modal__field">
                <span>期望文本</span>
                <input
                  className="plan-detail-field"
                  value={form.assertText}
                  onChange={(e) => setField('assertText', e.target.value)}
                />
              </label>
            )}
          </>
        )}
          </>
        )}

        <div className="recorder-modal__actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>取消</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSave}>
            {mode === 'insert' ? '添加' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
