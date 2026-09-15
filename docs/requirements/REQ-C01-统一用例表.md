# REQ-C01 统一用例表 cases

| 属性 | 值 |
|------|-----|
| Epic | C 数据模型 |
| Phase | P1 |
| 状态 | 🟡 部分完成 |
| 上级索引 | [需求清单.md](../需求清单.md) |

---

## 1. 需求概述

**目标**：用 `cases` 表替代 `case_catalog` + 虚拟仓库 `uiauto/recorded`，统一三条生产面的用例模型，并纳入 **team_id**。

---

## 2. 表结构

```sql
CREATE TABLE cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  priority TEXT CHECK (priority IN ('P0', 'P1', 'P2')),
  source TEXT NOT NULL DEFAULT 'recorded'
    CHECK (source IN ('recorded', 'imported', 'manual', 'mcp')),
  script_path TEXT NOT NULL,
  default_environment_id INTEGER REFERENCES execution_environments(id),
  environment_snapshot_json TEXT,
  has_auth INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  current_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  portability TEXT NOT NULL DEFAULT 'portable'
    CHECK (portability IN ('bundle', 'portable')),
  created_at TEXT DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX idx_cases_team ON cases(team_id);
CREATE INDEX idx_cases_team_source ON cases(team_id, source);
CREATE INDEX idx_cases_team_status ON cases(team_id, status);
```

### 字段说明

| 字段 | 说明 |
|------|------|
| `team_id` | **团队库归属**（D1） |
| `created_by` | 创建人，展示用 |
| `source` | 生产面来源，见附录 C |
| `script_path` | 相对 `data/cases/{team_id}/{id}/` |
| `portability` | bundle=自带环境；portable=靠计划（D3 默认可 portable） |
| `has_auth` | 是否有 case.auth.json |
| `metadata_json` | steps、录制元数据；**不存 Cookie 明文** |

---

## 3. CaseService API

| 方法 | 说明 |
|------|------|
| `list(teamId, filters)` | q, tag, source, portability |
| `get(teamId, caseId)` | 含 script 全文 |
| `create(teamId, userId, payload)` | 录制/手工新建 |
| `import(teamId, userId, payload)` | 委托 ImportService |
| `update(teamId, caseId, patch)` | 元数据或脚本（触发版本） |
| `delete(teamId, caseId)` | 删 DB + workspace |
| `archive(teamId, caseId)` | 软删 |

---

## 4. REST 映射

与顶层设计 §8.1 一致；列表增加团队范围：

```
GET /api/cases?q=&tag=&source=&portability=
```

隐式 `team_id = req.teamId`，不允客户端任意指定他团队。

---

## 5. 迁移计划

### Phase 1a：双写

- 新 API 写 `cases` + `case_catalog`（兼容旧执行器）

### Phase 1b：读切换

- `GET /cases` 读 `cases`
- 执行器按 `cases.script_path` 解析

### Phase 1c：停写 catalog

- 仅写 `cases`

### 迁移 SQL 草图

```sql
INSERT INTO cases (
  team_id, created_by, name, description, tags_json, priority,
  source, script_path, default_environment_id, environment_snapshot_json,
  has_auth, metadata_json, portability, created_at
)
SELECT
  tm.team_id,
  cc.user_id,
  COALESCE(cc.name, cc.path),
  cc.description,
  '[]',
  cc.priority,
  COALESCE(cc.case_source, 'recorded'),
  cc.path,
  cc.default_environment_id,
  cc.environment_snapshot_json,
  CASE WHEN cc.metadata_json LIKE '%"hasAuth":true%' THEN 1 ELSE 0 END,
  cc.metadata_json,
  COALESCE(cc.portability, 'portable'),
  cc.created_at
FROM case_catalog cc
JOIN team_members tm ON tm.user_id = cc.user_id AND tm.role = 'owner'
WHERE cc.repo_owner = 'uiauto' AND cc.repo_name = 'recorded';
```

非 `uiauto/recorded` 的 Git 行：**不自动迁移**，导出清单人工处理。

---

## 6. 当前过渡状态

| 项 | 现状 |
|----|------|
| 表 | 仍用 `case_catalog`，已扩展 4 字段 |
| 虚拟仓库 | `uiauto/recorded` |
| team_id | 未实现 |
| CaseService | 逻辑在 `cases.js` + `caseImport.js` |

---

## 7. 验收标准

- [ ] `cases` 表创建并建索引
- [ ] 录制/导入写入 `cases`
- [ ] 列表按 team_id 过滤
- [ ] 删除同步删 workspace
- [ ] Git catalog 行不进入 cases

---

## 8. 依赖

- REQ-B03、REQ-B05（team_id）
- REQ-C03（script_path 与目录一致）
- REQ-E01、REQ-D02（写入路径）
