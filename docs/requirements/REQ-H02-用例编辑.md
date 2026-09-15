# REQ-H02 用例编辑

| 属性 | 值 |
|------|-----|
| Epic | H 用例库 |
| Phase | P1 |
| 状态 | 📝 设计冻结 / 🟡 部分实现 |
| 上级索引 | [需求清单.md](../需求清单.md) |
| 页面总览 | [REQ-H00 用例库页面总览](./REQ-H00-用例库页面总览.md) |
| 前端统一 | [REQ-L03 用例编辑页统一](./REQ-L03-用例编辑页统一.md) |

---

## 1. 需求概述

**目标**：录制与导入的用例共用**同一编辑工作台**，不区分来源的交互与数据结构。

**路由**：`/cases/:id/edit`（兼容 `/cases/recorded/:id` 重定向）

**页面**：`CaseRecordedEdit.jsx`（待重命名为 `CaseEdit.jsx`，L03）

---

## 2. 统一数据模型（与顶层设计 §6.6 对齐）

`metadata_json` 必含：

```json
{
  "source": "recorded | imported",
  "language": "typescript | javascript",
  "script": "<Playwright 脚本全文>",
  "scriptStale": false,
  "steps": [],
  "tags": [],
  "module": "废弃，Phase B 起不再写入"
}
```

| 字段 | 录制 | 导入 |
|------|------|------|
| `source` | `recorded` | `imported` |
| `steps` | 录制器产生 | 默认 `[]`，可手填/JSON 编辑 |
| `script` | 录制生成或手写 | 导入时写入 |
| auth | 扩展 storageState | ZIP/JSON 可选 |

**保存时**：`PATCH /api/cases/:id` 不得把 `imported` 改成 `recorded`。

---

## 3. 页面结构

与 `CaseRecord` 同构三栏：

```
┌─────────────────────────────────────────────────────────┐
│ ← 用例库   用例名称 [来源标签]          [导出] [保存]    │
├──────────────┬────────────────────┬─────────────────────┤
│ 用例信息      │ 录制步骤            │ 脚本 + 试跑          │
│ 名称/描述     │ 步骤列表            │ ScriptEditor        │
│ 优先级/标签   │ 配置 Action         │ 语言 / 试跑 / 复制   │
│ 所属文件夹 P2 │ JSON 编辑 / 生成脚本 │                     │
│ 版本历史 P1   │                     │                     │
└──────────────┴────────────────────┴─────────────────────┘
```

### 3.1 加载

```
GET /api/cases/:id  →  script 优先 metadata，否则读 workspace 文件
```

### 3.2 保存

```
PATCH /api/cases/:id
{
  name, description, priority,
  script,
  metadata: { source, language, script, scriptStale, steps, tags },
  folder_id?   // P2
}
```

触发 `case_versions` 脚本变更记录（REQ-C02）。

### 3.3 试跑

- 仅 TypeScript 脚本（与录制页一致）
- 调用试跑 API，关联 `case_id`

### 3.4 版本历史（REQ-H04）

- 侧栏或折叠区：`GET /api/cases/:id/versions`
- 回滚：`POST .../versions/:v/restore`

---

## 4. 来源展示

| source | 顶栏标签 | 返回用例库 Tab |
|--------|----------|----------------|
| recorded | 录制 | `?tab=recorded` |
| imported | 导入 | `?tab=imported` |

---

## 5. 与用例库联动

| 动作 | 行为 |
|------|------|
| 从列表点编辑 | 带当前 `folder_id` 上下文仅用于返回，不改变数据 |
| 保存成功 | 弹 SaveCaseReportModal；可继续编辑或回列表 |
| 删除 | 在列表页操作，编辑页不提供删除（P2 可加） |

---

## 6. 范围外

- 实时浏览器录制（仅 `CaseRecord` 新录制）
- 在线协同编辑
- 脚本 AI 生成

---

## 7. 验收标准

- [ ] 导入用例打开编辑页可看到完整脚本
- [ ] 保存后 `source` 不变
- [ ] 步骤为空时仍可仅编辑脚本并试跑
- [ ] 版本列表可查看与回滚（H04）
- [ ] 路由 `/cases/:id/edit` 可用
- [ ] Phase B：移除 module 下拉；可选展示所属文件夹

---

## 8. 依赖关系

- REQ-C01、REQ-C02、REQ-D03
- REQ-H05（folder_id 展示 P2）
- REQ-L03（命名与路由统一）

---

## 9. 实现差距

| 项 | 现状 | 目标 |
|----|------|------|
| 页面命名 | CaseRecordedEdit | CaseEdit（L03） |
| module 下拉 | 仍在 | 移除，改文件夹（H00 §6） |
| 所属文件夹 | 无 | 只读/可改 folder_id |
| 版本 UI | 基础列表 | H04 完善 |

---

*版本：v0.2 · 2026-03-08*
