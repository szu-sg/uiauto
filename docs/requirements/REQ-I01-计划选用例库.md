# REQ-I01 计划创建选用例库

| 属性 | 值 |
|------|-----|
| Epic | I 测试计划 |
| Phase | P1 |
| 状态 | ⬜ 未开始 |
| 上级索引 | [需求清单.md](../需求清单.md) |

---

## 1. 需求概述

**目标**：新建/编辑计划时从 **团队用例库** 勾选 `case_id`，彻底移除 GitHub 拉取流程。

---

## 2. 新用户流程

```
创建计划
  → 填写名称、描述
  → 选择计划统一环境（可选，见 REQ-I02）
  → 从用例库勾选用例（case_ids）
  → 配置定时 / 通知 / 浏览器
  → 保存
```

对比旧流程：~~填写 Git 仓库 → 拉取 → 勾选 path~~

---

## 3. API

### 创建

```
POST /api/plans
{
  "name": "每日冒烟",
  "description": "",
  "case_ids": [12, 15, 20],
  "environment_id": 3,
  "schedule_cron": "0 9 * * *",
  "schedule_enabled": true,
  "run_browsers_json": ["chromium"]
}
```

- `team_id` 由 `req.teamId` 注入
- 校验每个 `case_id` 属于同一 team

### 更新

```
PATCH /api/plans/:id
{ "case_ids": [12, 15, 20, 21], "environment_id": 3 }
```

### 读取

```json
{
  "id": 5,
  "name": "每日冒烟",
  "team_id": 1,
  "environment_id": 3,
  "case_ids": [12, 15, 20],
  "cases": [
    { "id": 12, "name": "登录", "portability": "bundle", "has_own_environment": true },
    { "id": 15, "name": "列表", "portability": "portable", "has_own_environment": false }
  ]
}
```

`cases` 为服务端 join 填充，方便前端展示。

---

## 4. 前端改造

### PlanNew.jsx

| 移除 | 新增 |
|------|------|
| Git 仓库表单 | 用例库勾选表 |
| `pullCasesFromGitHub` | `GET /cases` 团队列表 |
| `cases_json` paths | `case_ids` numbers |
| repo_owner/repo_name | — |

复用/改造 `PlanCaseSelect.jsx`：

- 列：名称、来源、portability、优先级、标签
- 筛选：来源、portability
- 已选 N 条

### PlanList / PlanDetail

- 去掉 repo 展示
- 显示「本计划 N 条用例」

---

## 5. 兼容读取

```javascript
function resolvePlanCases(plan) {
  if (plan.case_ids_json) {
    return JSON.parse(plan.case_ids_json);
  }
  // 过渡期：cases_json 路径 → 查 cases 表换 id
  const paths = JSON.parse(plan.cases_json || '[]');
  return db.prepare(`
    SELECT id FROM cases WHERE team_id = ? AND script_path IN (${placeholders})
  `).all(plan.team_id, ...paths).map(r => r.id);
}
```

---

## 6. 验收标准

- [ ] PlanNew 页面无 Git 输入
- [ ] 保存后 plans.case_ids_json 正确
- [ ] 勾选跨团队 case_id 失败
- [ ] 计划详情展示用例名与 portable/bundle 标识
- [ ] 旧计划（仅 paths）只读可打开

---

## 7. 依赖

- REQ-C05 case_ids_json
- REQ-B05 团队隔离
- REQ-H01 用例列表
- REQ-I02 环境校验（保存时）

---

## 8. 删除清单（本 REQ 完成后）

- `frontend/src/utils/caseCatalogPull.js` 引用（最终 REQ-M02 删文件）
- `PlanNew` 中 github 步骤 UI
