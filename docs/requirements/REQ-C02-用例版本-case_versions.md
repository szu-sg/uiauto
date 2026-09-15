# REQ-C02 用例版本 case_versions

| 属性 | 值 |
|------|-----|
| Epic | C 数据模型 |
| Phase | P3 |
| 状态 | ⬜ 未开始 |
| 上级索引 | [需求清单.md](../需求清单.md) |


> **全局决策（v0.2）**  
> - **D1 团队库**：资源归属 `team_id`，成员按角色访问  
> - **D2 多 Worker**：执行队列可配置并发（`RUN_WORKER_CONCURRENCY`）  
> - **D3 导入环境可选**：无环境 → `portability=portable`；有环境 → `bundle`


---

## 1. 需求概述

**目标**：脚本修订留痕、回滚、Agent 多轮迭代。



## 2. 范围

### In Scope

- case_versions 表
- restore API

### Out of Scope

- 二进制附件版本

## 3. 数据模型

见顶层设计 §6.2 / §7.1 case_versions 表。

## 4. API 设计

GET /cases/:id/versions；POST /cases/:id/versions/:v/restore；PATCH 改脚本自动 +1 version。

## 5. Service 层

VersionService.createOnScriptChange()。

## 6. 前端

编辑页版本侧栏 + diff（REQ-H04）。

## 7. 安全与权限

viewer 不可回滚。

## 8. 迁移与兼容

现有用例 seed version=1 从 metadata_json.script。

## 9. 验收标准

- [ ] 改脚本 version++
- [ ] 回滚后试跑用旧脚本
- [ ] created_by 支持 agent:name

## 10. 依赖关系

- REQ-C01
- REQ-H04

---

*本文档由需求清单 v0.2 生成，实施时以代码与评审结论为准。*
