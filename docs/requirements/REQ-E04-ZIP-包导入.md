# REQ-E04 ZIP 包导入

| 属性 | 值 |
|------|-----|
| Epic | E 导入 |
| Phase | P1 |
| 状态 | ⬜ |
| 上级索引 | [需求清单.md](../需求清单.md) |


> **全局决策（v0.2）**  
> - **D1 团队库**：资源归属 `team_id`，成员按角色访问  
> - **D2 多 Worker**：执行队列可配置并发（`RUN_WORKER_CONCURRENCY`）  
> - **D3 导入环境可选**：无环境 → `portability=portable`；有环境 → `bundle`


---

## 1. 需求概述

**目标**：POST /cases/import/zip



## 2. 范围

### In Scope

- 见顶层设计对应章节

### Out of Scope

- 本阶段不实现项见顶层设计

## 3. 数据模型

见上级文档 §领域模型；含 `team_id` 字段（适用时）。

## 4. API 设计

见顶层设计 §8 REST API。

## 5. Service 层

复用 Application Service 层，不重复实现。

## 6. 前端

见顶层设计 §11 前端演进。

## 7. 安全与权限

REQ-B05 团队隔离 + REQ-B04 角色校验。

## 8. 迁移与兼容

随 Phase 迁移脚本执行。

## 9. 验收标准

- [ ] 三件套 ZIP 可导入

## 10. 依赖关系

- REQ-E01

---

*本文档由需求清单 v0.2 生成，实施时以代码与评审结论为准。*
