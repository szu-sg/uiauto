# REQ-H05 用例文件夹分组

| 属性 | 值 |
|------|-----|
| Epic | H 用例库 |
| Phase | P1 |
| 状态 | 📝 设计冻结 / 🟡 后端已实现、前端 MVP |
| 上级索引 | [需求清单.md](../需求清单.md) |
| 页面总览 | [REQ-H00 用例库页面总览](./REQ-H00-用例库页面总览.md) |

---

## 1. 需求概述

**目标**：团队用例库支持**多级文件夹**分组，左侧目录树管理，用例可移动、复制到目标文件夹。

**用户故事**：

- 作为测试负责人，我希望按业务线建文件夹（如「深度研究」「冒烟」），方便团队浏览与计划选例。
- 作为用例作者，我希望把导入的用例移入对应文件夹，或复制一份做变体。
- 作为新人，我希望「未分类」里能看到尚未整理的用例。

---

## 2. 范围

### In Scope

- 团队级文件夹树（`team_id` 隔离）
- 多级父子关系（`parent_id`）
- 虚拟节点：全部用例、未分类（不建表）
- 用例 `folder_id` 可空（未分类）
- 新建 / 重命名 / 删除文件夹
- 单条 & 批量移动用例
- 单条 & 批量复制用例（副本进同目录或指定目录）
- 从 `metadata.module` **一次性迁移**为顶层文件夹（仅首次）

### Out of Scope（P2+）

- 文件夹级权限 ACL
- 拖拽排序（`sort_order` 字段预留）
- 跨团队共享文件夹
- 文件夹导入/导出
- 软删除 / 回收站

---

## 3. 数据模型

### 3.1 表 `case_folders`

```sql
CREATE TABLE case_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  parent_id INTEGER REFERENCES case_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX idx_case_folders_team ON case_folders(team_id);
CREATE INDEX idx_case_folders_parent ON case_folders(team_id, parent_id);
```

### 3.2 `cases` 扩展

```sql
ALTER TABLE cases ADD COLUMN folder_id INTEGER REFERENCES case_folders(id);
CREATE INDEX idx_cases_folder ON cases(team_id, folder_id);
```

### 3.3 约束规则

| 规则 | 说明 |
|------|------|
| 名称 | 1–64 字符，trim 后非空；**同级唯一**（同一 `parent_id` 下） |
| 层级 | 建议上限 5 层（代码校验，防循环） |
| 删除文件夹 | 子文件夹递归删除；用例 `folder_id` → 被删文件夹的 `parent_id`，无 parent 则 `NULL` |
| 团队 | 文件夹与用例 `team_id` 必须一致 |

### 3.4 虚拟节点（不入库）

| 节点 ID | 列表筛选 |
|---------|----------|
| `all` | 不传 `folder_id` |
| `uncategorized` | `folder_id=uncategorized` → SQL `folder_id IS NULL` |

---

## 4. API 设计

基础路径：`/api/cases`（需登录 + `attachTeam`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/folders/tree` | 返回 `{ total, uncategorized, tree[] }`，节点含 `case_count` |
| POST | `/folders` | Body: `{ name, parent_id? }` |
| PATCH | `/folders/:folderId` | Body: `{ name?, parent_id? }` |
| DELETE | `/folders/:folderId` | Query: `move_cases_to=parent\|null\|<folderId>` |
| POST | `/folders/move-cases` | Body: `{ case_ids: number[], folder_id: number\|null }` |
| POST | `/:id/copy` | Body: `{ name?, folder_id? }`；默认名 `原名 (副本)` |

列表筛选（扩展 H01）：

```
GET /api/cases?folder_id=uncategorized
GET /api/cases?folder_id=123
```

导入 / 创建用例时可选：

```json
{ "folder_id": 123, ... }
```

---

## 5. Service 层

`caseFolderService.js`：

| 函数 | 说明 |
|------|------|
| `ensureCaseFoldersSchema()` | 建表 + `folder_id` 列 + module 迁移 |
| `listFolderTree(teamId)` | 建树 + 计数 |
| `createFolder(teamId, { name, parent_id })` | |
| `updateFolder(teamId, folderId, patch)` | 防环、防移到自身子树 |
| `deleteFolder(teamId, folderId, opts)` | 递归删子文件夹 |
| `moveCasesToFolder(teamId, caseIds, folderId)` | |
| `copyCase(teamId, userId, caseId, opts)` | 复制 workspace + auth + metadata |

---

## 6. 前端设计

### 6.1 组件

| 组件 | 职责 |
|------|------|
| `CaseFolderTree` | 左栏树；虚拟节点 + 递归文件夹 |
| `FolderFormModal` | 新建 / 重命名（**替代 prompt**） |
| `FolderDeleteModal` | 删除确认 + 说明用例去向 |
| `MoveCaseModal` | 批量移动目标选择 |

### 6.2 目录树交互

| 操作 | 交互 |
|------|------|
| 选中文件夹 | 高亮；刷新右侧列表 |
| 新建根文件夹 | 顶栏「新建」→ Modal |
| 新建子文件夹 | 行悬停 `+` → Modal（父级预填） |
| 重命名 | 行悬停 `✎` → Modal |
| 删除 | 行悬停 `×` → 确认 Modal |
| 展开/收起 | 有子节点时 `▸/▾` |

**禁止**：`window.prompt` / `window.confirm`（删除文件夹可用设计系统 Confirm）。

### 6.3 用例行操作

| 操作 | 入口 |
|------|------|
| 移动 | 底栏「移动到文件夹」；P2 支持拖到树节点 |
| 复制 | 行内「更多 → 复制」或底栏「批量复制」 |
| 编辑 | 跳转 `/cases/:id/edit`，不改变 `folder_id` |

### 6.4 计数

- 树节点 `case_count`：仅**直接**属于该文件夹的用例数（不含子文件夹）
- 「全部用例」：`status=active` 总数
- 「未分类」：`folder_id IS NULL` 数量

---

## 7. 迁移与兼容

### 7.1 module → folder（`case_folders_v1`）

触发：`ensureCaseFoldersSchema()` 首次执行。

```
对每个 team:
  对每个 distinct metadata.module（非空、合法 UTF-8、非乱码）:
    创建顶层 folder(name=module)
  对每个 case.folder_id IS NULL:
    若 module 有对应 folder → 设置 folder_id
    否则保持 NULL（未分类）
```

### 7.2 乱码与空名处理（Phase B 必做）

| 输入 | 处理 |
|------|------|
| 空 / 仅空白 | 不建文件夹，用例归未分类 |
| 不可打印 / 替换符 `` | 不建文件夹或合并到「其他」 |
| 已存在 `???` 文件夹 | 管理端脚本合并到「未分类」并删空夹 |

### 7.3 与 `metadata.module` 的关系

- 迁移后：**新用例不再写 `module`**
- 编辑页移除 module 下拉（REQ-H00 §6）
- 可选：保存时若改了 `folder_id`，同步 `metadata.module = folder.name` 只读兼容（**不推荐**，增加耦合）

---

## 8. 安全与权限

- 所有 API 校验 `req.teamId`
- 文件夹 CRUD、移动、复制：默认要求团队成员身份（REQ-B04 角色细化 P2）
- 删除文件夹不物理删除用例，仅解除或转移 `folder_id`

---

## 9. 验收标准

### 9.1 功能

- [ ] 可建多级文件夹，同级不重名
- [ ] 树展示全部 / 未分类 / 用户文件夹及数量
- [ ] 选中文件夹后列表正确筛选
- [ ] 单条/批量移动、复制可用
- [ ] 删除文件夹后用例去向符合 §3.3
- [ ] 导入/录制可指定 `folder_id`（Phase B）

### 9.2 体验

- [ ] 文件夹操作全部使用 Modal，无浏览器原生 prompt
- [ ] 无乱码文件夹名
- [ ] 左树与右表视觉对齐（REQ-H00 §3）

### 9.3 数据

- [ ] 旧 `module` 数据迁移后可在对应文件夹找到用例
- [ ] 复制用例含脚本、步骤、标签、auth、环境快照

---

## 10. 依赖关系

| 依赖 | 说明 |
|------|------|
| REQ-C01 | `cases` 表 |
| REQ-B05 | 团队隔离 |
| REQ-H01 | 列表 `folder_id` 筛选 |
| REQ-H02 | 编辑页展示所属文件夹（P2） |
| REQ-E03/E04 | 导入默认目录 |

---

## 11. 实现状态（2026-03-08）

| 项 | 状态 |
|----|------|
| `case_folders` 表 + API | ✅ |
| `CaseFolderTree` + 移动/复制 | 🟡 MVP（prompt、样式待修） |
| Modal 交互 | ⬜ Phase B |
| module 废弃 + 乱码清洗 | ⬜ Phase B |
| 导入默认 folder | ⬜ Phase B |

---

*版本：v0.1 · 2026-03-08*
