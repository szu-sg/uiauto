import { useState } from 'react';
import {
  STEP_TYPE_LABEL,
  humanStepLabel,
  stepTypeIcon,
} from '../../utils/recorderStepEdit';

export default function RecorderStepList({
  steps,
  onEdit,
  onDelete,
  onInsert,
  onMove,
  onAddAtEnd,
}) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  const handleDragStart = (index) => (e) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (index) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overIndex !== index) setOverIndex(index);
  };

  const handleDrop = (index) => (e) => {
    e.preventDefault();
    const from = dragIndex ?? Number(e.dataTransfer.getData('text/plain'));
    if (Number.isNaN(from) || from === index) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    onMove(from, index);
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  if (!steps.length) {
    return (
      <div className="recorder-steps-panel">
        <p className="recorder-empty">点击「开始」后，在目标页面操作，步骤会同步到这里</p>
        <button type="button" className="recorder-add-step" onClick={onAddAtEnd}>
          <span aria-hidden>+</span> 手动添加步骤
        </button>
      </div>
    );
  }

  return (
    <div className="recorder-steps-panel">
      <ol className="recorder-steps">
        {steps.map((step, i) => {
          const type = String(step.type || '').toLowerCase();
          const isLabel = type === 'label';
          const label = humanStepLabel(step);
          return (
            <li
              key={step.id || i}
              className={[
                'recorder-step',
                isLabel ? 'recorder-step--label' : '',
                dragIndex === i ? 'recorder-step--dragging' : '',
                overIndex === i ? 'recorder-step--over' : '',
              ].filter(Boolean).join(' ')}
              draggable
              onDragStart={handleDragStart(i)}
              onDragOver={handleDragOver(i)}
              onDrop={handleDrop(i)}
              onDragEnd={handleDragEnd}
            >
              <span className="recorder-step__drag" title="拖拽排序" aria-hidden>⋮⋮</span>
              <span className="recorder-step__num">{i + 1}</span>
              <span className="recorder-step__icon" aria-hidden>{stepTypeIcon(type)}</span>
              <span className="recorder-step__type">{STEP_TYPE_LABEL[type] || type}</span>
              <div className="recorder-step__body">
                <div className="recorder-step__label">{label}</div>
                {(step.selectorLabel || step.stableSelector) && type !== 'goto' && (
                  <code className="recorder-step__code">{step.selectorLabel || step.stableSelector}</code>
                )}
                {type === 'goto' && step.url && (
                  <code className="recorder-step__code">{step.url}</code>
                )}
                {type === 'fill' && step.value != null && (
                  <code className="recorder-step__code">{step.value}</code>
                )}
              </div>
              <div className="recorder-step__actions">
                <button
                  type="button"
                  className="recorder-step__action"
                  title="在此前插入"
                  onClick={() => onInsert(i)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="recorder-step__action"
                  title="编辑"
                  onClick={() => onEdit(i)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="recorder-step__action recorder-step__action--danger"
                  title="删除"
                  aria-label="删除步骤"
                  onClick={() => onDelete(i)}
                >
                  ×
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <button type="button" className="recorder-add-step" onClick={onAddAtEnd}>
        <span aria-hidden>+</span> 添加步骤
      </button>
    </div>
  );
}
