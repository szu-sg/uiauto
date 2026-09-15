# REQ-C05 计划 case_ids_json

| 属性 | 值 |
|------|-----|
| Epic | C 数据模型 |
| Phase | P1 |
| 状态 | ⬜ 未开始 |
| 上级索引 | [需求清单.md](../需求清单.md) |


> **全局决策（v0.2）**  
> - **D1 团队库**：资源归属 `team_id`，成员按角色访问  
> - **D2 多 Worker**：执行队列可配置并发（`RUN_WORKER_CONCURRENCY`）  
> - **D3 导入环境可选**：无环境 → `portability=portable`；有环境 → `bundle`


---

## 1. 需求概述

**目标**：计划绑定 case_id[]，废弃 cases_json 路径列表。



## 2. 范围

### In Scope

- case_ids_json 字段
- 兼容读取旧 plans

### Out of Scope

- 计划内用例排序拖拽（后续）

## 3. 数据模型

plans.case_ids_json TEXT -- [1,2,3]；plans.team_id。

## 4. API 设计

POST /plans { name, case_ids, environment_id, team_id implicit }。

## 5. Service 层

迁移时 paths → ids 查表。

## 6. 前端

PlanNew 提交 case_ids。

## 7. 安全与权限

case_ids 须属同一 team。

## 8. 迁移与兼容

cases_json 路径反查 id 写入 case_ids_json。

## 9. 验收标准

- [ ] 新建计划无 repo 字段
- [ ] 执行前校验 case 存在
- [ ] 旧计划只读兼容一期

## 10. 依赖关系

- REQ-C01
- REQ-B05
- REQ-I01

---

*本文档由需求清单 v0.2 生成，实施时以代码与评审结论为准。*
