# REQ-B09 成员邀请与发现

| 属性 | 值 |
|------|-----|
| Epic | B 认证、团队与权限 |
| Phase | P1（基础）/ P2（增强） |
| 状态 | ✅ P1 已实现 |
| 上级索引 | [REQ-B00-项目空间总览.md](./REQ-B00-项目空间总览.md) |

---

## 1. 需求概述

**目标**：降低「加人进空间」的操作成本。P1 优化邮箱匹配与提示；P2 支持按姓名/uid 搜索与邀请链接。

---

## 2. P1 — 邀请体验（与 B06 同期）

### 2.1 用户查找 API

```
GET /api/users/lookup?q=zhang
```

- 仅 `admin+` 且在当前空间上下文可调用
- `q`：邮箱前缀、姓名模糊、`uid` 精确（WPS）
- 返回最多 10 条：`{ id, real_name, email, username, uid, avatar }`
- **不**返回未 SSO 用户；不泄露全站用户列表（无 q 或 q 过短 → 400）

### 2.2 邀请方式

- 空间设置邀请区：**搜索框**（防抖）+ 选中用户 + 角色
- 保留邮箱直填（与搜索二选一 Tab）
- 错误文案细化：
  - 未登录过平台 →「对方需先访问 UIAuto 并完成 WPS 登录」
  - 已是成员 →「已在空间中」

### 2.3 后端 `addTeamMember` 扩展

- 支持 `user_id` 或 `email`（二选一）
- `user_id` 优先，避免邮箱变更问题

---

## 3. P2 — 邀请链接（Out of P1）

```
POST /api/teams/:id/invites
→ { "link": "https://…/invite/TOKEN", "expires_at": "…" }

POST /api/invites/:token/accept
```

- Token 单次或限次；默认 7 天
- 接受后写入 `team_members`，角色为创建邀请时指定

---

## 4. 验收标准（P1）

- [ ] 按姓名搜到已登录用户并成功邀请
- [ ] 按 uid 精确匹配
- [ ] 非 admin 调用 lookup → 403
- [ ] 空查询不返回用户列表

---

## 5. 依赖

- REQ-B06、REQ-B07
