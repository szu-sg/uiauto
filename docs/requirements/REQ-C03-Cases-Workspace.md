# REQ-C03 Cases Workspace

| 属性 | 值 |
|------|-----|
| Epic | C 数据模型 |
| Phase | P1 |
| 状态 | 🟡 部分完成 |
| 上级索引 | [需求清单.md](../需求清单.md) |


> **全局决策（v0.2）**  
> - **D1 团队库**：资源归属 `team_id`，成员按角色访问  
> - **D2 多 Worker**：执行队列可配置并发（`RUN_WORKER_CONCURRENCY`）  
> - **D3 导入环境可选**：无环境 → `portability=portable`；有环境 → `bundle`


---

## 1. 需求概述

**目标**：脚本按 team/user/case 目录组织，统一 Playwright 项目壳。



## 2. 范围

### In Scope

- data/cases/_workspace
- {team_id}/{case_id}/

### Out of Scope

- 对象存储 S3

## 3. 数据模型

```
data/cases/_workspace/     # package.json, playwright.config.ts
data/cases/{team_id}/{case_id}/
  case.spec.ts
  case.auth.json
  env.snapshot.json
```

## 4. API 设计

无独立 API；由 CaseService 写文件。

## 5. Service 层

caseWorkspace.js 替代 recordedCases.js。

## 6. 前端

无。

## 7. 安全与权限

路径校验防目录穿越；仅本团队可读。

## 8. 迁移与兼容

recorded-cases/imported/* → 新目录；更新 script_path。

## 9. 验收标准

- [ ] 新用例路径符合规范
- [ ] 删除用例删目录
- [ ] 试跑可找到 spec

## 10. 依赖关系

- REQ-B03
- REQ-C01

---

*本文档由需求清单 v0.2 生成，实施时以代码与评审结论为准。*
