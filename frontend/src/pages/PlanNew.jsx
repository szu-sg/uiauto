import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const API = '/api';

export default function PlanNew() {
  const navigate = useNavigate();
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState('');
  const [specs, setSpecs] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [planName, setPlanName] = useState('');
  const [creator, setCreator] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [fetchEmpty, setFetchEmpty] = useState(false);

  const fetchSpecs = (overrides = {}) => {
    const o = overrides.owner ?? owner;
    const r = overrides.repo ?? repo;
    const b = overrides.branch ?? branch;
    if (!String(o).trim() || !String(r).trim()) {
      setError('请填写 owner 和 repo');
      return;
    }
    if (overrides.owner != null) setOwner(overrides.owner);
    if (overrides.repo != null) setRepo(overrides.repo);
    if (overrides.branch != null) setBranch(overrides.branch);
    setError('');
    setLoading(true);
    const params = new URLSearchParams({ owner: String(o).trim(), repo: String(r).trim(), branch: String(b).trim() });
    if (token.trim()) params.set('token', token.trim());
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    fetch(API + '/github/specs?' + params, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText || '拉取失败');
        if (data.error) throw new Error(data.error);
        return data;
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setSpecs(list);
        setSelected(new Set());
        setError('');
        setFetchEmpty(list.length === 0);
      })
      .catch((e) => {
        if (e.name === 'AbortError') {
          setError('拉取超时（约 25 秒）。请确认：1) 后端已启动（npm run backend）；2) 能访问 GitHub 或配置代理。');
        } else {
          setError(e.message || '拉取失败');
        }
        setSpecs([]);
        setFetchEmpty(false);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        setLoading(false);
      });
  };

  const toggle = (path) => {
    const next = new Set(selected);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setSelected(next);
  };

  const selectAll = () => setSelected(new Set(specs.map((s) => s.path)));
  const selectNone = () => setSelected(new Set());

  const createPlan = () => {
    if (!planName.trim()) {
      setError('请填写计划名称');
      return;
    }
    if (selected.size === 0) {
      setError('请至少选择一个用例');
      return;
    }
    setError('');
    setCreating(true);
    fetch(API + '/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: planName.trim(),
        repo_owner: owner.trim(),
        repo_name: repo.trim(),
        repo_branch: branch.trim(),
        cases: [...selected],
        creator: creator.trim() || undefined,
        token: token.trim() || undefined,
      }),
    })
      .then((r) => r.json())
      .then((data) => navigate('/plans/' + data.id))
      .catch((e) => setError(e.message))
      .finally(() => setCreating(false));
  };

  return (
    <>
      <div className="breadcrumb">
        <Link to="/">测试计划</Link>
        <span className="sep">/</span>
        <span>新建</span>
      </div>
      <div className="page-header">
        <h1>新建测试计划</h1>
        <Link to="/" className="btn btn-secondary">返回列表</Link>
      </div>

      <div className="card">
        <h3><span className="step-label">1</span>从 GitHub 拉取用例</h3>
        <div className="form-row">
          <label>Owner</label>
          <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="如 szu-sg" />
        </div>
        <div className="form-row">
          <label>Repo</label>
          <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="如 web_ui" />
        </div>
        <div className="form-row">
          <label>Branch</label>
          <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
        </div>
        <div className="form-row">
          <label>GitHub Token（私有仓库必填）</label>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_xxx" />
        </div>
        <div className="input-group">
          <button className="btn btn-primary" onClick={() => fetchSpecs()} disabled={loading}>
            {loading ? '拉取中...' : '拉取'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={loading}
            onClick={() => fetchSpecs({ owner: 'szu-sg', repo: 'web_ui', branch: 'main' })}
          >
            示例：szu-sg/web_ui
          </button>
        </div>
      </div>

      {!loading && fetchEmpty && (
        <div className="card" style={{ borderColor: '#454545' }}>
          <p style={{ margin: 0, color: '#a1a1aa' }}>
            未找到用例文件。请确认：1) 仓库存在且分支正确（可留空分支将自动使用默认分支）；2) 仓库内有 <code>.spec.ts</code> / <code>.spec.js</code> / <code>.test.ts</code> 等文件；3) 私有仓库需填写 GitHub Token。
          </p>
        </div>
      )}
      {specs.length > 0 && (
        <div className="card">
          <h3><span className="step-label">2</span>选用例</h3>
          <div className="card-actions" style={{ marginBottom: '0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={selectAll}>全选</button>
            <button type="button" className="btn btn-secondary" onClick={selectNone}>取消</button>
            <span className="card-muted">已选 {selected.size} 个</span>
          </div>
          <ul style={{ maxHeight: 280, overflow: 'auto' }}>
            {specs.map((s) => (
              <li key={s.path} style={{ padding: '0.35rem 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(s.path)}
                    onChange={() => toggle(s.path)}
                  />
                  <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{s.path}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {specs.length > 0 && (
        <div className="card">
          <h3><span className="step-label">3</span>计划名称并创建</h3>
          <div className="form-row">
            <label>计划名称</label>
            <input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder="如：回归用例" />
          </div>
          <div className="form-row">
            <label>创建人（选填）</label>
            <input value={creator} onChange={(e) => setCreator(e.target.value)} placeholder="如：张三" />
          </div>
          <button type="button" className="btn btn-primary" onClick={createPlan} disabled={creating}>{creating ? '创建中，正在拉取用例名称…' : '创建'}</button>
        </div>
      )}

      {error && <p style={{ color: '#f87171', marginTop: '0.5rem' }}>{error}</p>}
    </>
  );
}
