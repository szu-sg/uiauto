/** 仅 Vite 开发模式可免登录；生产构建始终走 WPS SSO */
export const AUTH_DISABLED =
  import.meta.env.DEV && import.meta.env.VITE_AUTH_DISABLED === 'true';
