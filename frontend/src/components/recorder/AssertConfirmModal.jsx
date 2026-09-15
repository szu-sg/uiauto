import { ASSERT_OPERATORS } from '../../utils/recorderStepEdit';

export default function AssertConfirmModal({ target, onClose, onConfirm, onRepick }) {
  if (!target) return null;

  return (
    <div className="recorder-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="recorder-modal recorder-modal--assert"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="recorder-modal__assert-head">
          <span className="recorder-modal__assert-icon" aria-hidden>✓</span>
          <h3 className="recorder-modal__title">确认断言</h3>
        </div>

        <section className="recorder-modal__section">
          <p className="recorder-modal__section-label">当前选中元素</p>
          <div className="recorder-assert-target">
            {target.text && (
              <div className="recorder-assert-target__row">
                <span>文本</span>
                <code>{target.text}</code>
              </div>
            )}
            {target.selector && (
              <div className="recorder-assert-target__row">
                <span>定位</span>
                <code>{target.selector}</code>
              </div>
            )}
            {target.ariaRole && (
              <div className="recorder-assert-target__row">
                <span>Role</span>
                <code>{target.ariaRole}{target.ariaName ? ` / ${target.ariaName}` : ''}</code>
              </div>
            )}
            {!target.text && !target.selector && (
              <p className="recorder-empty">{target.summary || '无可用信息'}</p>
            )}
          </div>
        </section>

        <AssertForm onConfirm={onConfirm} defaultText={target.text || ''} />

        <div className="recorder-modal__assert-foot">
          <button type="button" className="recorder-link-btn" onClick={onRepick}>↻ 重新选择</button>
          <div className="recorder-modal__actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>取消</button>
            <button type="submit" form="assert-confirm-form" className="btn btn-primary btn-sm">添加断言</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssertForm({ onConfirm, defaultText }) {
  const handleSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    onConfirm({
      operator: fd.get('operator') || 'visible',
      text: String(fd.get('text') || '').trim(),
    });
  };

  return (
    <form id="assert-confirm-form" className="recorder-modal__section" onSubmit={handleSubmit}>
      <p className="recorder-modal__section-label">断言方式</p>
      <div className="recorder-assert-chips">
        {ASSERT_OPERATORS.map((op) => (
          <label key={op.value} className="recorder-assert-chip-label">
            <input type="radio" name="operator" value={op.value} defaultChecked={op.value === 'visible'} />
            <span>{op.label}</span>
          </label>
        ))}
      </div>
      <label className="recorder-modal__field recorder-modal__field--assert-text">
        <span>期望文本（等于/包含时必填）</span>
        <input className="plan-detail-field" name="text" defaultValue={defaultText} placeholder="元素应包含或等于的文本" />
      </label>
    </form>
  );
}
