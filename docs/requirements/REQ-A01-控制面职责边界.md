# REQ-A01 控制面职责边界

| 属性 | 值 |
|------|-----|
| Epic | A 平台基础 |
| Phase | P0 |
| 状态 | ✅ 已完成 |
| 上级索引 | [需求清单.md](../需求清单.md) |


> **全局决策（v0.2）**  
> - **D1 团队库**：资源归属 `team_id`，成员按角色访问  
> - **D2 多 Worker**：执行队列可配置并发（`RUN_WORKER_CONCURRENCY`）  
> - **D3 导入环境可选**：无环境 → `portability=portable`；有环境 → `bundle`


---

## 1. 需求概述

**目标**：平台只做「承接 → 管理 → 执行 → 报告」，不承担 Git 版本管理与仓库同步。



## 2. 范围

### In Scope

- 用例/环境/计划/执行/报告 CRUD
- 三条生产面汇入同一 Service
- 团队库作为资源归属单位

### Out of Scope

- Git clone/pull
- GitHub 权限绑定
- 用例 Code Review 流程

## 3. 数据模型

无新增表。所有业务表通过 `team_id` 归属团队（见 REQ-B03）。

## 4. API 设计

无独立 API。约束体现在各业务 API 不暴露 Git 参数。

## 5. Service 层

代码审查规则：新 PR 不得新增 `github.js` / `git clone` 调用链。

## 6. 前端

文案统一为「录制 / 导入 / 执行」，不出现「从 GitHub 拉取」作为主流程。

## 7. 安全与权限

资源访问校验 `team_id` + 角色（REQ-B04）。

## 8. 迁移与兼容

Git 相关入口标记 deprecated（REQ-M01）后删除。

## 9. 验收标准

- [ ] 新功能不依赖 Git 路径
- [ ] README 与顶层设计一致
- [ ] 首页主流程无 Git 拉取

## 10. 依赖关系

- 无

---

*本文档由需求清单 v0.2 生成，实施时以代码与评审结论为准。*
