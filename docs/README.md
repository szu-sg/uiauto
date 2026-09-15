# UIAuto 文档

| 文档 | 说明 |
|------|------|
| [顶层设计-用例平台化.md](./顶层设计-用例平台化.md) | 平台架构、用例模型、生产面规划（**Why / What**） |
| [需求清单.md](./需求清单.md) | 可排期需求索引、全局决策、迭代顺序（**总览**） |
| [requirements/](./requirements/) | **每条需求的独立详细设计**（57 篇 REQ-*.md） |
| [Ubuntu部署指南.md](./Ubuntu部署指南.md) | 服务器部署、Playwright、环境变量 |

## 已确认设计决策（v0.2）

| 决策 | 结论 |
|------|------|
| 用例隔离 | **团队库**（`team_id` + 成员角色） |
| 执行并发 | **多 Worker**（`RUN_WORKER_CONCURRENCY`） |
| 导入环境 | **可选**（无环境 → `portability=portable`） |

## 文档阅读顺序

1. 顶层设计 → 理解目标架构  
2. 需求清单 → 看 Phase 与优先级  
3. `requirements/REQ-*.md` → 开发前读对应条目  

## SSO 登录配置速查

1. 复制 `backend/.env.example` → `backend/.env`
2. 设置 `JWT_SECRET`、`WPS_APPID`、`WPS_APPKEY`
3. `WPS_REDIRECT_URI` 与 WPS 开放平台登记**完全一致**（含尾斜杠）
4. 生产环境**不要**设置 `AUTH_DISABLED=1`

## 重新生成需求文档

修改 `scripts/gen-req-docs.mjs` 后执行：

```bash
node scripts/gen-req-docs.mjs
```

核心需求（B03、E01、J05 等）在生成后另有手写增强版，生成时勿覆盖（或从脚本中排除）。
