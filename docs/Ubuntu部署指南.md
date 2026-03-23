# UIAuto 在 Ubuntu 服务器上的部署指南

按以下步骤在 Ubuntu 上部署当前代码，供内网或公网访问。

---

## 一、服务器环境准备

### 1. 安装 Node.js 18+（不要 `apt install npm`）

**请勿执行** `sudo apt install npm`：Ubuntu 仓库里的 `npm` 包依赖链容易断裂，会报「node-xxx 无法安装」等错误。

请用 **NodeSource** 一次装好 **Node + npm**：

```bash
# 若曾装过冲突包，可先卸掉（可选）
sudo apt remove -y npm nodejs 2>/dev/null || true

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

node -v   # 应 v20.x
npm -v    # 应随 Node 一起可用
```

若 `curl` 报错，可先：`sudo apt-get install -y ca-certificates curl gnupg`。

### 2. 安装 Git

```bash
sudo apt-get update
sudo apt-get install -y git
```

### 3. 安装 Playwright 浏览器依赖（执行用例需要）

执行测试时会 clone 用例仓库并在其中跑 `npx playwright test`，需安装 Chromium 等浏览器系统依赖：

```bash
# 在任意目录执行一次即可（会安装到用户目录）
npx playwright install-deps chromium
npx playwright install chromium
```

若用例仓库内已有 `playwright` 依赖，执行时会在该仓库内执行 `npx playwright install --with-deps`，但首次建议本机也装好，避免权限或依赖缺失。

---

## 二、拉取代码并安装依赖

### 方式 A：首次部署（从 GitHub 克隆）

```bash
# 选一个目录，例如 /opt 或你的 home 下
sudo mkdir -p /opt/uiauto
sudo chown $USER:$USER /opt/uiauto
cd /opt/uiauto
git clone https://github.com/szu-sg/uiauto.git .
```

### 方式 B：已有目录，更新代码

```bash
cd /opt/uiauto   # 改成你的项目路径
git fetch origin
git pull origin main
```

### 安装依赖

```bash
cd /opt/uiauto
npm run install:all
```

即：根目录 `npm install`，再 `backend`、`frontend` 分别 `npm install`。

---

## 三、配置（可选）

### 1. 账号与注册（多用户）

- **首个账号**：部署后浏览器打开站点 →「注册管理员」。
- **开放注册（远端服务器常用）**：若当前未开放注册，在 **`backend/.env`** 中任选其一：
  - **`UIAUTO_OPEN_REGISTER=1`**：内网开放注册，任何人可注册（无需邀请码），适合内网/测试环境。
  - **`UIAUTO_INVITE_CODE=你的邀请码`**：仅持邀请码的用户可注册，适合需要管控的场景。
- **生产务必设置** **`JWT_SECRET`**（随机字符串），否则 Token 易被伪造。

修改 `.env` 后需**重启后端**（如 `pm2 restart uiauto`）生效。

### 2. 登录态（执行需登录的用例时必配）

在服务器上创建 `backend/data/run.env`，写入测试账号的 Cookie：

```bash
mkdir -p backend/data
echo 'WPS_SID=你的wps_sid值' > backend/data/run.env
chmod 600 backend/data/run.env
```

注意：`backend/data/` 建议加入 `.gitignore`，不要提交到 Git。

### 3. 端口与监听地址

默认后端监听 `0.0.0.0:3001`。如需改端口或仅本机：

```bash
export PORT=8080           # 改用 8080
export HOST=0.0.0.0        # 保持外网可访问（默认已是）
# 仅本机： export HOST=127.0.0.1
```

### 4. 执行测试计划时不弹 sudo 密码（服务端必配）

执行计划时会「安装依赖」并跑 `npx playwright install --with-deps`，在 Linux 上会装系统包并**要求输入 sudo 密码**，导致卡住。按下面配置后，任意用户执行计划都不再需要输入密码。

**步骤一：一次性安装 Playwright 系统依赖（需输入一次密码）**

用**运行后端的同一用户**（如 `wjd`）在项目目录执行：

```bash
cd /opt/uiauto
sudo npx playwright install-deps chromium
```

按提示输入当前用户密码，装完即可。

**步骤二：在 backend/.env 中关闭“安装依赖”里的 sudo**

在 `backend/.env` 中增加一行：

```env
SKIP_PLAYWRIGHT_DEPS=1
```

表示执行计划时只跑 `npx playwright install`（装浏览器到用户目录），不再跑 `--with-deps`（不装系统包、不触发 sudo）。

> **说明**：旧版本曾因 Node ESM 中 `import` 先于 `dotenv.config()` 执行，导致 `SKIP_PLAYWRIGHT_DEPS` 未生效、仍会索要 sudo。当前代码已用 `src/loadEnv.js` 优先加载 `.env`；若你仍遇此问题，请 `git pull` 更新后再重启后端。

**步骤三：重启后端**

```bash
pm2 restart uiauto
# 或若没用 pm2：先停掉再 npm start
```

此后任意已注册用户点击「执行」都不会再出现 `[sudo] 密码` 提示。若首次执行某用例仓库仍报「Executable doesn't exist」，到该仓库目录执行一次 `npx playwright install`（见上文「Playwright 浏览器未安装」）。

### 5. 金山协作 / WPS 群机器人通知（可选）

在协作群内添加 **Webhook 机器人**，拿到发送地址后写入 `backend/.env`：

```env
WPS_NOTIFY_ENABLED=1
WPS_WEBHOOK_URL=https://xz.wps.cn/api/v1/webhook/send?key=你的key
# 消息内「查看报告」链接（同事浏览器能打开的 UIAuto 地址，勿尾斜杠）
UIAUTO_PUBLIC_BASE_URL=https://你的域名或IP:3001
```

- **开始执行**：用户点击执行或定时任务触发时，向群内发一条 Markdown（计划名、Run 编号、用例数、触发方式）。
- **结束**：全部跑完、失败、取消或「计划无用例」时，再发一条（含通过数/总数或失败原因）。

文档参考：[WPS 机器人 Webhook](https://365.kdocs.cn/3rd/open/documents/app-integration-dev/guide/robot/webhook)、[金山协作通知](https://developer.kdocs.cn/server/notification/woa.html)。若贵司使用开放平台 `notification/woa` 等需 `access_token` 的接口，可再封装一层；当前实现为直接向 Webhook URL POST `msgtype: markdown` 的 JSON。

未配置 `WPS_WEBHOOK_URL` 时不会发送任何请求。

---

## 四、构建前端并启动服务

### 0. 环境变量示例（`backend/.env`）

```env
JWT_SECRET=请改为随机长字符串
# 开放注册（二选一）：内网开放 或 邀请码
UIAUTO_OPEN_REGISTER=1
# UIAUTO_INVITE_CODE=公司内部邀请码
# 服务端执行计划时不触发 sudo 密码（需先执行一次 sudo npx playwright install-deps chromium）
SKIP_PLAYWRIGHT_DEPS=1
# 可选：金山协作群 Webhook 通知
# WPS_NOTIFY_ENABLED=1
# WPS_WEBHOOK_URL=https://xz.wps.cn/api/v1/webhook/send?key=xxx
# UIAUTO_PUBLIC_BASE_URL=https://你的访问地址:3001
```

### 1. 构建前端（产出到 backend/public）

```bash
cd /opt/uiauto
npm run build
```

### 2. 启动后端（前台运行，仅用于试跑）

```bash
cd /opt/uiauto
npm start
```

浏览器访问：`http://<服务器IP>:3001`。

Ctrl+C 停止后，若需常驻运行，用下面的 pm2 方式。

---

## 五、使用 pm2 常驻运行（推荐）

```bash
sudo npm install -g pm2
cd /opt/uiauto
pm2 start backend/src/index.js --name uiauto --cwd backend
pm2 save
pm2 startup   # 按提示执行它输出的命令，实现开机自启
```

常用命令：

```bash
pm2 status        # 查看状态
pm2 logs uiauto   # 看日志（含 backend/data/uiauto.log 的 console）
pm2 restart uiauto
pm2 stop uiauto
```

---

## 六、更新部署（代码更新后）

在服务器项目目录执行：

```bash
cd /opt/uiauto
git pull origin main
npm run install:all   # 依赖有变更时
npm run build        # 重新打包前端
pm2 restart uiauto   # 若用 pm2
```

或使用一键脚本（拉代码 + 安装 + 构建 + 重启 pm2）：

```bash
cd /opt/uiauto
chmod +x scripts/deploy-ubuntu.sh
./scripts/deploy-ubuntu.sh
```

---

## 七、可选：Nginx 反向代理

若希望通过 80/443 访问或配置域名，可用 Nginx 反向代理到后端 3001：

```bash
sudo apt-get install -y nginx
sudo nano /etc/nginx/sites-available/uiauto
```

写入（将 `your_domain_or_ip` 换成域名或服务器 IP）：

```nginx
server {
    listen 80;
    server_name your_domain_or_ip;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用并重载：

```bash
sudo ln -s /etc/nginx/sites-available/uiauto /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

访问：`http://your_domain_or_ip`。

---

## 八、目录与权限说明

| 路径 | 说明 |
|------|------|
| `backend/data/` | SQLite 数据库、uiauto.log、run.env（需可写） |
| `backend/repos/` | 克隆的用例仓库（自动创建，需可写） |
| `backend/results/` | 每次运行的截图/录屏/日志（自动创建，需可写） |

运行用户需要对整个项目目录有写权限（或至少对上述目录可写）。

---

## 九、简要命令速查（复制到服务器执行）

```bash
# 环境（仅首次）
sudo apt-get update && sudo apt-get install -y git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
npx playwright install-deps chromium && npx playwright install chromium

# 部署
cd /opt/uiauto
git clone https://github.com/szu-sg/uiauto.git .   # 首次
# 或 git pull origin main   # 更新
npm run install:all
npm run build
mkdir -p backend/data
# 可选： echo 'WPS_SID=xxx' > backend/data/run.env

# 常驻
sudo npm install -g pm2
pm2 start backend/src/index.js --name uiauto --cwd /opt/uiauto/backend
pm2 save && pm2 startup
```

访问：`http://<服务器IP>:3001`。
