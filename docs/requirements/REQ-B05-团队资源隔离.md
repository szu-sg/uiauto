# REQ-B05 团队资源隔离与切换

| 属性 | 值 |
|------|-----|
| Epic | B 认证、团队与权限 |
| Phase | P1 |
| 状态 | 🟡 已实现（验收见 backend/scripts/b05-team-isolation-checklist.md） |
| 上级索引 | [需求清单.md](../需求清单.md) · [REQ-B00 总览](./REQ-B00-项目空间总览.md) |

---

## 1. 需求概述

**目标**：所有业务 API 在 **当前团队上下文** 内读写；杜绝跨团队越权访问。

---

## 2. 隔离规则

```
可读资源 ⟺ resource.team_id === req.teamId
         AND 用户 ∈ team_members(team_id)
```

- 查询：自动附加 `WHERE team_id = ?`
- 创建：强制 `team_id = req.teamId`（忽略客户端传入）
- 更新/删除：先 `SELECT ... WHERE id=? AND team_id=?`，无行则 404

**ID 猜测防护**：跨团队访问统一返回 `404 Not Found`，不用 403，避免泄露资源是否存在。

---

## 3. 当前团队解析顺序

```
1. JWT claim: current_team_id
2. Header: X-Team-Id（须在用户 teams 列表内）
3. 用户默认团队（personal team）
```

```javascript
export function resolveTeamId(req) {
  const header = req.headers['x-team-id'];
  if (header) {
    const id = Number(header);
    if (userBelongsToTeam(req.user.id, id)) return id;
    throw forbidden();
  }
  return req.user.current_team_id || req.user.default_team_id;
}
```

---

## 4. 影响的 API 清单

| 路由前缀 | 隔离字段 |
|----------|----------|
| `/api/cases` | team_id |
| `/api/plans` | team_id |
| `/api/environments` | team_id |
| `/api/recorded-runs` | team_id |
| `/api/runs` | team_id |
| `/api/metrics` | team_id 聚合 |

**环境引用校验**：导入用例时 `environment_id` 必须属于同一 `team_id`。

**计划用例校验**：`case_ids` 每个 id 须 `cases.team_id === plan.team_id`。

---

## 5. 前端上下文

```javascript
// UserContext
{
  user,
  currentTeam,
  teams,
  switchTeam(teamId),
  refreshTeams(),
}
```

切换团队后需 invalidate：

- 用例库列表
- 计划列表
- 环境列表
- 进行中的试跑状态（可选提示「已切换团队」）

---

## 6. 迁移

```sql
-- 为无 team_id 的历史行补默认团队
UPDATE case_catalog SET team_id = (
  SELECT tm.team_id FROM team_members tm
  WHERE tm.user_id = case_catalog.user_id AND tm.role = 'owner'
  LIMIT 1
) WHERE team_id IS NULL;
```

---

## 7. 验收标准

- [ ] 用户 A 无法通过 ID 访问团队 B 的用例（404）
- [ ] 创建计划时 case_ids 含外团队 id → 400
- [ ] 切换团队后 API 数据集完全切换
- [ ] environment_id 跨团队引用被拒绝

---

## 8. 依赖

- REQ-B03、REQ-B04
