# REQ-B10 空间概览与统计

| 属性 | 值 |
|------|-----|
| Epic | B 认证、团队与权限 |
| Phase | P1（轻量） |
| 状态 | ✅ 已实现 |
| 上级索引 | [REQ-B00-项目空间总览.md](./REQ-B00-项目空间总览.md) |

---

## 1. 需求概述

**目标**：在空间设置「概览」Tab 展示当前空间的**一眼信息**，便于负责人掌握规模，无需进用例库数条数。

---

## 2. API

```
GET /api/teams/:id/summary
```

响应示例：

```json
{
  "team": { "id": 2, "name": "文档测试组", "slug": "doc-qa", "is_personal": false },
  "my_role": "admin",
  "member_count": 8,
  "counts": {
    "cases": 120,
    "plans": 5,
    "environments": 3
  },
  "last_run_at": "2026-03-10 18:00:00"
}
```

- 任意成员可读
- `last_run_at`：`runs` 表该 `team_id` 最近一条 `started_at`（无则 null）
- 实现：单 SQL 聚合或 `teamService.getTeamSummary`

---

## 3. 前端

- 概览 Tab：卡片展示计数 + 快捷链接（用例库、计划列表、环境管理）
- 可选：最近 5 条计划执行状态（P2，复用 runs API）

---

## 4. 验收标准

- [ ] 切换空间后 summary 数字与列表一致
- [ ] viewer 可访问 summary

---

## 5. 依赖

- REQ-B06（概览 Tab 占位）
