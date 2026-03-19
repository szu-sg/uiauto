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

### 1. 账号与 JWT（多用户）

- **首个账号**：部署后浏览器打开站点 →「注册管理员」。
- **更多用户**：在 `backend/.env` 或 systemd 环境中设置 **`UIAUTO_INVITE_CODE=你的邀请码`**，新用户注册时填写该码。
- **生产务必设置** **`JWT_SECRET`**（随机字符串），否则 Token 易被伪造。

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

---

## 四、构建前端并启动服务

### 0. 环境变量示例（`backend/.env`）

```env
JWT_SECRET=请改为随机长字符串
UIAUTO_INVITE_CODE=公司内部邀请码
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
