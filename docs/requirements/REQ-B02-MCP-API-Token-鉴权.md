# REQ-B02 MCP API Token 鉴权

| 属性 | 值 |
|------|-----|
| Epic | B 认证团队 |
| Phase | P4 |
| 状态 | ⬜ 未开始 |
| 上级索引 | [需求清单.md](../需求清单.md) |


> **全局决策（v0.2）**  
> - **D1 团队库**：资源归属 `team_id`，成员按角色访问  
> - **D2 多 Worker**：执行队列可配置并发（`RUN_WORKER_CONCURRENCY`）  
> - **D3 导入环境可选**：无环境 → `portability=portable`；有环境 → `bundle`


---

## 1. 需求概述

**目标**：MCP / 脚本通过 Token 调用 REST，scope 按团队授权。



## 2. 范围

### In Scope

- Token CRUD
- scope 校验
- 团队级 Token

### Out of Scope

- OAuth device flow

## 3. 数据模型

```sql
CREATE TABLE api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT,
  created_at TEXT
);
```

## 4. API 设计

`POST /api/tokens`、`GET /api/tokens`、`DELETE /api/tokens/:id`；请求头 `Authorization: Bearer <token>`。

## 5. Service 层

中间件解析 Token → `req.user` + `req.teamId` + `req.scopes`。

## 6. 前端

团队设置 → API Token 管理（创建、复制一次、吊销）。

## 7. 安全与权限

仅存 hash；scopes 最小权限；Token 绑定 team_id。

## 8. 迁移与兼容

新表。

## 9. 验收标准

- [ ] 无 runs:execute scope 不能 run_plan
- [ ] Token 只能访问所属团队资源
- [ ] 吊销后立即失效

## 10. 依赖关系

- REQ-B03
- REQ-B04
- REQ-F01

---

*本文档由需求清单 v0.2 生成，实施时以代码与评审结论为准。*
