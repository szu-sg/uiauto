import { useState } from 'react';

export default function WaitModal({ open, onClose, onAdd }) {
  const [ms, setMs] = useState(1000);
  if (!open) return null;

  return (
    <div className="recorder-modal-overlay" role="presentation" onClick={onClose}>
      <div className="recorder-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className="recorder-modal__title">⏱ 添加等待</h3>
        <label className="recorder-modal__field">
          <span>等待时长</span>
          <div className="recorder-wait-input">
            <input
              className="plan-detail-field"
              type="number"
              min={100}
              max={120000}
              step={100}
              value={ms}
              onChange={(e) => setMs(Number(e.target.value) || 1000)}
            />
            <span>ms</span>
          </div>
        </label>
        <div className="recorder-modal__actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>取消</button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => onAdd(Math.min(120000, Math.max(100, ms)))}
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
}
