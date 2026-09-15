# REQ-A02 操作审计

| 属性 | 值 |
|------|-----|
| Epic | A 平台基础 |
| Phase | P4 |
| 状态 | ⬜ 未开始 |
| 上级索引 | [需求清单.md](../需求清单.md) |


> **全局决策（v0.2）**  
> - **D1 团队库**：资源归属 `team_id`，成员按角色访问  
> - **D2 多 Worker**：执行队列可配置并发（`RUN_WORKER_CONCURRENCY`）  
> - **D3 导入环境可选**：无环境 → `portability=portable`；有环境 → `bundle`


---

## 1. 需求概述

**目标**：MCP / API Token / Agent 操作可追溯，满足协作排查与合规。



## 2. 范围

### In Scope

- 审计表
- Service 层 audit 钩子
- 敏感字段脱敏

### Out of Scope

- 完整 SIEM 对接
- 用户行为录屏

## 3. 数据模型

```sql
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER REFERENCES teams(id),
  user_id INTEGER,
  actor TEXT NOT NULL,        -- user:{id} | agent:{name}
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id INTEGER,
  payload_json TEXT,
  created_at TEXT DEFAULT (datetime('now', '+8 hours'))
);
```

## 4. API 设计

内部 Service API：`audit({ teamId, actor, action, resource, payload })`；可选 `GET /api/audit`（仅 team admin）。

## 5. Service 层

在 CaseService.import、PlanService.run、MCP 代理层统一调用。

## 6. 前端

团队设置页「操作日志」Tab（可选 P4+）。

## 7. 安全与权限

payload 不落 Cookie/密码明文；viewer 角色不可读审计。

## 8. 迁移与兼容

新表，无迁移。

## 9. 验收标准

- [ ] import_case 产生审计记录
- [ ] 审计含 team_id 与 actor
- [ ] 列表不展示密钥

## 10. 依赖关系

- REQ-B03
- REQ-B02
- REQ-F01

---

*本文档由需求清单 v0.2 生成，实施时以代码与评审结论为准。*
