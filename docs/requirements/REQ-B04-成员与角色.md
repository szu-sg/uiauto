# REQ-B04 团队成员与角色

| 属性 | 值 |
|------|-----|
| Epic | B 认证、团队与权限 |
| Phase | P1 |
| 状态 | 🟡 API 已有 / UI·权限未闭环 |
| 上级索引 | [需求清单.md](../需求清单.md) · [REQ-B00 总览](./REQ-B00-项目空间总览.md) |

---

## 1. 需求概述

**目标**：在团队空间内管理成员及其角色，控制「谁可以改用例、谁只能看报告」。

---

## 2. 角色模型

| 角色 | 代码 | 说明 |
|------|------|------|
| 所有者 | `owner` | 团队创建者，可转让、删团队 |
| 管理员 | `admin` | 管理成员与设置 |
| 成员 | `member` | 日常测试：用例/计划/执行 |
| 访客 | `viewer` | 只读：看用例、看报告 |

### 权限矩阵

| 操作 | owner | admin | member | viewer |
|------|:-----:|:-----:|:------:|:------:|
| 查看用例/计划/报告 | ✅ | ✅ | ✅ | ✅ |
| 创建/编辑用例 | ✅ | ✅ | ✅ | ❌ |
| 导入用例 | ✅ | ✅ | ✅ | ❌ |
| 删除用例 | ✅ | ✅ | ✅* | ❌ |
| 创建/编辑计划 | ✅ | ✅ | ✅ | ❌ |
| 触发执行/试跑 | ✅ | ✅ | ✅ | ❌ |
| 管理环境 | ✅ | ✅ | ✅ | ❌ |
| 邀请/移除成员 | ✅ | ✅ | ❌ | ❌ |
| 修改团队名 | ✅ | ✅ | ❌ | ❌ |
| 创建 API Token | ✅ | ✅ | ❌ | ❌ |
| 删除团队 | ✅ | ❌ | ❌ | ❌ |

\* member 仅可删自己创建的用例（可选策略，P1 可简化为 member 可删任意团队用例）。

---

## 3. 数据模型

```sql
CREATE TABLE team_members (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invited_by INTEGER REFERENCES users(id),
  joined_at TEXT DEFAULT (datetime('now', '+8 hours')),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX idx_team_members_user ON team_members(user_id);
```

---

## 4. API 设计

```
GET /api/teams/:teamId/members
```

```json
{
  "members": [
    {
      "user_id": 3,
      "email": "a@wps.cn",
      "name": "张三",
      "role": "owner",
      "joined_at": "2026-03-01 10:00:00"
    }
  ]
}
```

```
POST /api/teams/:teamId/members
{ "email": "colleague@wps.cn", "role": "member" }
```

- 若 email 对应用户不存在：返回 404「用户未登录过平台，请先让对方完成一次 SSO」
- 若已是成员：409

```
PATCH /api/teams/:teamId/members/:userId
{ "role": "admin" }
```

```
DELETE /api/teams/:teamId/members/:userId
```

约束：

- 不能移除最后一个 `owner`
- 不能将自己降为 viewer 若是唯一 owner（需先转让）

```
POST /api/teams/:teamId/transfer-ownership
{ "new_owner_user_id": 5 }
```

---

## 5. Service 层

```javascript
const ROLE_RANK = { viewer: 0, member: 1, admin: 2, owner: 3 };

export function getMemberRole(teamId, userId) { ... }

export function requireTeamRole(minRole) {
  return (req, res, next) => {
    const role = getMemberRole(req.teamId, req.user.id);
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
      return res.status(403).json({ error: '权限不足' });
    }
    req.teamRole = role;
    next();
  };
}
```

**路由示例**

```javascript
router.post('/import', requireTeamRole('member'), ...);
router.delete('/:id', requireTeamRole('member'), ...);
router.post('/:teamId/members', requireTeamRole('admin'), ...);
```

---

## 6. 前端

**页面**：`/settings/team` 或团队设置抽屉

- 成员列表（头像、名称、角色、加入时间）
- 邀请：输入 WPS 邮箱 + 角色下拉
- 角色修改 / 移除（admin+ 可见）

---

## 7. 安全

- 邀请仅能通过 email 匹配已存在 `users` 表用户（P1）
- 后续可扩展邀请链接 + 过期 token
- 所有写操作记 `invited_by`

---

## 8. 验收标准

- [ ] viewer 调用 POST /cases/import 返回 403
- [ ] member 可试跑、可建计划
- [ ] admin 可邀请成员
- [ ] 唯一 owner 不可被删除
- [ ] 转让 owner 后原 owner 降为 admin

---

## 9. 依赖

- REQ-B03 团队空间
- REQ-B05 资源隔离（角色与 team 组合校验）
