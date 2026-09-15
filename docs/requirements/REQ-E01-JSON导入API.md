# REQ-E01 JSON 导入 API

| 属性 | 值 |
|------|-----|
| Epic | E 手动导入 |
| Phase | P1 |
| 状态 | 🟡 部分完成 |
| 上级索引 | [需求清单.md](../需求清单.md) |

> **全局决策 D3**：**导入环境不必填**。仅提供 `script` 即可入库，标记为 `portability=portable`。

---

## 1. 需求概述

**目标**：`POST /api/cases/import` 作为生产面②的核心入口，承接 Playwright 脚本 + 可选环境 + 可选登录态，写入团队用例库。

---

## 2. Import Package 与可选环境

| 组件 | 必填 | 说明 |
|------|------|------|
| `name` | ✅ | 用例显示名 |
| `script` | ✅ | Playwright Test 全文 |
| `environment_id` | ❌ | 引用团队环境库 |
| `environment` | ❌ | create / snapshot 内联 |
| `auth.storage_state` | ❌ | Playwright Cookie 快照 |

### portability 自动判定

```javascript
function resolvePortability(payload, hasEnv) {
  if (payload.portability === 'portable' || payload.portability === 'bundle') {
    return payload.portability;
  }
  return hasEnv ? 'bundle' : 'portable';
}
```

| 导入内容 | portability | 执行时环境来源 |
|----------|-------------|----------------|
| 仅 script | `portable` | 计划统一环境 / 试跑时手选 |
| script + env | `bundle` | 用例自带环境 |
| script + auth | `bundle` 或 `portable` | 有 env 则 bundle；仅 auth 无 env 仍为 portable（auth 跟用例） |

**注意**：有 `auth` 无 `environment` 时，用例为 portable + `has_auth=true`；执行时用 auth sidecar，环境由计划/试跑指定。

---

## 3. 请求 / 响应

### 请求

```
POST /api/cases/import
Authorization: Bearer <jwt>
Content-Type: application/json
```

```json
{
  "name": "列表页冒烟",
  "description": "从同事脚本导入",
  "tags": ["冒烟"],
  "priority": "P1",
  "script": "import { test, expect } from '@playwright/test';\n\ntest('...', async ({ page }) => {});",
  "environment_id": 3,
  "auth": {
    "storage_state": {
      "cookies": [{ "name": "wps_sid", "value": "...", "domain": ".kdocs.cn", "path": "/" }],
      "origins": []
    }
  }
}
```

**最小请求（D3）**

```json
{
  "name": "纯脚本用例",
  "script": "import { test } from '@playwright/test';\ntest('x', async () => {});"
}
```

### 响应 201

```json
{
  "id": 42,
  "name": "列表页冒烟",
  "source": "imported",
  "portability": "bundle",
  "team_id": 1,
  "default_environment_id": 3,
  "has_auth": true,
  "path": "imported/list-smoke-1710000000.spec.ts",
  "summary": {
    "scriptSaved": true,
    "authSaved": true,
    "environmentLinked": true,
    "environmentSnapshot": false,
    "cookieCount": 1
  }
}
```

### 错误码

| 状态 | 场景 |
|------|------|
| 400 | script 空、格式不对、environment_id 不存在 |
| 403 | viewer 角色 |
| 404 | environment_id 不属于当前团队 |

---

## 4. 校验流程

```
validateScript(script)
  → resolveImportEnvironment(teamId, environment_id | environment)
  → filterEssentialStorageState(auth)
  → resolvePortability()
  → persistCaseFiles(teamId, caseId, ...)
  → INSERT cases (+ case_versions v1)
```

### validateScript 规则

1. 非空，≤ 500KB
2. 匹配 `test(` 或 `@playwright/test`
3. （P3 严格模式）禁止 `child_process`、`eval`

### environment.mode=create

```json
{
  "environment": {
    "mode": "create",
    "name": "测试环境A",
    "env_kind": "test",
    "base_url": "https://365.kdocs.cn",
    "switchhosts_text": "10.0.0.1 www.kdocs.cn"
  }
}
```

- `name` 必填；`base_url` 强烈建议（P1 可 warning 不阻断）
- 新建环境 `team_id` = 当前团队

---

## 5. 文件落盘（过渡期 → REQ-C03）

当前（过渡）：

```
data/recorded-cases/imported/{slug}-{ts}.spec.ts
data/recorded-cases/imported/{slug}-{ts}.auth.json
```

目标：

```
data/cases/{team_id}/{case_id}/case.spec.ts
data/cases/{team_id}/{case_id}/case.auth.json
```

---

## 6. 与顶层设计差异（已对齐 D3）

| 顶层设计原 §6.6.3 | v0.2 决策 |
|-------------------|-----------|
| environment 必填其一 | **改为可选**；无环境 = portable |
| 导入无环境报错 | **不报错**；加入计划时需计划环境（REQ-I02） |

---

## 7. 验收标准

- [x] 仅 name + script 可导入（portable）
- [ ] environment_id 须属当前团队
- [ ] create / snapshot 模式完整
- [ ] auth 过滤核心 Cookie
- [ ] team_id、created_by 正确写入
- [ ] viewer 403

---

## 8. 依赖

- REQ-B05 团队隔离
- REQ-E02 脚本校验
- REQ-C01 cases 表（或过渡期 case_catalog）
- REQ-C03 workspace 目标路径

---

## 9. 实现现状

| 项 | 状态 |
|----|------|
| `POST /cases/import` | ✅ |
| `caseImport.js` | ✅ |
| 环境可选 / portable | ✅ |
| team_id | ⬜ 待 REQ-B03 |
| create 环境 base_url 校验 | ⬜ |
| cases 表 | ⬜ 仍写 case_catalog |
