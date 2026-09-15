# REQ-B01 WPS SSO 多人协作

| 属性 | 值 |
|------|-----|
| Epic | B 认证团队 |
| Phase | P0 |
| 状态 | ✅ 已完成 |
| 上级索引 | [需求清单.md](../需求清单.md) |


> **全局决策（v0.2）**  
> - **D1 团队库**：资源归属 `team_id`，成员按角色访问  
> - **D2 多 Worker**：执行队列可配置并发（`RUN_WORKER_CONCURRENCY`）  
> - **D3 导入环境可选**：无环境 → `portability=portable`；有环境 → `bundle`


---

## 1. 需求概述

**目标**：生产环境强制 WPS OAuth；用户身份可识别，为团队库奠基。

**补充说明**：团队库上线后，登录响应需增加 `teams[]` 与 `current_team_id`。


## 2. 范围

### In Scope

- OAuth 授权码流程
- JWT 会话
- logout
- super_admin 配置

### Out of Scope

- 团队内角色（见 REQ-B04）
- LDAP

## 3. 数据模型

`users` 表：id, email, name, role, wps_uid, created_at。

## 4. API 设计

`GET /auth/wps/url`、`POST /auth/wps/callback`、`POST /auth/logout`、`GET /auth/me`。

## 5. Service 层

`wpsOAuth.js` 换 token；`auth.js` 签发 JWT。

## 6. 前端

`OAuthCallback` 处理 `?code=`；`VITE_AUTH_DISABLED` 仅 DEV。

## 7. 安全与权限

生产禁止 AUTH_DISABLED；JWT_SECRET 独立配置。

## 8. 迁移与兼容

已有用户保留；首次 SSO 用户可 bootstrap 默认团队（REQ-B03）。

## 9. 验收标准

- [ ] 生产 SSO 登录成功
- [ ] 用户数据按 user_id 创建
- [ ] 回调 URI 与开放平台一致

## 10. 依赖关系

- 无

---

*本文档由需求清单 v0.2 生成，实施时以代码与评审结论为准。*
