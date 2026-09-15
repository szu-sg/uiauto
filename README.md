# UIAuto - Playwright 自动化测试平台

用例录制、用例仓库、测试计划、执行报告与协作通知。支持 **WPS 企业 SSO** 多人登录，数据按用户隔离。

## 功能

1. **用例录制**：浏览器插件 + 工作台录制，生成 Playwright 脚本
2. **用例仓库**：管理录制/导入的用例，试跑与编辑
3. **执行环境**：配置 base_url、账号、SwitchHosts 等
4. **测试计划**：勾选用例、定时执行、协作群通知
5. **测试报告**：步骤、截图、录屏、日志

> 平台化改造（去 Git、统一导入、MCP）见 [docs/顶层设计-用例平台化.md](docs/顶层设计-用例平台化.md)

## 登录与多人协作（WPS SSO）

- 与 **CSR 质量评测** 相同：未登录自动跳转 **WPS 企业 OAuth2**
- 每位用户独立拥有：用例、环境、计划、执行记录
- **首个 SSO 登录**用户为超级管理员，并继承无归属的历史计划
- 注册已关闭；密码登录仅保留 API 兼容

### 环境变量（`backend/.env`，参考 `backend/.env.example`）

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | 生产必填，随机长字符串 |
| `WPS_APPID` / `WPS_APPKEY` | WPS 开放平台应用凭证 |
| `WPS_REDIRECT_URI` | OAuth 回调，须与平台登记**完全一致**（含尾斜杠） |
| `WPS_SUPER_ADMIN_EMAILS` | 可选，逗号分隔，指定邮箱首次登录为超管 |

**回调地址示例：**

- 本地 Vite：`http://localhost:5180/`
- 生产：`http://<服务器IP>:3001/`

### 本地开发免登录（可选）

仅 `npm run dev` 时生效，**不影响生产构建**：

```bash
# frontend/.env.local
VITE_AUTH_DISABLED=true
```

后端调试可设 `AUTH_DISABLED=1`（勿用于生产）。

## 快速开始

```bash
npm run install:all
cp backend/.env.example backend/.env   # 按需修改 SSO
npm run dev                             # 前端 :5180 + 后端 :3001
```

浏览器打开 http://localhost:5180 ，将跳转 WPS 登录。

### 本机调试（录制页「一键运行」）

每位测试同学需在本机配置一次 **Local Runner**（平台内打开 **用例录制 → 配置本机运行器**，或访问 `/local-runner`）：

1. 安装 [Node.js 18+](https://nodejs.org/)
2. 下载「本机运行器 ZIP」并解压（或克隆仓库后在根目录执行 `npm run local-runner:install`）
3. Windows：双击 `install.bat` → `start.bat`；Mac/Linux：`npm install` → `npm start`
4. 保持运行器终端开启，回到平台点击「一键运行」

运行器默认监听 `http://127.0.0.1:9321`，与平台部署地址无关（远程访问平台也会连本机）。

## 示例用例（试流程）

仓库内置可执行 Playwright 冒烟用例与 ZIP 包，见 **[fixtures/sample-cases/README.md](fixtures/sample-cases/README.md)**。

```powershell
python scripts/build_fixture_zips.py    # 生成 ZIP
python scripts/import_fixtures.py       # 可选：一键导入到服务器（需 DEPLOY_PASSWORD）
```

## 部署

见 [docs/Ubuntu部署指南.md](docs/Ubuntu部署指南.md)。Windows 一键部署服务器：

```powershell
$env:DEPLOY_PASSWORD='...'; python scripts/deploy_server.py
```

## 项目结构

```
uiauto/
├── backend/       # Express API、执行引擎、SQLite
├── frontend/      # React 工作台
├── extension/     # 录制浏览器插件
├── docs/          # 设计与部署文档
└── scripts/       # 部署脚本
```

## 文档索引

见 [docs/README.md](docs/README.md)
