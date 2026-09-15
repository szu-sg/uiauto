# REQ-J01 统一 CaseRunner

| 属性 | 值 |
|------|-----|
| Epic | J 执行引擎 |
| Phase | P2 |
| 状态 | ⬜ 未开始 |
| 上级索引 | [需求清单.md](../需求清单.md) |

---

## 1. 需求概述

**目标**：合并 `executor.js`（Git clone 执行）与 `recordedRunner.js`（workspace 试跑）为单一 **`CaseRunner`**，所有执行路径一致。

---

## 2. 接口设计

```javascript
// backend/src/services/caseRunner.js

/**
 * 执行单条用例
 */
export async function runCase({
  teamId,
  userId,
  caseId,
  caseVersion = null,
  planId = null,           // 计划上下文，用于 resolveEnvironment
  environmentId = null,    // 显式覆盖
  options = {},            // headed, browser, chromiumOnly
}) { ... }

/**
 * 执行计划（内层串行或按 RUN_PLAN_CASE_CONCURRENCY）
 */
export async function runPlan({
  teamId,
  userId,
  planId,
  options = {},
}) { ... }

/**
 * 入队异步执行（试跑/计划触发）
 */
export function enqueueCaseRun(params) { ... }
export function enqueuePlanRun(params) { ... }
```

---

## 3. 执行流水线

```
runCase()
  ├─ loadCase(teamId, caseId)           // 校验归属
  ├─ loadPlan(planId?)                  // 可选
  ├─ resolveExecutionEnvironment()      // REQ-G02
  ├─ resolveAuth(case, env)             // auth sidecar > 环境登录
  ├─ materializeWorkspace(case)         // symlink/copy spec 到 _workspace
  ├─ prepareExecutionProfile(env)       // .uiauto-execution.json
  ├─ injectAuth(auth)                   // auth.json
  ├─ npx playwright test <spec>        // 子进程
  └─ collectArtifacts() → case_runs / run_cases
```

**不再调用**：`git clone`、`prepareGitWorkspace`、`github.js`。

---

## 4. 与多 Worker 集成（REQ-J05）

```javascript
export function enqueueCaseRun(params) {
  return globalRunQueue.add(() => spawnCaseWorker(params));
}
```

---

## 5. 计划执行

```javascript
export async function runPlan({ teamId, userId, planId, options }) {
  const plan = loadPlan(teamId, planId);
  const caseIds = JSON.parse(plan.case_ids_json || '[]');
  const runId = createPlanRun(plan);

  for (const caseId of caseIds) {
    await getPlanQueue(runId).add(() =>
      runCase({ teamId, userId, caseId, planId, options, planRunId: runId })
    );
  }
  finalizePlanRun(runId);
}
```

---

## 6. 文件变更

| 操作 | 文件 |
|------|------|
| 新建 | `caseRunner.js`, `runQueue.js` |
| 重构 | `recordedRunJob.js` → 调 `runCase` |
| 瘦身 | `executor.js` 仅保留 `runPlaywrightTest` 等底层 |
| 删除 | `prepareGitWorkspace`, `github` 引用 |

---

## 7. 验收标准

- [ ] 试跑走 CaseRunner
- [ ] 计划执行走 CaseRunner
- [ ] 无 git clone 日志
- [ ] portable 用例在计划内用计划环境
- [ ] bundle 用例忽略计划环境

---

## 8. 依赖

- REQ-C01、REQ-C03
- REQ-G02、REQ-G03
- REQ-C05（plan case_ids）
- REQ-J05（队列入队）
