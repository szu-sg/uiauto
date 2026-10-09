import { useState, useEffect, useMemo } from 'react';
import { authFetch } from '../authApi';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import UserChip from '../components/UserChip';
import UserAvatar from '../components/UserAvatar';
import EmptyState from '../components/ui/EmptyState';
import WorkbenchLayout, { WorkbenchPanel, WorkbenchToolbar } from '../components/layout/WorkbenchLayout';
import { displayName, isSameCreator } from '../utils/userDisplay';
import { formatDateOnly, formatDateTime } from '../utils/formatTime';
import { useTeamWrite } from '../hooks/useTeamWrite';
import { canCreateExecutionEnvironment, canManageTeamMembers, currentTeamRole } from '../utils/teamDisplay';
const API = '/api';

const KIND_OPTIONS = [
  { value: 'staging', label: '灰度环境' },
  { value: 'test', label: '测试环境' },
  { value: 'private', label: '私有化环境' },
];

const BASE_URL_PLACEHOLDER = {
  test: 'https://365.kdocs.cn',
  staging: 'https://365.kdocs.cn',
  private: 'http://10.0.0.1:8080',
};

/** 手机号+企业名换 sid 暂未开放，执行使用环境内 wps_sid */
const SHOW_TEST_ACCOUNT_SECTION = false;

function wpsSidFromRow(row) {
  const s = row?.extra_env?.WPS_SID;
  return s != null && String(s).trim() ? String(s).trim() : '';
}

function maskWpsSid(sid) {
  if (!sid) return '';
  const s = String(sid);
  if (s.length <= 14) return `${s.slice(0, 4)}…`;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function emptyForm() {
  return {
    name: '',
    env_kind: 'staging',
    base_url: '',
    headers: [],
    wps_sid: '',
    switchhosts_text: '',
  };
}

function KindBadge({ kind }) {
  const opt = KIND_OPTIONS.find((o) => o.value === kind);
  const label = opt?.label || kind;
  const cls =
    kind === 'staging' ? 'env-kind-badge env-kind-badge--staging' : kind === 'private' ? 'env-kind-badge env-kind-badge--private' : 'env-kind-badge env-kind-badge--test';
  return <span className={cls}>{label}</span>;
}

function displayBaseUrl(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s || s === 'null' || s === 'undefined') return '';
  return s;
}

function EnvFacts({ row }) {
  const facts = [];
  if (row.env_kind === 'test' && row.switchhosts_text && String(row.switchhosts_text).trim()) {
    facts.push('SwitchHosts');
  }
  const hc = Array.isArray(row.headers) ? row.headers.length : 0;
  if (hc > 0) facts.push(`${hc} 请求头`);
  if (facts.length === 0) return null;
  return facts.map((text) => (
    <span key={text} className="env-card__fact">{text}</span>
  ));
}

function EnvCreatorCell({ row, currentUser }) {
  const createdBy = row.created_by;
  if (!createdBy) return <span className="env-card__fact env-card__fact--muted">—</span>;
  const chipUser = isSameCreator(createdBy.real_name, currentUser) && currentUser
    ? currentUser
    : createdBy;
  return <UserChip user={chipUser} size="sm" />;
}

/** 卡片底部：头像 + 姓名·日期（同一行、日期无时分秒） */
function EnvCardCreatorLine({ row, currentUser }) {
  const createdBy = row.created_by;
  if (!createdBy) return <span className="env-card__fact env-card__fact--muted">—</span>;
  const chipUser = isSameCreator(createdBy.real_name, currentUser) && currentUser
    ? currentUser
    : createdBy;
  const name = displayName(chipUser);
  const dateOnly = row.created_at ? formatDateOnly(row.created_at) : '';
  const fullTitle = row.created_at ? formatDateTime(row.created_at) : name;
  return (
    <div className="env-card__foot-creator" title={fullTitle}>
      <UserAvatar user={chipUser} name={name} size="sm" />
      <p className="env-card__foot-line">
        <span className="env-card__foot-name">{name}</span>
        {dateOnly ? (
          <>
            <span className="env-card__foot-sep" aria-hidden>·</span>
            <time className="env-card__foot-date" dateTime={row.created_at}>{dateOnly}</time>
          </>
        ) : null}
      </p>
    </div>
  );
}
export default function Environments() {
  const user = useUser();
  const canWrite = useTeamWrite();
  const canCreateEnv = canCreateExecutionEnvironment(user);
  const teamRole = currentTeamRole(user);
  const canManageAnyEnv = canManageTeamMembers(teamRole);
  const canEditEnvRow = (row) => {
    const isOwner = row.is_owner || Number(row.user_id) === Number(user?.id);
    return isOwner || canManageAnyEnv;
  };
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [kindFilter, setKindFilter] = useState('');

  const load = () => {
    setLoading(true);
    setErr('');
    authFetch(API + '/environments')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('加载失败'))))
      .then(setList)
      .catch((e) => setErr(e.message || '加载失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const startCreate = () => {
    setEditingId('new');
    setEditingRow(null);
    setForm(emptyForm());
    setErr('');
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditingRow(row);
    setForm({
      name: row.name || '',
      env_kind: row.env_kind || 'staging',
      base_url: row.base_url || '',
      headers: Array.isArray(row.headers) && row.headers.length ? [...row.headers] : [],
      wps_sid: wpsSidFromRow(row),
      switchhosts_text: row.switchhosts_text != null ? String(row.switchhosts_text) : '',
    });
    setErr('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingRow(null);
    setForm(emptyForm());
    setErr('');
  };

  const addHeaderRow = () => {
    setForm((f) => ({ ...f, headers: [...f.headers, { name: '', value: '' }] }));
  };

  const updateHeader = (i, field, v) => {
    setForm((f) => {
      const headers = f.headers.map((h, j) => (j === i ? { ...h, [field]: v } : h));
      return { ...f, headers };
    });
  };

  const removeHeader = (i) => {
    setForm((f) => ({ ...f, headers: f.headers.filter((_, j) => j !== i) }));
  };

  const submit = () => {
    if (!form.name.trim()) {
      setErr('请填写环境名称');
      return;
    }
    const headers = form.headers
      .map((h) => ({ name: String(h.name || '').trim(), value: h.value != null ? String(h.value) : '' }))
      .filter((h) => h.name);
    const extra = {
      ...(editingRow?.extra_env && typeof editingRow.extra_env === 'object' && !Array.isArray(editingRow.extra_env)
        ? editingRow.extra_env
        : {}),
    };
    const sid = form.wps_sid.trim();
    if (sid) extra.WPS_SID = sid;
    else delete extra.WPS_SID;

    const body = {
      name: form.name.trim(),
      env_kind: form.env_kind,
      base_url: form.base_url.trim() || null,
      headers,
      extra_env: extra,
      switchhosts_text:
        form.env_kind === 'test' ? (form.switchhosts_text.trim() || null) : null,
    };
    setSaving(true);
    setErr('');
    const url = editingId === 'new' ? API + '/environments' : API + '/environments/' + editingId;
    const method = editingId === 'new' ? 'POST' : 'PUT';
    authFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || '保存失败');
        const wasNew = editingId === 'new';
        cancelEdit();
        load();
        showToast(wasNew ? '已创建执行环境' : '已保存修改');
      })
      .catch((e) => setErr(e.message || '保存失败'))
      .finally(() => setSaving(false));
  };

  const remove = async (id) => {
    const ok = await confirm({
      title: '删除执行环境',
      message: '确定删除该执行环境？使用它的计划将变为「未指定环境」。',
      danger: true,
      confirmLabel: '删除',
    });
    if (!ok) return;
    authFetch(API + '/environments/' + id, { method: 'DELETE' })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => Promise.reject(new Error(d.error || '删除失败')));
        load();
        showToast('已删除');
      })
      .catch((e) => setErr(e.message || '删除失败'));
  };

  const filteredList = useMemo(() => {
    let rows = list;
    if (kindFilter) rows = rows.filter((r) => r.env_kind === kindFilter);
    if (keyword.trim()) {
      const k = keyword.trim().toLowerCase();
      rows = rows.filter((r) => {
        const name = String(r.name || '').toLowerCase();
        const base = String(r.base_url || '').toLowerCase();
        const creator = String(r.created_by?.real_name || '').toLowerCase();
        return name.includes(k) || base.includes(k) || creator.includes(k);
      });
    }
    return rows;
  }, [list, keyword, kindFilter]);

  const editorForm = editingId ? (
    <>
      <section className="env-drawer__section">
        <h3 className="env-drawer__section-title">基本信息</h3>
        <label className="env-drawer__field">
          <span className="env-drawer__label">环境名称</span>
          <input
            className="plan-detail-field"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="例如：灰度-华东、私有化预发"
          />
        </label>

        <div className="env-drawer__field">
          <span className="env-drawer__label" id="env-kind-label">环境类型</span>
          <div className="env-kind-segments env-kind-segments--drawer" role="group" aria-labelledby="env-kind-label">
            {KIND_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`env-kind-seg env-kind-seg--${o.value}${form.env_kind === o.value ? ' env-kind-seg--active' : ''}`}
                aria-pressed={form.env_kind === o.value}
                onClick={() => setForm((f) => ({ ...f, env_kind: o.value }))}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <label className="env-drawer__field">
          <span className="env-drawer__label">基础 URL <span className="env-drawer__optional">可选</span></span>
          <input
            className="plan-detail-field env-drawer__url-input"
            value={form.base_url}
            onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
            placeholder={BASE_URL_PLACEHOLDER[form.env_kind] || BASE_URL_PLACEHOLDER.test}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        {form.env_kind === 'test' && (
          <label className="env-drawer__field">
            <span className="env-drawer__label">Hosts 映射 <span className="env-drawer__optional">仅测试环境</span></span>
            <textarea
              value={form.switchhosts_text}
              onChange={(e) => setForm((f) => ({ ...f, switchhosts_text: e.target.value }))}
              rows={6}
              className="plan-detail-field env-drawer__textarea"
              placeholder={'127.0.0.1 365.kdocs.cn\n# 每行：IP 域名；# 为注释'}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
        )}
      </section>

      <section className="env-drawer__section">
        <div className="env-drawer__section-head">
          <h3 className="env-drawer__section-title">HTTP 请求头</h3>
          <span className="env-drawer__optional">可选</span>
        </div>
        {form.headers.length > 0 && (
          <div className="env-header-table env-header-table--drawer" role="group" aria-label="请求头列表">
            <div className="env-header-table__row env-header-table__row--head">
              <span>名称</span>
              <span>值</span>
              <span className="env-header-table__col-actions" />
            </div>
            {form.headers.map((h, i) => (
              <div key={i} className="env-header-table__row">
                <input className="plan-detail-field env-header-table__input" placeholder="如 X-Env-Tag" value={h.name} onChange={(e) => updateHeader(i, 'name', e.target.value)} autoComplete="off" spellCheck={false} />
                <input className="plan-detail-field env-header-table__input" placeholder="Header 值" value={h.value} onChange={(e) => updateHeader(i, 'value', e.target.value)} autoComplete="off" spellCheck={false} />
                <div className="env-header-table__col-actions">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeHeader(i)} title="移除此请求头">移除</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="btn btn-secondary btn-sm env-drawer__add-btn" onClick={addHeaderRow}>+ 添加请求头</button>
      </section>

      <section className="env-drawer__section">
        <div className="env-drawer__section-head">
          <h3 className="env-drawer__section-title">登录 Cookie</h3>
          <span className="env-drawer__optional">执行必填</span>
        </div>
        <label className="env-drawer__field">
          <span className="env-drawer__label">wps_sid</span>
          <textarea
            className="plan-detail-field env-drawer__textarea env-drawer__sid-input"
            value={form.wps_sid}
            onChange={(e) => setForm((f) => ({ ...f, wps_sid: e.target.value }))}
            rows={3}
            placeholder="V02S…"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
      </section>

      {SHOW_TEST_ACCOUNT_SECTION && (
        <section className="env-drawer__section">
          <div className="env-drawer__section-head">
            <h3 className="env-drawer__section-title">测试账号</h3>
            <span className="env-drawer__optional">可选</span>
          </div>
          <p className="env-drawer__hint">
            执行前用手机号与企业名调用登录接口换取 <code>wps_sid</code>（暂未启用）。
          </p>
        </section>
      )}
    </>
  ) : null;

  return (
    <WorkbenchLayout className="env-page">
      {err && !editingId && <div className="auth-form__error env-page__alert" role="alert">{err}</div>}
      {editingId && (
        <>
          <div className="env-drawer-backdrop" role="presentation" onClick={() => !saving && cancelEdit()} />
          <div className="env-drawer" role="dialog" aria-modal="true" aria-labelledby="env-drawer-title">
            <header className="env-drawer__head">
              <div className="env-drawer__head-main">
                <h2 id="env-drawer-title" className="env-drawer__title">
                  {editingId === 'new' ? '新建执行环境' : '编辑执行环境'}
                </h2>
                {editingRow && (
                  <div className="env-drawer__creator">
                    <span className="env-drawer__creator-label">创建人</span>
                    <EnvCreatorCell row={editingRow} currentUser={user} />
                    {editingRow.created_at && (
                      <time className="env-drawer__creator-time" title={formatDateTime(editingRow.created_at)}>
                        {formatDateTime(editingRow.created_at)}
                      </time>
                    )}
                  </div>
                )}
              </div>
              <button type="button" className="env-drawer__close" onClick={cancelEdit} disabled={saving} aria-label="关闭">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <div className="env-drawer__body">
              {err && <div className="auth-form__error env-drawer__alert" role="alert">{err}</div>}
              {editorForm}
            </div>

            <footer className="env-drawer__foot">
              <button type="button" className="btn btn-secondary" onClick={cancelEdit} disabled={saving}>取消</button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </button>
            </footer>
          </div>
        </>
      )}

      <WorkbenchPanel
        className="wb-panel--main"
        toolbar={!loading && list.length > 0 ? (
          <WorkbenchToolbar
            search={(
              <input
                id="env-filter-keyword"
                type="search"
                placeholder="搜索环境名、URL、企业或创建人…"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                aria-label="搜索环境"
              />
            )}
            filters={(
              <>
                <select
                  id="env-filter-kind"
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value)}
                  aria-label="环境类型"
                >
                  <option value="">全部类型</option>
                  {KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {(keyword || kindFilter) && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setKeyword(''); setKindFilter(''); }}>
                    清除
                  </button>
                )}
              </>
            )}
            meta={`共 ${filteredList.length} 条`}
            actions={canCreateEnv ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>
                新建执行环境
              </button>
            ) : null}
          />
        ) : null}
      >
        {!loading && list.length === 0 && (
          <h3 className="wb-section__title wb-panel__title">已保存的环境</h3>
        )}
        <div className="wb-panel__body">
        {loading ? (
          <EmptyState variant="loading" title="加载中" hint="正在获取执行环境列表" />
        ) : list.length === 0 ? (
          <EmptyState
            title="还没有执行环境"
            hint="在计划详情中绑定为默认环境即可用于执行。"
            action={!editingId && canCreateEnv ? <button type="button" className="btn btn-primary" onClick={startCreate}>新建执行环境</button> : null}
          />
        ) : filteredList.length === 0 ? (
          <EmptyState
            variant="search"
            title="没有匹配的环境"
            hint="请调整筛选关键词或类型"
            action={<button type="button" className="btn btn-secondary" onClick={() => { setKeyword(''); setKindFilter(''); }}>清除筛选</button>}
          />
        ) : (
          <div className="env-grid">
            {filteredList.map((row) => {
              const url = displayBaseUrl(row.base_url);
              const sid = wpsSidFromRow(row);
              const kindCls = row.env_kind === 'staging' ? 'staging' : row.env_kind === 'private' ? 'private' : 'test';
              const factChips = <EnvFacts row={row} />;
              const canEdit = canCreateEnv && canEditEnvRow(row);
              return (
                <article key={row.id} className={`env-card env-card--${kindCls}`}>
                  <header className="env-card__top">
                    <h3 className="env-card__name" title={row.name}>{row.name}</h3>
                    <KindBadge kind={row.env_kind} />
                  </header>

                  <dl className="env-card__spec">
                    <div className="env-card__spec-row">
                      <dt>基础 URL</dt>
                      <dd className="env-card__mono" title={url || undefined}>
                        {url || <span className="env-card__placeholder">未设置</span>}
                      </dd>
                    </div>
                    <div className="env-card__spec-row">
                      <dt>wps_sid</dt>
                      <dd className="env-card__sid">
                        {sid ? (
                          <>
                            <span className="env-card__pill env-card__pill--ok">已配置</span>
                            <code className="env-card__mono env-card__sid-value" title="脱敏展示">{maskWpsSid(sid)}</code>
                          </>
                        ) : (
                          <span className="env-card__pill env-card__pill--warn">未配置，执行前请编辑填写</span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  {factChips && <div className="env-card__facts">{factChips}</div>}

                  <footer className="env-card__foot">
                    <EnvCardCreatorLine row={row} currentUser={user} />
                    {canEdit ? (
                      <div className="env-card__foot-actions">
                        <button type="button" className="env-card__link" onClick={() => startEdit(row)}>编辑</button>
                        <button type="button" className="env-card__link env-card__link--danger" onClick={() => remove(row.id)}>删除</button>
                      </div>
                    ) : (
                      <span className="env-card__readonly-hint">
                        {canCreateEnv ? '只读' : '仅查看'}
                      </span>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
        </div>
      </WorkbenchPanel>
    </WorkbenchLayout>
  );
}
