# UIAuto - Playwright 测试计划 MVP

从 GitHub 拉取 Playwright 用例、组建测试计划、执行并查看报告（步骤、截图、录屏、日志）。

## 功能

1. **拉取用例**：填写 GitHub 仓库（owner/repo/branch），拉取 `.spec.ts` / `.spec.js` 等用例列表；可选 GitHub Token（私有仓库）。
2. **测试计划**：勾选用例、填写计划名称，创建计划。
3. **执行计划**：在计划详情页点击「执行测试计划」，后台按顺序运行 Playwright 测试。
4. **测试报告**：查看每次运行的用例结果、截图、录屏、日志。

## 环境要求

- Node.js 18+
- 已安装 Playwright 浏览器：在**用例仓库根目录**或本机全局需能执行 `npx playwright test`（执行时会 clone 仓库到 `backend/repos`，并在该目录下执行测试，故该目录下需有 `package.json` 且含 playwright 依赖，或系统已全局安装 playwright）。

## 登录与多用户

- **首次部署**：打开站点会进入登录页，点击「注册管理员账号」创建第一个用户；该用户会自动继承数据库里尚未归属的测试计划（`user_id` 为空的历史计划）。
- **后续用户**：任选其一  
  - 设置 **`UIAUTO_INVITE_CODE`**，同事在注册页填写该邀请码；或  
  - 纯内网可设 **`UIAUTO_OPEN_REGISTER=1`**，无需邀请码即可注册（慎用）。
- 未配置上述任一项时，打开注册页会显示说明，**不再自动跳回登录**。
- **JWT**：生产环境请设置 **`JWT_SECRET`**（随机长字符串），勿使用默认值。
- 每个用户只能看到、执行、删除**自己的**计划与对应执行记录。

## 快速开始

### 1. 安装依赖

```bash
npm run install:all
```

或分别安装：

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

### 2. 启动后端（端口 3001）

```bash
npm run backend
```

### 3. 启动前端（端口 5173）

```bash
npm run frontend
```

或同时启动前后端：

```bash
npm run dev
```

### 4. 使用

1. 打开 http://localhost:5173
2. 点击「新建计划」→ 填写 GitHub owner/repo（如 `microsoft/playwright`）→「拉取用例列表」
3. 勾选用例、填写计划名称 →「创建计划」
4. 在计划详情页点击「执行测试计划」→ 自动跳转到报告页；报告页会轮询直到执行完成，可展开每条用例查看截图、录屏、日志。

## 项目结构

```
uiauto/
├── backend/           # Node 后端
│   ├── src/
│   │   ├── index.js       # Express 入口
│   │   ├── db/schema.js   # SQLite 表结构
│   │   ├── routes/        # plans / runs / github API
│   │   └── services/     # github 拉取、executor 执行
│   ├── data/              # SQLite 数据库（自动创建）
│   ├── repos/             # clone 的 GitHub 仓库（自动创建）
│   └── results/           # 每次运行的截图/录屏/日志（自动创建）
├── frontend/          # React + Vite
│   └── src/
│       ├── pages/         # Home, PlanNew, PlanDetail, RunReport
│       └── App.jsx
└── package.json
```

## API 摘要

- `GET /api/plans` - 计划列表
- `POST /api/plans` - 创建计划
- `GET /api/plans/:id` - 计划详情
- `GET /api/github/specs?owner=&repo=&branch=&token=` - 拉取仓库内用例文件列表
- `GET /api/runs?planId=` - 某计划的运行列表
- `POST /api/runs` - 创建并排队一次运行（body: `{ plan_id }`）
- `GET /api/runs/:id` - 运行详情（含 cases）
- 静态资源：`/results/:runId/:caseId/...` 为截图、录屏、日志文件

## 部署到内网服务器（供同事通过 URL 访问）

### 1. 在服务器上准备环境

- 安装 Node.js 18+
- 安装 Git（用于 clone 用例仓库）
- 若需执行 Playwright 用例，需安装浏览器依赖：`npx playwright install chromium`（或安装 full 以支持多浏览器）

### 2. 拉取代码并安装依赖

```bash
# 假设代码在 /opt/uiauto
cd /opt/uiauto
npm run install:all
```

### 3. 构建前端并启动服务

```bash
npm run build          # 将前端打包到 backend/public
cd backend && npm start
```

默认监听 **0.0.0.0:3001**，内网其他机器可访问 `http://<服务器IP>:3001`。

### 4. 可选：改端口或仅本机监听

```bash
PORT=8080 node src/index.js    # 使用 8080 端口
HOST=127.0.0.1 node src/index.js  # 仅本机（不推荐内网共享时使用）
```

### 5. 可选：用 pm2 常驻

```bash
npm install -g pm2
cd backend
pm2 start src/index.js --name uiauto
pm2 save && pm2 startup
```

### 访问方式

- 内网同事浏览器打开：`http://<服务器IP>:3001`
- 同一端口同时提供前端页面和 API，无需单独配置代理。

## 说明

- 执行为单任务队列，同一时间只跑一个计划。
- 用例仓库需为标准 Playwright Test 项目（可 `npx playwright test <文件路径>` 执行）。
- 报告中的「步骤」当前为执行日志摘要；更细的步骤可后续从 Playwright trace 解析。
