# QQ 农场智能助手

一个面向 QQ 农场的本地自动化控制台，包含多账号管理、农场状态看板、策略配置、好友互动、背包出售、自动控制和用户管理等能力。项目由 Node.js 服务端和 Vue 3 Web 控制台组成，默认以本机私有部署为主。

## 功能概览

- 多账号管理：支持账号添加、备注、头像展示、运行状态查看、停止和删除。
- 实时看板：展示农场土地、作物、背包、任务、好友互动和运行日志。
- 策略设置：配置种植策略、巡查间隔、好友静默时段、种植/偷菜延迟和化肥策略。
- 自动控制：支持自动种植收获、任务、出售、好友互动、施肥、购买化肥等开关。
- 离线提醒：支持 Webhook、Push Plus、Server 酱、Telegram、Bark 等通知渠道。
- 用户管理：支持登录、注册、密码修改、Token 查看、卡密续费和管理员面板。
- 桌面/容器部署：支持本地开发、Docker Compose 部署和 pkg 打包发布。

## 技术栈

- 服务端：Node.js、Express、Socket.IO、WebSocket、protobufjs、Winston
- 前端：Vue 3、Vite、TypeScript、Pinia、Vue Router、Element Plus
- 工程化：pnpm workspace、ESLint、Docker Compose、pkg

## 环境要求

- Node.js 20 或更高版本
- pnpm 10 或更高版本
- Docker / Docker Compose，可选

建议使用 Corepack 启用 pnpm：

```bash
corepack enable
```

## 快速开始

安装依赖：

```bash
pnpm install -r
```

构建前端并启动服务端：

```bash
pnpm dev
```

默认访问地址：

```text
http://localhost:3007
```

默认管理员账号和密码均为：

```text
admin
```

首次登录后请尽快在“设置 / 用户管理”中修改密码。

## 开发模式

分别启动前后端：

```bash
pnpm dev:web
pnpm dev:core
```

常用脚本：

```bash
pnpm build:web        # 构建 Web 控制台
pnpm build            # 构建前端
pnpm lint             # 检查并自动修复代码风格
pnpm package:release  # 打包多平台可执行文件
```

## Docker 部署

使用 Docker Compose 构建并启动：

```bash
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f
```

停止服务：

```bash
docker compose down
```

默认映射端口为 `3007`。如需调整宿主机端口：

```bash
PORT=8080 docker compose up -d --build
```

容器内服务仍监听 `3007`，外部访问 `http://localhost:8080`。

## 配置说明

常用环境变量：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `ADMIN_PORT` | 服务端管理面板端口 | `3007` |
| `ADMIN_PASSWORD` | 初始管理员密码 | `admin` |
| `FARM_DATA_DIR` | 数据目录 | `core/data` |
| `LOG_LEVEL` | 日志等级 | `info` |
| `WX_PROXY_API_URL` | 微信登录代理接口地址 | `http://127.0.0.1:8059/api` |
| `WX_PROXY_API_KEY` | 微信登录代理密钥 | 空 |
| `WX_PROXY_APP_ID` | 微信小程序 AppId | 内置默认值 |

本地数据默认写入：

```text
core/data/
core/data/logs/
```

Docker 部署会将数据持久化到 `qq-farm-data` 和 `qq-farm-logs` 卷中。

## 项目结构

```text
.
├── core/                 # Node.js 服务端、农场协议和自动化任务
│   ├── src/controllers/  # 管理端 API
│   ├── src/core/         # Worker 和核心调度
│   ├── src/models/       # 本地数据读写
│   ├── src/runtime/      # 多账号运行态
│   ├── src/services/     # 农场、好友、背包、推送等服务
│   └── src/utils/        # 网络、登录、通用工具
├── web/                  # Vue 3 Web 控制台
│   ├── src/components/   # 通用组件
│   ├── src/stores/       # Pinia 状态
│   ├── src/views/        # 页面视图
│   └── src/style.css     # 全局样式
├── docker-compose.yml    # 容器部署配置
└── package.json          # workspace 脚本
```

## 使用建议

- 仅在自己的账号和可控环境中使用。
- 避免过高频率的自动化操作，策略设置中建议保留合理间隔。
- 不要公开管理面板、Token、卡密或账号数据。
- 升级或迁移前备份 `core/data` 目录。

## 合规说明

本项目仅用于学习、研究和个人自动化测试。使用者应自行确认使用场景符合相关平台规则，并承担由账号、接口、网络环境或策略配置引起的风险。

项目依赖的第三方开源软件以各自许可证为准，依赖清单可在 `core/package.json` 和 `web/package.json` 中查看。
