import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setToken } from '../authApi';

const API = '/api';

export default function Login({ onLogin }) {
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootstrap, setBootstrap] = useState(null);

  useEffect(() => {
    fetch(API + '/auth/bootstrap')
      .then((r) => r.json())
      .then(setBootstrap)
      .catch(() => setBootstrap({ allowRegister: false }));
  }, []);

  const submit = (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    fetch(API + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || '登录失败');
        setToken(d.token);
        onLogin?.(d.user);
        nav('/', { replace: true });
      })
      .catch((e) => setErr(e.message || '登录失败'))
      .finally(() => setLoading(false));
  };

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <h1 className="auth-card__title">登录 UIAuto</h1>
        <p className="auth-card__hint">使用账号密码登录后管理测试计划与执行历史。</p>
        <form onSubmit={submit} className="auth-form">
          {err && <div className="auth-form__error" role="alert">{err}</div>}
          <label className="auth-form__field">
            <span>用户名</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="auth-form__field">
            <span>密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" className="btn btn-primary auth-form__submit" disabled={loading}>
            {loading ? '登录中…' : '登录'}
          </button>
        </form>
        <p className="auth-card__footer">
          {bootstrap?.allowRegister ? (
            bootstrap?.hasUsers ? (
              <>还没有账号？<Link to="/register">注册新用户</Link></>
            ) : (
              <>首次使用？<Link to="/register">注册管理员</Link></>
            )
          ) : (
            <>还没有账号？<Link to="/register">查看如何开通注册</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
