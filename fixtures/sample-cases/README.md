# 示例用例（可执行 Playwright Test）

本目录提供**可直接导入、试跑、纳入计划**的冒烟用例，用于验证「用例库 → 试跑 → 计划选例 → 执行」全流程。

## 用例清单

| 目录 / ZIP | 类型 | 说明 | 网络要求 |
|------------|------|------|----------|
| `portable-01-example-domain` | 通用 (portable) | 打开 https://example.com 校验标题 | 需能访问 example.com |
| `portable-02-playwright-dev` | 通用 | 打开 https://playwright.dev | 需能访问外网 |
| `portable-03-baidu-search` | 通用 | 打开百度首页 | 国内网络友好 |
| `bundle-01-example-env` | 绑定包 (bundle) | 脚本 + `environment.json` 快照 | 同 example.com |

> **通用用例**：导入后需在**计划详情 → 执行配置**绑定执行环境（任意有效环境即可，脚本使用绝对 URL）。  
> **绑定包**：自带 `environment.json`，可不依赖计划环境（仍建议计划绑定环境以便混跑通用用例）。

## 方式一：界面手动导入（推荐你试流程）

### 1. 生成 ZIP

```powershell
python scripts/build_fixture_zips.py
```

产物在 `fixtures/sample-cases/zips/*.zip`。

### 2. 登录平台

打开 http://10.13.146.59:3001/ （或本地 `http://localhost:5180`），WPS SSO 登录。

### 3. 导入 ZIP

1. **用例库** → **导入用例**
2. 切换到 **ZIP 包** 标签
3. 选择例如 `zips/portable-01-example-domain.zip` 或 `zips/bundle-01-example-env.zip`
4. 确认导入

### 4. JSON 粘贴导入（可选）

打开 `portable-02-playwright-dev/case.spec.ts`，复制内容到导入弹窗的脚本框，名称填「Playwright 官网冒烟」。

### 5. 试跑

1. 打开刚导入的用例 → **试跑**
2. 通用用例：在试跑面板直接运行（脚本内为绝对 URL）
3. 查看试跑报告是否 **passed**

### 6. 纳入计划并执行

1. **测试计划** → 新建计划
2. **从用例库选择** → 勾选上述示例用例
3. **计划详情 → 执行配置**：
   - 绑定一个执行环境（通用用例必填）
   - 查看顶部**环境摘要**（如：「N 条通用用例将使用此环境…」）
4. **立即执行** → 查看计划报告

## 方式二：一键导入到服务器（可选）

已配置 `DEPLOY_PASSWORD` 时：

```powershell
python scripts/build_fixture_zips.py
python scripts/import_fixtures.py
```

会在当前团队用例库创建名称以 `【示例】` / `【ZIP】` 开头的用例，便于筛选。

## 本地校验脚本（不经过平台）

在仓库根目录：

```bash
cd backend/data/cases/_workspace
npm install
npx playwright test ../../../fixtures/sample-cases/portable-01-example-domain/case.spec.ts
```

（需本机已安装 Playwright 浏览器。）

## 与部署的关系

- 示例文件在 **Git 仓库** `fixtures/` 下，**不会**随 `deploy_server.py` 自动写入服务器数据库。
- 服务端代码（ZIP 导入 API、环境摘要等）需通过部署更新；若界面没有「ZIP 包」标签，请运行：

```powershell
$env:DEPLOY_PASSWORD='你的密码'
python scripts/deploy_server.py
python scripts/verify_server.py
```

## 故障排查

| 现象 | 处理 |
|------|------|
| 试跑超时 / 无法访问页面 | 检查服务器出网；可只导入 `portable-03-baidu-search` |
| 计划执行提示缺环境 | 通用用例需在计划绑定执行环境 |
| 导入 ZIP 404 | 服务端未部署最新版，执行 `deploy_server.py` |
| 用例库只有 5 条 | 历史迁移数据；用本目录重新导入示例即可 |
