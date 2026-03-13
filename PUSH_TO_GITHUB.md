# 将代码推送到 GitHub

## 1. 在 GitHub 上创建新仓库

1. 打开 https://github.com/new
2. **Repository name**：例如 `uiauto` 或 `web-ui-autotest`
3. **Description**（选填）：如 "Playwright Web UI 自动化测试平台"
4. 选择 **Public**
5. **不要**勾选 "Add a README file"（本地已有）
6. 点击 **Create repository**

## 2. 添加远程并推送

创建好后，GitHub 会显示仓库地址，格式为：
- HTTPS: `https://github.com/你的用户名/仓库名.git`
- SSH: `git@github.com:你的用户名/仓库名.git`

在项目目录下执行（把下面的地址换成你的仓库地址）：

```bash
cd C:\Users\zhangxianzhen\Desktop\uiauto

# 添加远程（二选一）
git remote add origin https://github.com/你的用户名/仓库名.git
# 或 SSH：
# git remote add origin git@github.com:你的用户名/仓库名.git

# 推送到 GitHub
git push -u origin main
```

若提示登录，HTTPS 会要求输入用户名和 **Personal Access Token**（不是密码）；SSH 需先配置好密钥。

## 3. 若已存在 origin 或推送失败

```bash
# 查看当前远程
git remote -v

# 修改远程地址（如需）
git remote set-url origin https://github.com/你的用户名/仓库名.git

# 再次推送
git push -u origin main
```

完成以上步骤后，代码就会出现在你的 GitHub 仓库中。
