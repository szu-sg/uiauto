# 执行器评估：当前能力与优化 / 扩展方向

## 一、当前执行器做了什么

| 环节 | 实现方式 | 说明 |
|------|----------|------|
| **任务队列** | `p-queue`，`concurrency: 1` | 全局单任务串行，同一时间只跑一个计划 |
| **代码拉取** | `simple-git` clone/pull | 按 `owner_repo` 存到 `backend/repos/`，已有则 fetch+checkout+pull |
| **依赖安装** | 仓库内 `npm install` + `npx playwright install --with-deps` | 每次执行计划前在仓库目录执行一次 |
| **单用例执行** | `npx playwright test <casePath>` | 每个用例一个子进程，`--reporter=list`，产物在仓库内 `test-results/` |
| **结果落盘** | 拷贝 `test-results/` → `results/<runId>/<caseId>/`，写 DB | 截图/录屏/trace 路径写入 `run_cases`，日志写 `log.txt` |
| **状态与日志** | 先插 `run_cases` 再更新 | 顺序执行，每条用例：passed/failed、duration、error_message、artifact 路径 |

**数据流**：`POST /api/runs` → 插 `runs` → `executePlan(runId, plan)` 入队 → 队列消费：拉代码 → 装依赖 → 按用例顺序执行 → 拷贝产物 → 更新 DB。

---

## 二、是否需要优化（按优先级）

### 1. 建议优先做的

| 项 | 现状 | 建议 | 理由 |
|----|------|------|------|
| **仓库隔离** | 所有计划共用同一 `repos/<owner>_<repo>` 目录 | 按 run 或 plan 使用独立目录（如 `repos/<owner>_<repo>_<planId>` 或每次 run 临时 clone） | 多计划/多分支并行或先后跑时互不覆盖，避免 checkout 影响其他 run |
| **test-results 污染** | 每次在仓库根目录跑，`test-results/` 被覆盖 | 用 Playwright `--output=results/<runId>-<caseId>` 或跑前清空/使用临时子目录 | 避免上一个用例的产物被下一次覆盖或混在一起 |
| **执行超时** | 无 | 单用例或单次 run 设超时（如 10 分钟/用例），超时则标记 failed 并进入下一条 | 防止单用例卡死拖住整队 |
| **失败可配置** | 一个用例失败后仍继续跑完剩余用例 | 保持当前“全部跑完”即可；可选：支持“遇失败即停”策略 | 满足不同回归策略 |

### 2. 可选优化

| 项 | 现状 | 建议 | 理由 |
|----|------|------|------|
| **并发** | 全局 1 并发 | 仍保持 1，或改为“每计划 1、多计划可排队”的显式队列 | 当前单机单 worker 足够；扩容时再考虑多 worker/多机 |
| **依赖安装** | 每次执行都 `npm install` | 按 repo+branch 做缓存（如 `node_modules` 或 install 结果 hash），未变则跳过 | 缩短重复执行的耗时 |
| **产物清理** | 结果永久保留 | 按时间或数量做清理策略（如只保留最近 N 次 run 的 results） | 避免磁盘占满 |
| **日志** | 仅 stdout/stderr 和 list reporter | 可增加 JSON reporter 或解析 list 输出，结构化步骤 | 报告页可展示“步骤级”结果，而不只是整段日志 |

### 3. 暂可不动的

- **单任务队列**：逻辑简单、行为可预期，适合当前阶段。
- **同机执行**：不引入 Docker/ K8s 前，保持当前方式即可。
- **用例级顺序执行**：与 Playwright 默认行为一致，无需改。

---

## 三、扩展能力与扩展点

### 1. 已具备的扩展基础

- **队列**：`executePlan` 只依赖 `runId` + `plan` 对象，以后可换成 Redis/RabbitMQ 等，只要最后仍调当前执行逻辑即可。
- **结果结构**：`runs` + `run_cases` + 文件系统 `results/<runId>/<caseId>/`，已支持多 run、多用例、多产物。
- **定时**：已有 scheduler 按 cron 触发“创建 run + executePlan”，与手动执行共用同一套执行器。

### 2. 容易扩展的方向

| 方向 | 做法 | 改动量 |
|------|------|--------|
| **多分支/多环境** | plan 或 run 带 `branch` / `env`，`ensureRepo` 和 `runPlaywrightTest` 用该字段 | 小：传参 + 目录或 env 区分 |
| **执行参数** | plan 或 run 存 JSON（如 `extraArgs: ['--project=chromium']`），执行时拼到 `playwright test` 后面 | 小：配置 + 拼 args |
| **重试** | 用例失败时按配置重试 1～N 次再写 DB | 小：在 `runPlaywrightTest` 外裹一层重试循环 |
| **只跑部分用例** | 已有 `plan.cases_json`，可从 run 或 UI 传“本次要跑的 case 列表”覆盖 | 小：执行时用 run 的 case 列表而非 plan |
| **取消运行** | 队列任务带 `runId`，内存维护 `runningRunId`，提供“取消”接口置位；执行循环里每次先查再跑下一条 | 中：需状态查询 + 主动中断 |

### 3. 需要较大改动的方向

| 方向 | 做法 | 说明 |
|------|------|------|
| **多 worker / 多机** | 队列迁到 Redis/RabbitMQ，多进程或多机拉任务；执行器需支持“只处理分配给自己的 run” | 需部署与运维配合 |
| **Docker 执行** | 每次 run 在容器内 clone + install + playwright test，结果拷出 | 环境隔离好，需镜像与挂载设计 |
| **实时日志/进度** | WebSocket 或 SSE 推送当前用例、stdout 片段、进度百分比 | 前端 + 执行器双端改动 |
| **多项目/多 Playwright 版本** | 按 plan 或 repo 指定 Node/Playwright 版本或镜像 | 需版本管理与执行环境隔离 |

---

## 四、建议的落地顺序

1. **先做**：仓库/run 隔离 + test-results 不互相覆盖 + 单用例（或单 run）超时。
2. **再做**：执行参数（如 `--project`、`--retries`）可配置、失败重试策略。
3. **按需**：依赖安装缓存、产物清理策略、结构化步骤日志。
4. **后续**：多 worker、Docker、实时推送等，在需要时再设计。

---

## 五、小结

- **当前**：执行器能稳定完成“按计划顺序跑 Playwright、落结果、写 DB”，适合单机、单 worker、先跑通流程的阶段。
- **优化**：优先解决“仓库与 test-results 隔离”和“超时控制”，再考虑依赖缓存与产物清理。
- **扩展**：在不大改架构的前提下，可以较快支持多分支、执行参数、重试、部分用例、取消运行；多机/Docker/实时推送等留作后续迭代。
