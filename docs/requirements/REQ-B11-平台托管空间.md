# REQ-B11 平台托管项目空间

| 属性 | 值 |
|------|-----|
| Epic | B 认证、团队与权限 |
| Phase | P1 |
| 状态 | 🟢 已实现 |
| 上级索引 | [REQ-B00-项目空间总览.md](./REQ-B00-项目空间总览.md) |

---

## 1. 决策

| 项 | 决策 |
|----|------|
| 个人空间 | **取消**（不再 `personal-{userId}`，新用户不自动建空间） |
| 用户自建空间 | **禁止**（移除顶栏「新建团队空间」） |
| 空间创建 | 仅 **`users.role = super_admin`**（`WPS_SUPER_ADMIN_EMAILS`） |
| 空间管理员 | 创建空间时指定 **owner**（`team_members.role=owner`），须已 SSO |
| 无空间用户 | 可登录，业务 API 返回 `NO_TEAM`；前端空态引导联系管理员 |

---

## 2. API

```
GET  /api/admin/teams          # super_admin：全平台空间列表
POST /api/admin/teams          # { name, slug?, owner_user_id }
```

原 `POST /api/teams` 对非超管 **403** 或删除，仅保留超管兼容时可转发到同一逻辑。

---

## 3. 与 B03/B06/B08 关系

- 空间内成员/角色/设置页逻辑不变（B04/B06）
- 「个人空间」相关 UI/策略删除或仅对历史 slug 只读展示
- B08 删除/离开：协作空间规则不变；无个人空间特例

---

## 4. 验收

- [ ] 普通用户 SSO 后 `teams: []`，不自动创建空间
- [ ] 普通用户无法 `POST` 创建空间
- [ ] super_admin 可创建空间并指定 owner
- [ ] owner 登录后可见该空间并可邀请成员
- [ ] 无空间用户访问 `/api/cases` → 403 + `NO_TEAM`
