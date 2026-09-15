/**
 * 生成 docs/requirements/REQ-*.md 详细设计文档
 * 运行: node scripts/gen-req-docs.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../docs/requirements');

const DECISIONS = `
> **全局决策（v0.2）**  
> - **D1 团队库**：资源归属 \`team_id\`，成员按角色访问  
> - **D2 多 Worker**：执行队列可配置并发（\`RUN_WORKER_CONCURRENCY\`）  
> - **D3 导入环境可选**：无环境 → \`portability=portable\`；有环境 → \`bundle\`
`;

function doc(meta) {
  const {
    id, title, epic, phase, status, goal, scopeIn, scopeOut,
    dataModel, api, service, frontend, security, migration,
    acceptance, depends, notes = '',
  } = meta;

  return `# ${id} ${title}

| 属性 | 值 |
|------|-----|
| Epic | ${epic} |
| Phase | ${phase} |
| 状态 | ${status} |
| 上级索引 | [需求清单.md](../需求清单.md) |

${DECISIONS}

---

## 1. 需求概述

**目标**：${goal}

${notes ? `**补充说明**：${notes}\n` : ''}

## 2. 范围

### In Scope

${scopeIn.map((s) => `- ${s}`).join('\n')}

### Out of Scope

${scopeOut.map((s) => `- ${s}`).join('\n')}

## 3. 数据模型

${dataModel}

## 4. API 设计

${api}

## 5. Service 层

${service}

## 6. 前端

${frontend}

## 7. 安全与权限

${security}

## 8. 迁移与兼容

${migration}

## 9. 验收标准

${acceptance.map((s) => `- [ ] ${s}`).join('\n')}

## 10. 依赖关系

${depends.length ? depends.map((d) => `- ${d}`).join('\n') : '- 无'}

---

*本文档由需求清单 v0.2 生成，实施时以代码与评审结论为准。*
`;
}

const REQ = [
  {
    id: 'REQ-A01', title: '控制面职责边界', epic: 'A 平台基础', phase: 'P0', status: '✅ 已完成',
    goal: '平台只做「承接 → 管理 → 执行 → 报告」，不承担 Git 版本管理与仓库同步。',
    scopeIn: ['用例/环境/计划/执行/报告 CRUD', '三条生产面汇入同一 Service', '团队库作为资源归属单位'],
    scopeOut: ['Git clone/pull', 'GitHub 权限绑定', '用例 Code Review 流程'],
    dataModel: '无新增表。所有业务表通过 `team_id` 归属团队（见 REQ-B03）。',
    api: '无独立 API。约束体现在各业务 API 不暴露 Git 参数。',
    service: '代码审查规则：新 PR 不得新增 `github.js` / `git clone` 调用链。',
    frontend: '文案统一为「录制 / 导入 / 执行」，不出现「从 GitHub 拉取」作为主流程。',
    security: '资源访问校验 `team_id` + 角色（REQ-B04）。',
    migration: 'Git 相关入口标记 deprecated（REQ-M01）后删除。',
    acceptance: ['新功能不依赖 Git 路径', 'README 与顶层设计一致', '首页主流程无 Git 拉取'],
    depends: [],
  },
  {
    id: 'REQ-A02', title: '操作审计', epic: 'A 平台基础', phase: 'P4', status: '⬜ 未开始',
    goal: 'MCP / API Token / Agent 操作可追溯，满足协作排查与合规。',
    scopeIn: ['审计表', 'Service 层 audit 钩子', '敏感字段脱敏'],
    scopeOut: ['完整 SIEM 对接', '用户行为录屏'],
    dataModel: `\`\`\`sql
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER REFERENCES teams(id),
  user_id INTEGER,
  actor TEXT NOT NULL,        -- user:{id} | agent:{name}
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id INTEGER,
  payload_json TEXT,
  created_at TEXT DEFAULT (datetime('now', '+8 hours'))
);
\`\`\``,
    api: '内部 Service API：`audit({ teamId, actor, action, resource, payload })`；可选 `GET /api/audit`（仅 team admin）。',
    service: '在 CaseService.import、PlanService.run、MCP 代理层统一调用。',
    frontend: '团队设置页「操作日志」Tab（可选 P4+）。',
    security: 'payload 不落 Cookie/密码明文；viewer 角色不可读审计。',
    migration: '新表，无迁移。',
    acceptance: ['import_case 产生审计记录', '审计含 team_id 与 actor', '列表不展示密钥'],
    depends: ['REQ-B03', 'REQ-B02', 'REQ-F01'],
  },
  {
    id: 'REQ-B01', title: 'WPS SSO 多人协作', epic: 'B 认证团队', phase: 'P0', status: '✅ 已完成',
    goal: '生产环境强制 WPS OAuth；用户身份可识别，为团队库奠基。',
    scopeIn: ['OAuth 授权码流程', 'JWT 会话', 'logout', 'super_admin 配置'],
    scopeOut: ['团队内角色（见 REQ-B04）', 'LDAP'],
    dataModel: '`users` 表：id, email, name, role, wps_uid, created_at。',
    api: '`GET /auth/wps/url`、`POST /auth/wps/callback`、`POST /auth/logout`、`GET /auth/me`。',
    service: '`wpsOAuth.js` 换 token；`auth.js` 签发 JWT。',
    frontend: '`OAuthCallback` 处理 `?code=`；`VITE_AUTH_DISABLED` 仅 DEV。',
    security: '生产禁止 AUTH_DISABLED；JWT_SECRET 独立配置。',
    migration: '已有用户保留；首次 SSO 用户可 bootstrap 默认团队（REQ-B03）。',
    acceptance: ['生产 SSO 登录成功', '用户数据按 user_id 创建', '回调 URI 与开放平台一致'],
    depends: [],
    notes: '团队库上线后，登录响应需增加 `teams[]` 与 `current_team_id`。',
  },
  {
    id: 'REQ-B02', title: 'MCP API Token 鉴权', epic: 'B 认证团队', phase: 'P4', status: '⬜ 未开始',
    goal: 'MCP / 脚本通过 Token 调用 REST，scope 按团队授权。',
    scopeIn: ['Token CRUD', 'scope 校验', '团队级 Token'],
    scopeOut: ['OAuth device flow'],
    dataModel: `\`\`\`sql
CREATE TABLE api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT,
  created_at TEXT
);
\`\`\``,
    api: '`POST /api/tokens`、`GET /api/tokens`、`DELETE /api/tokens/:id`；请求头 `Authorization: Bearer <token>`。',
    service: '中间件解析 Token → `req.user` + `req.teamId` + `req.scopes`。',
    frontend: '团队设置 → API Token 管理（创建、复制一次、吊销）。',
    security: '仅存 hash；scopes 最小权限；Token 绑定 team_id。',
    migration: '新表。',
    acceptance: ['无 runs:execute scope 不能 run_plan', 'Token 只能访问所属团队资源', '吊销后立即失效'],
    depends: ['REQ-B03', 'REQ-B04', 'REQ-F01'],
  },
  {
    id: 'REQ-B03', title: '团队空间（Team）', epic: 'B 认证团队', phase: 'P1', status: '⬜ 未开始',
    goal: '引入团队作为用例/计划/环境的归属单位，支持多人协作共享资产。',
    scopeIn: ['teams 表', '用户默认团队', '当前团队上下文', '资源 team_id'],
    scopeOut: ['多团队计费', '跨团队用例复制（后续）'],
    dataModel: `\`\`\`sql
CREATE TABLE teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now', '+8 hours'))
);

-- 用户注册/首次 SSO 时自动创建：
-- name = "{用户昵称}的团队", slug = "user-{user_id}"
\`\`\`

业务表新增 \`team_id INTEGER NOT NULL REFERENCES teams(id)\`：
- cases（或 case_catalog 过渡期）
- plans
- execution_environments
- case_runs / recorded_runs
- runs（计划执行）`,
    api: `\`\`\`
GET  /api/teams              # 当前用户所属团队列表
POST /api/teams              # 创建团队（name）
GET  /api/teams/:id
PATCH /api/teams/:id         # 改名（admin+）
POST /api/teams/:id/switch   # 切换当前团队 → 更新 JWT claims 或 session
\`\`\`

JWT payload 增加：\`current_team_id\`, \`team_ids[]\``,
    service: '`TeamService.ensureDefaultTeam(userId)` 在首次登录调用；所有资源写操作带 `team_id`。',
    frontend: '顶栏团队切换器（`TeamSwitcher`）；创建资源时隐式使用 `current_team_id`。',
    security: '跨 team_id 访问返回 404（不泄露存在性）。',
    migration: '1) 为每个 user 建默认 team；2) 将该 user 现有 cases/plans/envs 写入其默认 team_id。',
    acceptance: ['新用户自动有默认团队', '切换团队后用例列表变化', 'API 只返回当前团队成员可访问资源'],
    depends: ['REQ-B01'],
    notes: '**核心决策 D1**：替代纯 user_id 隔离。',
  },
  {
    id: 'REQ-B04', title: '团队成员与角色', epic: 'B 认证团队', phase: 'P1', status: '⬜ 未开始',
    goal: '团队内成员邀请与角色权限控制。',
    scopeIn: ['team_members 表', '四种角色', '邀请加入'],
    scopeOut: ['邮件邀请', 'WPS 组织架构同步'],
    dataModel: `\`\`\`sql
CREATE TABLE team_members (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT DEFAULT (datetime('now', '+8 hours')),
  PRIMARY KEY (team_id, user_id)
);
\`\`\`

| 角色 | 读 | 写用例 | 写计划 | 执行 | 管理成员 |
|------|----|--------|--------|------|----------|
| owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| member | ✅ | ✅ | ✅ | ✅ | ❌ |
| viewer | ✅ | ❌ | ❌ | ❌ | ❌ |`,
    api: `\`\`\`
GET    /api/teams/:id/members
POST   /api/teams/:id/members     # { user_email, role }
PATCH  /api/teams/:id/members/:userId   # 改角色
DELETE /api/teams/:id/members/:userId
\`\`\``,
    service: '`requireTeamRole(teamId, minRole)` 中间件；owner 不可被删除（需转让）。',
    frontend: '团队设置 → 成员管理页。',
    security: '仅 owner/admin 可改成员；不能移除最后一个 owner。',
    migration: '创建默认 team 时 user 为 owner。',
    acceptance: ['viewer 无法 DELETE /cases', 'member 可导入用例', 'admin 可邀请新成员'],
    depends: ['REQ-B03'],
  },
  {
    id: 'REQ-B05', title: '团队资源隔离与切换', epic: 'B 认证团队', phase: 'P1', status: '⬜ 未开始',
    goal: '所有业务 API 按 current_team_id 过滤；切换团队后上下文一致。',
    scopeIn: ['查询过滤', '创建默认 team_id', 'JWT 刷新'],
    scopeOut: ['跨团队资源共享'],
    dataModel: '所有业务 SELECT 增加 `WHERE team_id = ?`；INSERT 强制 `team_id = req.teamId`。',
    api: '请求头可选 `X-Team-Id`（须为用户所属团队）；否则用 JWT `current_team_id`。',
    service: '`withTeamScope(query, teamId)` 查询包装器。',
    frontend: '切换团队 → `POST /teams/:id/switch` → 刷新页面数据；localStorage 缓存 last_team_id。',
    security: '伪造 team_id 返回 403。',
    migration: '历史数据批量补 team_id（见 B03 migration）。',
    acceptance: ['团队 A 用例对团队 B 不可见', '切换团队后计划列表更新', '创建用例写入正确 team_id'],
    depends: ['REQ-B03', 'REQ-B04'],
  },
];

// ... more REQ definitions in second part
const REQ2 = [
  {
    id: 'REQ-C01', title: '统一用例表 cases', epic: 'C 数据模型', phase: 'P1', status: '🟡 部分完成',
    goal: '单一用例模型，含 team_id、portability、环境字段；废弃 repo 三元组。',
    scopeIn: ['cases 表', '从 case_catalog 迁移', 'team_id'],
    scopeOut: ['多脚本文件用例'],
    dataModel: `\`\`\`sql
CREATE TABLE cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  tags_json TEXT DEFAULT '[]',
  priority TEXT,
  source TEXT NOT NULL DEFAULT 'recorded',
  script_path TEXT NOT NULL,
  default_environment_id INTEGER REFERENCES execution_environments(id),
  environment_snapshot_json TEXT,
  has_auth INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  current_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  portability TEXT NOT NULL DEFAULT 'portable',
  created_at TEXT, updated_at TEXT
);
\`\`\`
过渡期：case_catalog 已扩展字段，虚拟仓库 uiauto/recorded。`,
    api: 'CRUD 见顶层设计 §8.1；列表 `GET /cases?team_id=&q=&source=&portability=`。',
    service: 'CaseService 替代 cases.js 内联逻辑。',
    frontend: '用例库按当前团队加载。',
    security: 'team_id + 角色校验。',
    migration: 'case_catalog(uiauto/recorded) → cases；补 team_id。',
    acceptance: ['新用例写 cases', '列表含 portability 标识', 'Git catalog 行不自动迁移'],
    depends: ['REQ-B03', 'REQ-B05', 'REQ-C03'],
  },
  {
    id: 'REQ-C02', title: '用例版本 case_versions', epic: 'C 数据模型', phase: 'P3', status: '⬜ 未开始',
    goal: '脚本修订留痕、回滚、Agent 多轮迭代。',
    scopeIn: ['case_versions 表', 'restore API'],
    scopeOut: ['二进制附件版本'],
    dataModel: '见顶层设计 §6.2 / §7.1 case_versions 表。',
    api: 'GET /cases/:id/versions；POST /cases/:id/versions/:v/restore；PATCH 改脚本自动 +1 version。',
    service: 'VersionService.createOnScriptChange()。',
    frontend: '编辑页版本侧栏 + diff（REQ-H04）。',
    security: 'viewer 不可回滚。',
    migration: '现有用例 seed version=1 从 metadata_json.script。',
    acceptance: ['改脚本 version++', '回滚后试跑用旧脚本', 'created_by 支持 agent:name'],
    depends: ['REQ-C01', 'REQ-H04'],
  },
  {
    id: 'REQ-C03', title: 'Cases Workspace', epic: 'C 数据模型', phase: 'P1', status: '🟡 部分完成',
    goal: '脚本按 team/user/case 目录组织，统一 Playwright 项目壳。',
    scopeIn: ['data/cases/_workspace', '{team_id}/{case_id}/'],
    scopeOut: ['对象存储 S3'],
    dataModel: `\`\`\`
data/cases/_workspace/     # package.json, playwright.config.ts
data/cases/{team_id}/{case_id}/
  case.spec.ts
  case.auth.json
  env.snapshot.json
\`\`\``,
    api: '无独立 API；由 CaseService 写文件。',
    service: 'caseWorkspace.js 替代 recordedCases.js。',
    frontend: '无。',
    security: '路径校验防目录穿越；仅本团队可读。',
    migration: 'recorded-cases/imported/* → 新目录；更新 script_path。',
    acceptance: ['新用例路径符合规范', '删除用例删目录', '试跑可找到 spec'],
    depends: ['REQ-B03', 'REQ-C01'],
  },
  {
    id: 'REQ-C04', title: '试跑表 case_runs', epic: 'C 数据模型', phase: 'P2', status: '🟡 部分完成',
    goal: 'recorded_runs 重命名为 case_runs，关联 case_id + team_id。',
    scopeIn: ['表重命名', 'API 路径演进'],
    scopeOut: ['分布式 run 追踪'],
    dataModel: 'case_runs：team_id, case_id, case_version, environment_id, status, ...',
    api: '/api/case-runs（新）；/api/recorded-runs deprecated 一期。',
    service: 'recordedRunner → caseRunService。',
    frontend: '试跑历史路由可保留，调新 API。',
    security: 'team 隔离。',
    migration: 'ALTER + 数据拷贝；case_catalog_id → case_id。',
    acceptance: ['新试跑写 case_runs', 'MCP get_case_run 用新路径'],
    depends: ['REQ-C01', 'REQ-J01'],
  },
  {
    id: 'REQ-C05', title: '计划 case_ids_json', epic: 'C 数据模型', phase: 'P1', status: '⬜ 未开始',
    goal: '计划绑定 case_id[]，废弃 cases_json 路径列表。',
    scopeIn: ['case_ids_json 字段', '兼容读取旧 plans'],
    scopeOut: ['计划内用例排序拖拽（后续）'],
    dataModel: 'plans.case_ids_json TEXT -- [1,2,3]；plans.team_id。',
    api: 'POST /plans { name, case_ids, environment_id, team_id implicit }。',
    service: '迁移时 paths → ids 查表。',
    frontend: 'PlanNew 提交 case_ids。',
    security: 'case_ids 须属同一 team。',
    migration: 'cases_json 路径反查 id 写入 case_ids_json。',
    acceptance: ['新建计划无 repo 字段', '执行前校验 case 存在', '旧计划只读兼容一期'],
    depends: ['REQ-C01', 'REQ-B05', 'REQ-I01'],
  },
  {
    id: 'REQ-E01', title: 'JSON 导入 API', epic: 'E 手动导入', phase: 'P1', status: '🟡 部分完成',
    goal: 'POST /cases/import 承接脚本 + 可选环境 + 可选 auth。',
    scopeIn: ['ImportService', 'portable/bundle 自动判定'],
    scopeOut: ['导入审批流'],
    dataModel: '写入 cases；portability：有环境→bundle，无→portable（**D3**）。',
    api: `\`\`\`
POST /api/cases/import
{
  "name": "必填",
  "script": "必填",
  "environment_id": "可选",
  "environment": "可选 create|snapshot",
  "auth": { "storage_state": {} },
  "tags", "description", "priority"
}
\`\`\`
**不强制环境**；无 environment 时 portability=portable。`,
    service: 'caseImport.js → ImportService；validateScript 前置。',
    frontend: 'ImportCaseModal。',
    security: 'team_id 写入；viewer 禁止。',
    migration: '现有 import 逻辑对齐 D3，去掉「环境必填」校验。',
    acceptance: ['仅 script 可导入', '带 environment_id 为 bundle', '响应含 summary', 'team_id 正确'],
    depends: ['REQ-C01', 'REQ-B05', 'REQ-E02'],
    notes: '**决策 D3**：导入环境可选。',
  },
  {
    id: 'REQ-J05', title: '多 Worker 并发执行', epic: 'J 执行引擎', phase: 'P2', status: '⬜ 未开始',
    goal: '执行队列支持可配置并发，提升多计划/试跑吞吐。',
    scopeIn: ['RUN_WORKER_CONCURRENCY', '队列监控', '资源隔离'],
    scopeOut: ['K8s 水平扩展'],
    dataModel: `\`\`\`sql
-- 可选：run_queue_slots 跟踪占用
CREATE TABLE run_workers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_pid INTEGER,
  run_type TEXT,  -- case | plan
  run_id INTEGER,
  started_at TEXT,
  status TEXT
);
\`\`\``,
    api: 'GET /api/status/queue → { concurrency, active, pending }。',
    service: `\`\`\`js
const concurrency = Number(process.env.RUN_WORKER_CONCURRENCY || 2);
const caseQueue = new PQueue({ concurrency });
const planQueue = new PQueue({ concurrency: 1 }); // 单计划内串行用例
\`\`\`
或统一队列 + 计划级锁。`,
    frontend: '管理页展示队列状态（可选）。',
    security: '并发不绕过 team 权限；单用例仍校验 team。',
    migration: '默认 concurrency=2；生产 .env 可配。',
    acceptance: ['CONCURRENCY=2 时可同时 2 个试跑', '超队列排队', '取消仍有效', 'Playwright 不互相杀进程'],
    depends: ['REQ-J01', 'REQ-J02'],
    notes: '**决策 D2**：多 Worker。',
  },
];

const ALL = [...REQ, ...REQ2];
// Remaining REQs - use compact generator
const compact = (id, title, epic, phase, status, goal, extra = {}) => ({
  id, title, epic, phase, status, goal,
  scopeIn: extra.scopeIn || ['见顶层设计对应章节'],
  scopeOut: extra.scopeOut || ['本阶段不实现项见顶层设计'],
  dataModel: extra.dataModel || '见上级文档 §领域模型；含 `team_id` 字段（适用时）。',
  api: extra.api || '见顶层设计 §8 REST API。',
  service: extra.service || '复用 Application Service 层，不重复实现。',
  frontend: extra.frontend || '见顶层设计 §11 前端演进。',
  security: extra.security || 'REQ-B05 团队隔离 + REQ-B04 角色校验。',
  migration: extra.migration || '随 Phase 迁移脚本执行。',
  acceptance: extra.acceptance || [`${title}功能符合顶层设计描述`],
  depends: extra.depends || [],
  notes: extra.notes || '',
});

const REST = [
  compact('REQ-D01', '浏览器扩展录制', 'D 录制', '—', '✅', '插件采集 steps/script/storageState', { scopeIn: ['extension/', 'recorderHub'], acceptance: ['插件连接', '保存到用例库'] }),
  compact('REQ-D02', '录制统一入库', 'D 录制', 'P1', '🟡', 'POST /cases source=recorded', { depends: ['REQ-C01', 'REQ-E01'], acceptance: ['与导入数据结构一致', '写 cases 表'] }),
  compact('REQ-D03', '步骤脚本双模式编辑', 'D 录制', '—', '✅', '步骤列表与脚本 Tab', { acceptance: ['步骤编辑可试跑'] }),
  compact('REQ-D04', '录制环境绑定（可选）', 'D 录制', 'P1', '🟡', '保存时可选关联环境', { notes: '对齐 D3：环境可选', depends: ['REQ-G02'], acceptance: ['无环境保存为 portable'] }),
  compact('REQ-E02', '脚本校验 API', 'E 导入', 'P1', '✅', 'POST /cases/validate', { acceptance: ['非法脚本 400', '已实现'] }),
  compact('REQ-E03', '导入前端入口', 'E 导入', 'P1', '🟡', 'ImportCaseModal + CaseRepository', { depends: ['REQ-E01'], acceptance: ['UI 可导入', '来源标签'] }),
  compact('REQ-E04', 'ZIP 包导入', 'E 导入', 'P1', '⬜', 'POST /cases/import/zip', { depends: ['REQ-E01'], acceptance: ['三件套 ZIP 可导入'] }),
  compact('REQ-E05', '批量导入', 'E 导入', 'P3', '⬜', '多文件批量', { depends: ['REQ-E01'] }),
  compact('REQ-E06', '剪贴板导入', 'E 导入', 'P3', '⬜', '剪贴板检测', { depends: ['REQ-E03'] }),
  compact('REQ-F01', 'MCP Server 包', 'F MCP', 'P4', '⬜', 'mcp/ 独立包，Tools 对齐 REST', { depends: ['REQ-B02', 'REQ-E01'], acceptance: ['Cursor 可 import_case'] }),
  compact('REQ-F02', 'MCP Resources', 'F MCP', 'P4', '⬜', 'uiauto:// 资源 URI', { depends: ['REQ-F01'] }),
  compact('REQ-F03', 'Agent 工作流文档', 'F MCP', 'P4', '⬜', '场景 A/B/C 示例', { depends: ['REQ-F01'] }),
  compact('REQ-F04', 'MCP 与执行队列', 'F MCP', 'P4', '⬜', 'MCP 走同一队列', { depends: ['REQ-F01', 'REQ-J05'] }),
  compact('REQ-G01', '环境 CRUD（团队级）', 'G 环境', 'P1', '🟡', '环境归属 team_id', { depends: ['REQ-B03'], acceptance: ['团队内共享环境', '密码不明文返回'] }),
  compact('REQ-G02', '环境解析服务', 'G 环境', 'P1', '🟡', 'resolveEnvironment 统一规则', { depends: ['REQ-C01'], acceptance: ['试跑已接入', '计划执行接入'] }),
  compact('REQ-G03', '环境注入执行', 'G 环境', 'P2', '✅', 'prepareExecutionProfileForRepo', { depends: ['REQ-J01'] }),
  compact('REQ-H01', '用例列表检索', 'H 用例库', 'P1', '🟡', '团队用例库列表筛选', { depends: ['REQ-B05', 'REQ-C01'], acceptance: ['source/portability 筛选', '团队切换刷新'] }),
  compact('REQ-H02', '用例编辑', 'H 用例库', 'P1', '🟡', '统一编辑页', { depends: ['REQ-C01'], acceptance: ['导入用例可编辑'] }),
  compact('REQ-H03', '删除与批量操作', 'H 用例库', '—', '✅', '删除+绑定计划', { acceptance: ['已实现'] }),
  compact('REQ-H04', '版本历史 UI', 'H 用例库', 'P3', '⬜', '版本列表与 diff', { depends: ['REQ-C02'] }),
  compact('REQ-I01', '计划创建选用例库', 'I 计划', 'P1', '⬜', 'PlanNew 去 Git', { depends: ['REQ-C05', 'REQ-B05'], acceptance: ['从团队用例库勾选'] }),
  compact('REQ-I02', '计划环境校验', 'I 计划', 'P1', '⬜', 'portable 用例需计划环境', { depends: ['REQ-G02'], acceptance: ['无环境阻止保存'] }),
  compact('REQ-I03', '计划执行解析环境', 'I 计划', 'P2', '⬜', '逐条 resolveEnvironment', { depends: ['REQ-J01', 'REQ-G02'] }),
  compact('REQ-I04', '定时调度通知', 'I 计划', '—', '✅', 'cron + notify', { acceptance: ['定时触发'] }),
  compact('REQ-J01', '统一 CaseRunner', 'J 执行', 'P2', '⬜', '合并 executor 与 recordedRunner', {
    dataModel: '无新表',
    service: 'caseRunner.js：runCase / runPlan',
    depends: ['REQ-C03', 'REQ-G02'],
    acceptance: ['无 git clone', '试跑与计划共用'],
  }),
  compact('REQ-J02', '试跑队列 Worker', 'J 执行', 'P2', '🟡', '子进程试跑', { depends: ['REQ-J05'], acceptance: ['可取消', '支持 snapshot'] }),
  compact('REQ-J03', '计划执行 CaseRunner', 'J 执行', 'P2', '⬜', '计划走 workspace', { depends: ['REQ-J01', 'REQ-C05'] }),
  compact('REQ-J04', '产物收集统一', 'J 执行', 'P2', '🟡', 'log/screenshot/video', { depends: ['REQ-J01'] }),
  compact('REQ-K01', '试跑报告', 'K 报告', '—', '✅', '试跑历史与日志', { acceptance: ['已实现'] }),
  compact('REQ-K02', '计划执行报告', 'K 报告', '—', '✅', 'RunReport', { acceptance: ['已实现'] }),
  compact('REQ-K03', '度量看板', 'K 报告', '—', '🟡', 'MetricsDashboard', { acceptance: ['基础指标'] }),
  compact('REQ-L01', '用例库去 Git 化', 'L 前端', 'P1', '🟡', 'CaseRepository 无拉取', { acceptance: ['CaseRepository 完成', 'PlanNew 待改'] }),
  compact('REQ-L02', '首页导航文案', 'L 前端', 'P1', '🟡', '录制/导入/执行', { acceptance: ['QuickStart 已改'] }),
  compact('REQ-L03', '用例编辑页统一', 'L 前端', 'P1', '⬜', 'CaseEdit 路由', { depends: ['REQ-H02'] }),
  compact('REQ-L04', '计划详情环境摘要', 'L 前端', 'P1', '⬜', '绑定包/通用统计', { depends: ['REQ-I02'] }),
  compact('REQ-M01', 'Git API deprecated', 'M 清理', 'P1', '⬜', '标记废弃', { acceptance: ['Deprecation 头'] }),
  compact('REQ-M02', '删除 Git 服务', 'M 清理', 'P2', '⬜', '删 github.js', { depends: ['REQ-I01', 'REQ-J03'] }),
  compact('REQ-M03', '删除 git clone', 'M 清理', 'P2', '⬜', 'executor 清理', { depends: ['REQ-J01'] }),
  compact('REQ-M04', '删除 plans.repo 字段', 'M 清理', 'P5', '⬜', 'DDL 清理', { depends: ['REQ-C05'] }),
  compact('REQ-M05', '删除 case_catalog', 'M 清理', 'P5', '⬜', '旧表删除', { depends: ['REQ-C01'] }),
  compact('REQ-N01', '单端口部署', 'N 部署', '—', '✅', 'deploy_server.py', { acceptance: ['已实现'] }),
  compact('REQ-N02', '部署文档', 'N 部署', 'P1', '🟡', 'SSO + 团队 + Worker 配置', { acceptance: ['文档含 RUN_WORKER_CONCURRENCY'] }),
  compact('REQ-N03', 'Playwright 依赖', 'N 部署', '—', '✅', 'Linux native 模块', { acceptance: ['已实现'] }),
];

const ALL_REQS = [...ALL, ...REST];

fs.mkdirSync(OUT, { recursive: true });

// README for requirements folder
const readme = `# 需求详细设计文档

每条需求独立成文，索引见 [需求清单.md](../需求清单.md)。

## 全局决策（v0.2）

| 决策 | 内容 |
|------|------|
| D1 | 团队库：资源归属 team_id |
| D2 | 多 Worker：RUN_WORKER_CONCURRENCY |
| D3 | 导入环境可选 → portable |

## 文档列表

${ALL_REQS.map((r) => `- [${r.id} ${r.title}](./${r.id}-${r.title.replace(/\s+/g, '-').replace(/[（）]/g, '')}.md)`).join('\n')}
`;
fs.writeFileSync(path.join(OUT, 'README.md'), readme);

for (const r of ALL_REQS) {
  const slug = r.title.replace(/\s+/g, '-').replace(/[（）]/g, '');
  const filename = `${r.id}-${slug}.md`;
  fs.writeFileSync(path.join(OUT, filename), doc(r));
}

console.log(`Generated ${ALL_REQS.length} requirement docs in ${OUT}`);
