import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { setToken } from '../authApi';

const API = '/api';

export default function Register({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
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
    const body = { username: username.trim(), password };
    if (bootstrap?.needInvite) body.invite_code = inviteCode.trim();
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

  if (!bootstrap.allowRegister) {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <h1 className="auth-card__title">暂未开放注册</h1>
          <p className="auth-card__hint" style={{ lineHeight: 1.6 }}>
            已有管理员账号时，需要任选一种方式开放新用户注册，由管理员在<strong>服务器</strong>配置后重启后端：
          </p>
          <ul className="auth-card__list">
            <li>
              <strong>方式一（推荐）</strong>：在 <code>backend/.env</code> 设置{' '}
              <code>UIAUTO_INVITE_CODE=你们的口令</code>，把口令告诉同事，在此页用邀请码注册。
            </li>
            <li>
              <strong>方式二（纯内网）</strong>：设置{' '}
              <code>UIAUTO_OPEN_REGISTER=1</code>，任何人可直接注册（无需邀请码）。
            </li>
          </ul>
          <p className="auth-card__footer">
            <Link to="/login">返回登录</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <h1 className="auth-card__title">
          {bootstrap.hasUsers ? (bootstrap.openRegister ? '注册新用户' : '注册新用户') : '注册管理员'}
        </h1>
        <p className="auth-card__hint">
          {!bootstrap.hasUsers && '首个账号将继承系统中尚未归属的测试计划。'}
          {bootstrap.hasUsers && bootstrap.needInvite && '请输入管理员提供的邀请码。'}
          {bootstrap.hasUsers && bootstrap.openRegister && '当前为开放注册模式，填写用户名与密码即可。'}
        </p>
        <form onSubmit={submit} className="auth-form">
          {err && <div className="auth-form__error" role="alert">{err}</div>}
          <label className="auth-form__field">
            <span>用户名</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="2～32 位，字母数字下划线或中文"
              required
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
          {bootstrap.needInvite && (
            <label className="auth-form__field">
              <span>邀请码</span>
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                autoComplete="off"
                required
              />
            </label>
          )}
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
