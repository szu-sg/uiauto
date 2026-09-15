# REQ-B07 API 权限矩阵落地

| 属性 | 值 |
|------|-----|
| Epic | B 认证、团队与权限 |
| Phase | P1 |
| 状态 | ✅ 已实现 |
| 上级索引 | [REQ-B00-项目空间总览.md](./REQ-B00-项目空间总览.md) |

---

## 1. 需求概述

**目标**：将 [REQ-B04](./REQ-B04-成员与角色.md) 权限矩阵落实到**后端路由**；前端按钮隐藏为辅助，**以 API 为准**。

**现状**：`requireTeamRole` 仅用于 `routes/teams.js`；`cases` / `plans` / `environments` / `recorder` / `runs` 等未按 `viewer` 拦截写操作。

---

## 2. 中间件约定

沿用 `middleware/teamAuth.js`：

```javascript
// attachTeam：解析 req.teamId、req.teamRole
// requireTeamRole('member')：viewer 不可过
// requireTeamRole('admin')：仅 admin、owner
```

**顺序**：`requireAuth` → `attachTeam` → `requireTeamRole(...)` → 业务 handler。

---

## 3. 路由级最低角色（P1）

| 模块 | 方法 / 路径模式 | 最低角色 | 备注 |
|------|-----------------|----------|------|
| cases | GET `*` | viewer | 只读 |
| cases | POST/PATCH/DELETE 写 | member | 含 import、试跑触发 |
| cases | 批量删除 | member | P1 不区分「仅删自己的」 |
| plans | GET `*` | viewer | |
| plans | POST/PATCH/DELETE | member | |
| plans | POST execute / trigger run | member | |
| environments | GET `*` | viewer | |
| environments | POST/PATCH/DELETE | member | |
| runs / recorded-runs | GET `*` | viewer | 报告只读 |
| metrics | GET `*` | viewer | |
| recorder | POST 入库 / pipeline | member | |
| teams | members 写 | admin | 已有 |
| teams | PATCH 改名 | admin | 已有 |
| teams | transfer / delete | owner | B08 新增 |

**跨团队 ID**：继续 `assertTeamResource` → **404**（B05）。

---

## 4. 实现步骤（建议 PR 拆分）

1. **基础设施**：确保所有业务 router `use(attachTeam)`；导出 `requireTeamRole` 单测或脚本用例表。
2. **cases + plans**：挂 member 写、viewer 读；跑一遍手工用例表。
3. **environments + runs + metrics + recorder**：同上。
4. **前端**：根据 `user.teams[].role` 或 `GET /auth/me` 扩展 `current_team_role`（若 JWT 未带 role，可在 me 接口返回当前空间 role）。
5. **文档**：B04 验收项勾选。

### 4.1 建议扩展 `GET /api/auth/me`

```json
{
  "current_team_id": 2,
  "current_team_role": "member",
  "teams": [{ "id": 2, "name": "…", "role": "member" }]
}
```

（`teams[].role` 已有；`current_team_role` 避免前端每次算。）

---

## 5. 错误响应

| 场景 | HTTP | body |
|------|------|------|
| 未登录 | 401 | 现有 |
| 非成员 / 跨 team 资源 | 404 | `{ "error": "…" }` |
| 角色不足 | 403 | `{ "error": "权限不足", "code": "TEAM_FORBIDDEN" }` |

---

## 6. 验收标准

- [ ] `viewer` 用户 `POST /api/cases/import` → 403
- [ ] `viewer` 用户 `GET /api/cases` → 200
- [ ] `member` 用户创建计划、触发执行 → 200
- [ ] `admin` 与 `member` 对 cases 写权限一致（P1）
- [ ] 自动化：可选 `backend/test/teamRoles.test.js` 覆盖 3 角色 × 2 接口

---

## 7. 依赖

- REQ-B05（team_id 隔离已存在）
- REQ-B04（矩阵定义）
