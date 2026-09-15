import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setToken } from '../authApi';

const API = '/api';

async function fetchLoginUrl() {
  const res = await fetch(`${API}/auth/login-url`);
  if (!res.ok) throw new Error(`获取登录链接失败 (${res.status})`);
  const data = await res.json();
  return data.url;
}

async function exchangeCode(code) {
  const res = await fetch(`${API}/auth/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `登录失败 (${res.status})`);
  return data;
}

/**
 * 处理 WPS OAuth 回调（?code= / ?error=）。
 * 可用于 /login 或站点根路径 /（与 WPS_REDIRECT_URI 一致时）。
 */
export default function OAuthCallback({ onLogin, redirectTo = '/' }) {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const processed = useRef(false);
  const [err, setErr] = useState('');
  const [phase, setPhase] = useState('init');

  const code = searchParams.get('code');
  const errorParam = searchParams.get('error');

  useEffect(() => {
    if (errorParam) {
      setPhase('error');
      setErr(errorParam);
      return;
    }

    if (code) {
      if (processed.current) return;
      processed.current = true;
      setPhase('callback');
      exchangeCode(code)
        .then((d) => {
          setToken(d.token);
          onLogin?.({
            ...d.user,
            current_team_id: d.current_team_id ?? d.user?.current_team_id,
            current_team_role: d.current_team_role ?? d.user?.current_team_role,
            teams: d.user?.teams,
          });
          window.history.replaceState({}, '', redirectTo);
          nav(redirectTo, { replace: true });
        })
        .catch((e) => {
          setPhase('error');
          setErr(e.message || '登录失败');
        });
      return;
    }

    setPhase('redirect');
    fetchLoginUrl()
      .then((url) => {
        window.location.href = url;
      })
      .catch((e) => {
        setPhase('error');
        setErr(e.message || '无法连接后端服务');
      });
  }, [code, errorParam, onLogin, nav, redirectTo]);

  if (phase === 'error') {
    return (
      <div className="auth-redirect-screen">
        <div className="auth-redirect-box card">
          <span className="auth-redirect-icon auth-redirect-icon--error" aria-hidden>!</span>
          <p className="auth-redirect-title">登录失败</p>
          <p className="auth-redirect-sub">{err || '授权未完成'}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              window.history.replaceState({}, '', '/login');
              window.location.reload();
            }}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  const title = phase === 'callback' ? '正在完成登录…' : '正在跳转 WPS 登录…';
  const sub = phase === 'callback'
    ? '请稍候，正在验证企业账号'
    : '即将跳转 WPS 账号授权页';

  return (
    <div className="auth-redirect-screen">
      <div className="auth-redirect-box card">
        <div className="auth-redirect-spinner" aria-hidden />
        <p className="auth-redirect-title">{title}</p>
        <p className="auth-redirect-sub">{sub}</p>
      </div>
    </div>
  );
}
