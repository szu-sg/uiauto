import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../../authApi';
import { caseMetadataEntry } from '../../utils/caseDisplay';

const API = '/api';

export default function BindPlanModal({ caseItems, onClose }) {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    authFetch(`${API}/plans`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPlans(Array.isArray(data) ? data : []))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, []);

  const submit = () => {
    const id = Number(planId);
    if (!id) {
      setError('请选择测试计划');
      return;
    }
    setSaving(true);
    setError('');
    authFetch(`${API}/plans/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('加载计划失败'))))
      .then((plan) => {
        const existing = Array.isArray(plan.cases)
          ? plan.cases
          : (() => { try { return JSON.parse(plan.cases_json || '[]'); } catch (_) { return []; } })();
        const existingIds = Array.isArray(plan.case_ids)
          ? plan.case_ids
          : (() => { try { return JSON.parse(plan.case_ids_json || '[]'); } catch (_) { return []; } })();
        const newIds = caseItems.map((c) => c.id).filter(Boolean);
        const case_ids = [...new Set([...existingIds.map(Number), ...newIds])];
        const paths = caseItems.map((c) => c.path);
        const merged = [...new Set([...existing, ...paths])];
        const case_metadata = { ...(plan.case_metadata || {}) };
        caseItems.forEach((item) => {
          if (!item.path) return;
          case_metadata[item.path] = {
            ...(case_metadata[item.path] || {}),
            ...caseMetadataEntry(item),
          };
        });
        return authFetch(`${API}/plans/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cases: merged, case_ids, case_metadata }),
        });
      })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error || '绑定失败');
        }
        onClose();
        navigate(`/plans/${planId}`);
      })
      .catch((e) => setError(e.message || '绑定失败'))
      .finally(() => setSaving(false));
  };

  return (
    <div className="ui-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ui-modal ui-modal--bind-plan"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bind-plan-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="bind-plan-title" className="ui-modal__title">批量绑定至测试计划</h2>
        <p className="ui-modal__subtitle">已选 {caseItems.length} 条用例，选择要绑定的测试计划</p>

        {loading ? (
          <p className="bind-git-hint">加载计划列表…</p>
        ) : plans.length === 0 ? (
          <p className="bind-git-hint">暂无测试计划，请先创建计划</p>
        ) : (
          <label className="bind-git-field bind-git-field--full">
            <span>测试计划</span>
            <select className="plan-detail-field" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">请选择测试计划</option>
              {plans.map((p) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
          </label>
        )}

        {error && <p className="bind-git-error" role="alert">{error}</p>}

        <div className="ui-modal__actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving || loading || plans.length === 0}>
            {saving ? '绑定中…' : '确认绑定'}
          </button>
        </div>
      </div>
    </div>
  );
}
