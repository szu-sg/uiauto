import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';

const API = '/api';

export default function PlanEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [name, setName] = useState('');
  const [creator, setCreator] = useState('');
  const [casesText, setCasesText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(API + '/plans/' + id)
      .then((r) => r.json())
      .then((p) => {
        setPlan(p);
        setName(p.name || '');
        setCreator(p.creator || '');
        const cases = typeof p.cases === 'undefined' ? JSON.parse(p.cases_json || '[]') : p.cases;
        setCasesText(Array.isArray(cases) ? cases.join('\n') : '');
      });
  }, [id]);

  const save = () => {
    const trimmed = casesText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!name.trim()) {
      setError('请填写计划名称');
      return;
    }
    if (trimmed.length === 0) {
      setError('请至少保留一个用例路径');
      return;
    }
    setError('');
    setSaving(true);
    fetch(API + '/plans/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), creator: creator.trim() || null, cases: trimmed }),
    })
      .then((r) => r.json())
      .then(() => navigate('/plans/' + id))
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false));
  };

  if (!plan) return <p className="card-muted">加载中...</p>;

  return (
    <>
      <div className="breadcrumb">
        <Link to="/">测试计划</Link>
        <span className="sep">/</span>
        <Link to={'/plans/' + id}>{plan.name}</Link>
        <span className="sep">/</span>
        <span>编辑</span>
      </div>
      <div className="page-header">
        <h1>编辑计划</h1>
        <div className="card-actions">
          <Link to={'/plans/' + id} className="btn btn-secondary">取消</Link>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">计划名称</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="计划名称"
          style={{ maxWidth: '100%' }}
        />
      </div>

      <div className="card">
        <div className="section-title">创建人（选填）</div>
        <input
          value={creator}
          onChange={(e) => setCreator(e.target.value)}
          placeholder="如：张三"
          style={{ maxWidth: '100%' }}
        />
      </div>

      <div className="card">
        <div className="section-title">仓库（不可修改）</div>
        <p className="card-muted" style={{ margin: 0 }}>{plan.repo_owner}/{plan.repo_name} · {plan.repo_branch}</p>
      </div>

      <div className="card">
        <div className="section-title">用例路径（每行一个）</div>
        <textarea
          value={casesText}
          onChange={(e) => setCasesText(e.target.value)}
          placeholder="tests/demo.spec.js&#10;tests/example.spec.js"
          rows={12}
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            border: '1px solid #3f3f46',
            borderRadius: 6,
            background: '#27272a',
            color: '#e4e4e7',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            resize: 'vertical',
          }}
        />
      </div>

      {error && <p style={{ color: '#f87171' }}>{error}</p>}
    </>
  );
}
