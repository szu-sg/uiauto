# REQ-B06 项目空间设置页

| 属性 | 值 |
|------|-----|
| Epic | B 认证、团队与权限 |
| Phase | P1 |
| 状态 | ✅ 已实现 |
| 上级索引 | [REQ-B00-项目空间总览.md](./REQ-B00-项目空间总览.md) |

---

## 1. 需求概述

**目标**：用独立页面承载「项目空间」的查看与维护，替代仅靠顶栏小弹窗；结构清晰、可扩展高级能力（转让、删除）。

**用户故事**

- 作为空间管理员，我希望在固定页面管理全部成员与角色，而不是在窄弹窗里操作。
- 作为普通成员，我希望查看「当前空间叫什么、有多少人、我是什么角色」，但看不到管理按钮。

---

## 2. 范围

### In Scope

- 路由：`/settings/space`（或 `/space/settings`，与现有 `App.jsx` 路由风格统一即可）
- 侧栏 Tab：**概览**（可占位，详见 B10）、**成员**、**基本设置**、**高级**（B08，可先灰显「即将支持」直至 B08 完成）
- 数据：`GET /api/teams/:id`（已有）+ `GET /api/teams/:id/members`
- 权限：页面可读（任意成员）；写操作区块仅 `admin+`；**高级**仅 `owner`
- 顶栏 `TeamSwitcher`：「团队设置」改为跳转设置页（或保留弹窗 + 增加「打开完整设置」链接，P1 推荐**直接跳转**）

### Out of Scope

- 多空间并行管理（一次只编辑 JWT 当前空间）
- 空间头像上传（P2）
- 空间级通知 Webhook（留在计划/协作通知需求）

---

## 3. 成员 Tab（P1 核心）

### 3.1 列表字段

| 列 | 数据源 |
|----|--------|
| 头像 + 姓名 | `real_name` / `displayName` |
| 账号 | `email` 或 `username` |
| WPS uid（可选列） | `uid`，便于对号找人 |
| 角色 | `role` → 中文标签 |
| 加入时间 | `joined_at` |
| 操作 | admin+：改角色、移除（owner 行不可移除） |

### 3.2 改角色

- 行内 `<select>` 或下拉：owner / admin / member / viewer
- 调用 `PATCH /api/teams/:id/members/:userId`（已有）
- 当前用户为 admin 时：**不可**将他人设为 owner（仅 owner 可转让，见 B08）
- 改自己角色：若会导致无 owner，后端拒绝并 toast 错误信息

### 3.3 邀请成员

- 表单：邮箱 + 角色（默认可选 member/admin/viewer）
- 调用 `POST /api/teams/:id/members`
- 个人空间（`slug` 为 `personal-*`）：隐藏整块邀请 UI，提示「个人空间仅自己使用，请新建协作空间」

### 3.4 空态与加载

- 加载 skeleton；失败可重试
- 仅 1 人时仍展示列表，不显示「移除」

---

## 4. 基本设置 Tab

| 项 | 规则 |
|----|------|
| 空间名称 | admin+ 可编辑，`PATCH /api/teams/:id` |
| 空间标识 slug | 只读展示，复制按钮 |
| 空间类型 | 只读：个人空间 / 协作空间（由 slug 规则推导） |
| 创建时间 | `teams.created_at`（需在 `GET /api/teams/:id` 返回，已含 `...team`） |

---

## 5. 导航与布局

- 入口 1：顶栏空间菜单 →「空间设置」
- 入口 2（P2）：用户菜单 →「空间与成员」
- 布局：与 `WorkbenchLayout` 一致，左侧 Tab + 右侧内容；移动端 Tab 顶栏横向滚动

---

## 6. 前端文件建议

| 文件 | 职责 |
|------|------|
| `frontend/src/pages/SpaceSettings.jsx` | 页面壳 + Tab |
| `frontend/src/pages/space/SpaceMembers.jsx` | 成员 Tab |
| `frontend/src/pages/space/SpaceGeneral.jsx` | 基本设置 |
| `frontend/src/utils/teamDisplay.js` | `isPersonalTeam(slug)`、角色文案 |

`TeamSwitcher.jsx` 中 `TeamMembersModal` 可删除或改为 `navigate('/settings/space')`。

---

## 7. 验收标准

- [ ] `/settings/space` 非成员访问 → 404 或重定向首页
- [ ] viewer 进入页面可见成员列表，无邀请/改角色/移除
- [ ] admin 可完成邀请、改角色、移除（非 owner）
- [ ] 改名后顶栏空间名同步（刷新 user context 或 `auth/me`）
- [ ] 个人空间不展示邀请区

---

## 8. 依赖

- REQ-B04（角色定义）
- REQ-B07 建议先于或与并行：避免 UI 放开后 API 仍无权限
