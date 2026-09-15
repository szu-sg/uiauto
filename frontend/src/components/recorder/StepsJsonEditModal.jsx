import { useEffect, useState } from 'react';
import { parseStepsFromJson } from '../../utils/recorderStepEdit';

export default function StepsJsonEditModal({ open, steps, onClose, onSave, onError }) {
  const [text, setText] = useState('[]');

  useEffect(() => {
    if (open) setText(JSON.stringify(steps || [], null, 2));
  }, [open, steps]);

  if (!open) return null;

  const handleSave = () => {
    const result = parseStepsFromJson(text);
    if (result.error) {
      onError?.(result.error);
      return;
    }
    onSave(result.steps);
  };

  return (
    <div className="recorder-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="recorder-modal recorder-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="steps-json-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="steps-json-title" className="recorder-modal__title">JSON 编辑 Action 列表</h3>
        <p className="recorder-modal__hint">
          编辑步骤数组，每项需包含 <code>type</code> 字段（如 goto、click、fill、assert 等）。
        </p>
        <textarea
          className="recorder-json-editor"
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="recorder-modal__actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>取消</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSave}>应用</button>
        </div>
      </div>
    </div>
  );
}
