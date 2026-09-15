import { useEffect, useRef, useState } from 'react';
import { authFetch } from '../../authApi';
import { useUser } from '../../context/UserContext';
import { creatorNameFromUser } from '../../utils/userDisplay';

const API = '/api';

const PLAN_TYPES = [
  { id: 'ui_auto', label: 'UI自动化' },
  { id: 'fastbot', label: 'Fastbot' },
];

export default function CreatePlanModal({ onClose, onCreated }) {
  const user = useUser();
  const nameRef = useRef(null);
  const [planType, setPlanType] = useState('ui_auto');
  const [planName, setPlanName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => {
    const name = planName.trim();
    if (!name) {
      setError('请填写计划名称');
      return;
    }
    setError('');
    setSubmitting(true);
    authFetch(API + '/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        plan_type: planType,
        cases: [],
        creator: creatorNameFromUser(user) || undefined,
      }),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || r.statusText || '创建失败');
        return data;
      })
      .then((data) => onCreated(data.id))
      .catch((e) => setError(e.message || '创建失败'))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="ui-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ui-modal ui-modal--create-plan"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-plan-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="create-plan-title" className="ui-modal__title">新建测试计划</h2>
        <div className="create-plan-form">
          <fieldset className="create-plan-field">
            <legend className="create-plan-field__label">计划类型</legend>
            <div className="create-plan-type-grid" role="radiogroup" aria-label="计划类型">
              {PLAN_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  role="radio"
                  aria-checked={planType === type.id}
                  className={'create-plan-type-card' + (planType === type.id ? ' create-plan-type-card--active' : '')}
                  onClick={() => setPlanType(type.id)}
                >
                  <span className="create-plan-type-card__title">{type.label}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <label className="create-plan-field">
            <span className="create-plan-field__label">
              计划名称 <span className="create-plan-required">*</span>
            </span>
            <input
              ref={nameRef}
              type="text"
              className="create-plan-name-input"
              value={planName}
              onChange={(e) => { setPlanName(e.target.value); if (error) setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="如：回归测试计划"
              autoComplete="off"
            />
          </label>

          {error && <p className="create-plan-error" role="alert">{error}</p>}
        </div>

        <div className="ui-modal__actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? '创建中…' : '确定'}
          </button>
        </div>
      </div>
    </div>
  );
}
