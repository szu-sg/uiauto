import OAuthCallback from './OAuthCallback';

/** WPS SSO 登录入口（/login） */
export default function Login(props) {
  return <OAuthCallback {...props} redirectTo="/" />;
}
