import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authFetch } from '../authApi';

const API = '/api';
/** 示例按钮填入的占位 Token，用户可替换为自己的 ghp_xxx（私有仓库拉取用） */
const DEFAULT_GITHUB_TOKEN = 'ghp_xxx';

export default function PlanNew() {
  const navigate = useNavigate();
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState('');
  const [specs, setSpecs] = useState([]);
  const [caseMetadata, setCaseMetadata] = useState({});
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [casePage, setCasePage] = useState(1);
  const CASE_PAGE_SIZE = 10;
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
    if (overrides.token != null) setToken(overrides.token);
    const effectiveToken = (overrides.token != null ? String(overrides.token) : token).trim();
    setError('');
    setLoading(true);
    const params = new URLSearchParams({ owner: String(o).trim(), repo: String(r).trim(), branch: String(b).trim() });
    if (effectiveToken) params.set('token', effectiveToken);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    authFetch(API + '/github/specs?' + params, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText || '拉取失败');
        if (data.error) throw new Error(data.error);
        return data;
      })
      .then(async (data) => {
        const list = Array.isArray(data) ? data : [];
        setSpecs(list);
        setSelected(new Set());
        setCasePage(1);
        setError('');
        setFetchEmpty(list.length === 0);
        if (list.length > 0) {
          setMetadataLoading(true);
          try {
            const paths = list.map((s) => s.path);
            const metaRes = await authFetch(API + '/github/case-metadata', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                owner: String(o).trim(),
                repo: String(r).trim(),
                branch: String(b).trim(),
                paths,
                token: effectiveToken || undefined,
              }),
            });
            const meta = await metaRes.json().catch(() => ({}));
            setCaseMetadata(meta && typeof meta === 'object' ? meta : {});
          } catch (_) {
            setCaseMetadata({});
          } finally {
            setMetadataLoading(false);
          }
        } else {
          setCaseMetadata({});
        }
      })
      .catch((e) => {
        if (e.name === 'AbortError') {
          setError('拉取超时（约 25 秒）。请确认：1) 后端已启动（npm run backend）；2) 能访问 GitHub 或配置代理。');
        } else {
          setError(e.message || '拉取失败');
        }
        setSpecs([]);
        setCaseMetadata({});
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

  const totalPages = Math.max(1, Math.ceil(specs.length / CASE_PAGE_SIZE));
  const pageIndex = Math.min(Math.max(1, casePage), totalPages);
  const paginatedSpecs = specs.slice((pageIndex - 1) * CASE_PAGE_SIZE, pageIndex * CASE_PAGE_SIZE);

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
    const selectedArr = [...selected];
    const case_metadata = {};
    selectedArr.forEach((path) => {
      const meta = caseMetadata[path];
      const name = (meta?.name != null && String(meta.name).trim()) ? String(meta.name).trim() : '用例';
      case_metadata[path] = meta
        ? {
            name,
            description: meta.description,
            tags: meta.tags,
            priority: meta.priority,
            author: meta.author,
            createdAt: meta.createdAt,
          }
        : { name: '用例' };
    });
    authFetch(API + '/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: planName.trim(),
        repo_owner: owner.trim(),
        repo_name: repo.trim(),
        repo_branch: branch.trim(),
        cases: selectedArr,
        case_metadata,
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
            onClick={() => {
              setToken(DEFAULT_GITHUB_TOKEN);
              fetchSpecs({ owner: 'szu-sg', repo: 'web_ui', branch: 'main', token: DEFAULT_GITHUB_TOKEN });
            }}
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
          {metadataLoading && <p className="card-muted" style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem' }}>正在拉取用例名称与描述…</p>}
          <div className="plan-new-case-toolbar">
            <button type="button" className="btn btn-secondary" onClick={selectAll}>全选</button>
            <button type="button" className="btn btn-secondary" onClick={selectNone}>取消全选</button>
            <span className="plan-new-case-count">已选 {selected.size} 个</span>
          </div>
          <div className="plan-new-case-table-wrap">
            <table className="plan-new-case-table">
              <thead>
                <tr>
                  <th className="plan-new-case-table__th--check"><span className="sr-only">选择</span></th>
                  <th className="plan-new-case-table__th--name">名称</th>
                  <th className="plan-new-case-table__th--desc">用例描述</th>
                  <th className="plan-new-case-table__th--priority">用例优先级</th>
                  <th className="plan-new-case-table__th--path">路径</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSpecs.map((s) => {
                  const meta = caseMetadata[s.path];
                  const rawName = meta?.name != null ? String(meta.name).trim() : '';
                  const displayName = rawName || '用例';
                  const desc = meta?.description != null ? String(meta.description).trim() : '';
                  const priority = meta?.priority != null ? String(meta.priority).trim() : '—';
                  return (
                    <tr
                      key={s.path}
                      className="plan-new-case-row"
                      onClick={() => toggle(s.path)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(s.path); } }}
                      aria-label={`${displayName} ${s.path}，点击切换选择`}
                    >
                      <td className="plan-new-case-table__td--check" onClick={(e) => e.stopPropagation()}>
                        <label className="plan-new-case-row__label">
                          <input
                            type="checkbox"
                            checked={selected.has(s.path)}
                            onChange={() => toggle(s.path)}
                            aria-label={`选择 ${displayName}：${s.path}`}
                          />
                        </label>
                      </td>
                      <td className="plan-new-case-table__td--name">{displayName}</td>
                      <td className="plan-new-case-table__td--desc" title={desc || undefined}>{desc || '—'}</td>
                      <td className="plan-new-case-table__td--priority">{priority}</td>
                      <td className="plan-new-case-table__td--path" title={s.path}>{s.path}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {specs.length > CASE_PAGE_SIZE && (
            <div className="plan-new-case-pagination">
              <span className="plan-new-case-pagination__info">
                共 {specs.length} 条，第 {pageIndex}/{totalPages} 页
              </span>
              <div className="plan-new-case-pagination__btns">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={pageIndex <= 1}
                  onClick={() => setCasePage((p) => Math.max(1, p - 1))}
                >
                  上一页
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={pageIndex >= totalPages}
                  onClick={() => setCasePage((p) => Math.min(totalPages, p + 1))}
                >
                  下一页
                </button>
              </div>
            </div>
          )}
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
          <button type="button" className="btn btn-primary" onClick={createPlan} disabled={creating}>{creating ? '创建中…' : '创建'}</button>
        </div>
      )}

      {error && <div className="form-error" role="alert">{error}</div>}
    </>
  );
}
