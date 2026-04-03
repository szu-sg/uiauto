import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { setToken } from '../authApi';

const API = '/api';

function normalizeWpsUsername(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  if (!t.includes('@')) return `${t}@wps.cn`.toLowerCase();
  return t.toLowerCase();
}

export default function Register({ onLogin }) {
  const [username, setUsername] = useState('');
  const [realName, setRealName] = useState('');
  const [uid, setUid] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootstrap, setBootstrap] = useState(null);
  const [bootErr, setBootErr] = useState(false);

  useEffect(() => {
    fetch(API + '/auth/bootstrap')
      .then((r) => r.json())
      .then((d) => setBootstrap(d))
      .catch(() => setBootErr(true));
  }, []);

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    const body = {
      username: normalizeWpsUsername(username),
      real_name: realName.trim(),
      uid: uid.trim(),
      password,
    };
    fetch(API + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || '注册失败');
        setToken(d.token);
        onLogin?.(d.user);
        window.location.href = '/';
      })
      .catch((e) => setErr(e.message || '注册失败'))
      .finally(() => setLoading(false));
  };

  if (bootErr) {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <h1 className="auth-card__title">无法获取注册信息</h1>
          <p className="auth-card__hint">请确认后端已启动，稍后重试。</p>
          <p className="auth-card__footer"><Link to="/login">返回登录</Link></p>
        </div>
      </div>
    );
  }

  if (!bootstrap) {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <p className="auth-card__hint">加载中…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <h1 className="auth-card__title">{bootstrap.hasUsers ? '注册新用户' : '注册管理员'}</h1>
        <p className="auth-card__hint">
          {/* {!bootstrap.hasUsers && '首个账号将继承系统中尚未归属的测试计划。'}
          {bootstrap.hasUsers && '填写 WPS 邮箱、姓名、金山办公用户 ID 与密码即可完成注册。'} */}
        </p>
        <form onSubmit={submit} className="auth-form">
          {err && <div className="auth-form__error" role="alert">{err}</div>}
          <label className="auth-form__field">
            <span>用户名</span>
            <div className="auth-form__wps-email">
              <input
                className="auth-form__wps-email-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="办公邮箱"
                required
              />
              {!username.includes('@') && (
                <span className="auth-form__wps-email-suffix" aria-hidden>
                  @wps.cn
                </span>
              )}
            </div>
            {username.trim() && !username.includes('@') && (
              <span className="auth-form__field-hint">
                将注册为 {normalizeWpsUsername(username)}
              </span>
            )}
          </label>
          <label className="auth-form__field">
            <span>姓名</span>
            <input
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              autoComplete="name"
              placeholder="真实姓名"
              required
              minLength={2}
              maxLength={32}
            />
          </label>
          <label className="auth-form__field">
            <span>UID</span>
            <input
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              autoComplete="off"
              placeholder="金山办公用户ID"
              required
              minLength={3}
              maxLength={64}
            />
          </label>
          <label className="auth-form__field">
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="至少 6 位"
              required
              minLength={6}
            />
          </label>
          <button type="submit" className="btn btn-primary auth-form__submit" disabled={loading}>
            {loading ? '提交中…' : '注册'}
          </button>
        </form>
        <p className="auth-card__footer">
          <Link to="/login">已有账号，去登录</Link>
        </p>
      </div>
    </div>
  );
}
