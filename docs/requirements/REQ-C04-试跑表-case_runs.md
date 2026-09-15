# REQ-C04 试跑表 case_runs

| 属性 | 值 |
|------|-----|
| Epic | C 数据模型 |
| Phase | P2 |
| 状态 | 🟡 部分完成 |
| 上级索引 | [需求清单.md](../需求清单.md) |


> **全局决策（v0.2）**  
> - **D1 团队库**：资源归属 `team_id`，成员按角色访问  
> - **D2 多 Worker**：执行队列可配置并发（`RUN_WORKER_CONCURRENCY`）  
> - **D3 导入环境可选**：无环境 → `portability=portable`；有环境 → `bundle`


---

## 1. 需求概述

**目标**：recorded_runs 重命名为 case_runs，关联 case_id + team_id。



## 2. 范围

### In Scope

- 表重命名
- API 路径演进

### Out of Scope

- 分布式 run 追踪

## 3. 数据模型

case_runs：team_id, case_id, case_version, environment_id, status, ...

## 4. API 设计

/api/case-runs（新）；/api/recorded-runs deprecated 一期。

## 5. Service 层

recordedRunner → caseRunService。

## 6. 前端

试跑历史路由可保留，调新 API。

## 7. 安全与权限

team 隔离。

## 8. 迁移与兼容

ALTER + 数据拷贝；case_catalog_id → case_id。

## 9. 验收标准

- [ ] 新试跑写 case_runs
- [ ] MCP get_case_run 用新路径

## 10. 依赖关系

- REQ-C01
- REQ-J01

---

*本文档由需求清单 v0.2 生成，实施时以代码与评审结论为准。*
