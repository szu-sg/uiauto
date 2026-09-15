# REQ-B08 所有权转让与离开空间

| 属性 | 值 |
|------|-----|
| Epic | B 认证、团队与权限 |
| Phase | P1 |
| 状态 | ✅ 已实现 |
| 上级索引 | [REQ-B00-项目空间总览.md](./REQ-B00-项目空间总览.md) |

---

## 1. 需求概述

**目标**：补齐空间生命周期与成员自助能力：**转让所有权**、**主动离开**、**删除协作空间**（REQ-B04 已描述 API，尚未实现）。

---

## 2. API 设计

### 2.1 转让所有权

```
POST /api/teams/:id/transfer-ownership
{ "new_owner_user_id": 5 }
```

- 仅当前 `owner` 可调用
- `new_owner_user_id` 必须是该空间成员
- 事务：新 owner 角色 → `owner`；原 owner → `admin`（可配置为 `member`，P1 固定 `admin`）
- 禁止：目标为自己、个人空间

### 2.2 离开空间

```
POST /api/teams/:id/leave
```

- 任意成员（含 admin/member/viewer），**不可**为唯一 owner
- 唯一 owner 须先转让或删空间
- 离开后：若 JWT `current_team_id` 为该空间，响应中返回新 `token`（切到另一空间或默认个人空间）

### 2.3 删除协作空间

```
DELETE /api/teams/:id
```

- 仅 `owner`
- 禁止：`slug` 为 `personal-{userId}` 的个人空间
- P1 策略：**硬删除** team 行（CASCADE 成员表）；业务表 `team_id` 资源需明确：
  - **方案 A（推荐 P1）**：拒绝删除若存在用例/计划（返回 409 + 计数）
  - **方案 B（P2）**：软删除 + 归档

请求体（可选）：

```json
{ "confirm_name": "文档测试组" }
```

---

## 3. Service 层

`teamService.js` 新增：

- `transferOwnership(teamId, fromUserId, toUserId)`
- `leaveTeam(teamId, userId)` → `{ nextTeamId }`
- `deleteTeam(teamId, userId, options)`

---

## 4. 前端（空间设置 · 高级 Tab）

| 操作 | 可见 | UI |
|------|------|-----|
| 转让所有权 | owner，非个人空间 | 选择成员下拉 + 确认 |
| 离开空间 | 非唯一 owner 的成员 | 二次确认 |
| 删除空间 | owner，非个人空间 | 输入空间名确认 + 资源数量提示 |

删除/转让成功后：跳转首页或切换到剩余空间。

---

## 5. 安全

- 所有写操作记录 `invited_by` 同级审计字段（P2 写入 `audit_logs`）
- 删除与转让不可恢复（文案强调）

---

## 6. 验收标准

- [ ] 唯一 owner 调用 leave → 400
- [ ] 转让后原 owner 为 admin，新 owner 可删空间
- [ ] 个人空间 DELETE → 400
- [ ] 离开空间后 token 中 `current_team_id` 有效

---

## 7. 依赖

- REQ-B06（高级 Tab 容器）
- REQ-B07（owner 专用路由挂 `requireTeamRole('owner')`）
