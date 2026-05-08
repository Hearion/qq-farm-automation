# 自动部署说明

项目已经内置 GitHub Actions 工作流：`.github/workflows/deploy.yml`。

当代码推送到 `main` 分支时，工作流会执行：

1. 拉取代码。
2. 安装依赖并执行 `pnpm build:web`。
3. 通过 SSH 登录服务器。
4. 在服务器部署目录拉取最新代码。
5. 执行 `docker compose up -d --build --remove-orphans`。

也可以在 GitHub Actions 页面手动运行 `Deploy` 工作流。

## GitHub Secrets

在仓库的 `Settings / Secrets and variables / Actions` 中添加以下 Secrets：

| Secret | 必填 | 说明 |
| --- | --- | --- |
| `DEPLOY_HOST` | 是 | 服务器 IP 或域名 |
| `DEPLOY_USER` | 是 | SSH 登录用户名 |
| `DEPLOY_SSH_KEY` | 是 | SSH 私钥内容，建议使用专门的部署密钥 |
| `DEPLOY_PORT` | 否 | SSH 端口，默认 `22` |
| `DEPLOY_PATH` | 否 | 服务器部署目录，默认 `/opt/qq-farm-automation` |
| `APP_PORT` | 否 | 对外访问端口，默认 `3007` |

## 服务器要求

服务器需要提前安装：

- Git
- Docker
- Docker Compose

部署用户需要具备运行 Docker 的权限。

## 首次配置

1. 在服务器生成或准备一组 SSH key。
2. 将公钥加入服务器的 `~/.ssh/authorized_keys`。
3. 将私钥内容写入 GitHub Secret：`DEPLOY_SSH_KEY`。
4. 配置 `DEPLOY_HOST`、`DEPLOY_USER` 等 Secrets。
5. 推送代码到 `main` 分支。

如果仓库是私有仓库，服务器需要能通过 HTTPS 拉取该仓库。推荐将仓库设为 public，或在服务器配置可读取该仓库的 GitHub 凭据。
