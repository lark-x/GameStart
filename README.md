# Living Network

角色生活模拟与社交叙事系统。项目采用 pnpm workspace 管理的 TypeScript monorepo，包含 API、Web 界面、后台 Worker、领域模型、数据库适配器、LLM Provider 和本地基础设施。

当前版本适合本地开发和 MVP 验收：可以运行角色世界、动态、聊天、SSE 回复、关系网、世界日历、视觉 Workflow 与表情包界面；持久化运行使用 PostgreSQL 和 Redis。LLM、ComfyUI 和对象存储是可注入的外部适配器，不配置时仍可使用开发 Seed 和测试替身。

## 环境要求

- Git
- Node.js 22 或更高版本（推荐使用当前 LTS）
- pnpm 11.1.2（仓库通过 `packageManager` 固定版本）
- Python 3（仅用于启动无构建依赖的静态 Web）
- Docker Desktop 或 Docker Engine + Compose（仅持久化模式需要）

## 克隆与安装

```sh
git clone https://github.com/lark-x/GameStart.git
cd GameStart

corepack enable
corepack prepare pnpm@11.1.2 --activate
pnpm install
```

如果本机已经安装 pnpm 11.1.2，可以跳过 `corepack` 两行。不要提交 `node_modules`、`.env` 或本地数据目录。

## 快速启动：内存开发模式

该模式不需要 Docker、PostgreSQL、Redis、LLM 或 ComfyUI，适合第一次运行和前端联调。

终端一：启动 API（默认 `http://127.0.0.1:3000`）：

```sh
pnpm --filter @living-network/api dev
```

终端二：启动静态 Web（默认 `http://127.0.0.1:4173`）：

```sh
pnpm --filter @living-network/web dev
```

然后打开 <http://127.0.0.1:4173/>。页面会自动读取开发 Seed 中的故事世界和角色；也可以通过 URL 参数指定 `storyWorldId`、`readerCharacterId` 和 `actorSessionId`。

API 健康检查：

```sh
curl http://127.0.0.1:3000/health
```

## 持久化开发模式：PostgreSQL + Redis

先准备本地配置并启动基础设施：

```sh
cp .env.example .env
docker compose --env-file .env -f infra/compose/docker-compose.yml up -d postgres redis minio
docker compose --env-file .env -f infra/compose/docker-compose.yml ps
```

API 和 Worker 进程不会自动读取 `.env` 文件。每个运行进程的终端都需要先导出环境变量：

```sh
set -a
. ./.env
set +a
```

终端一：执行数据库迁移并写入开发 Seed：

```sh
pnpm --filter @living-network/api seed:postgres
```

终端二：启动持久化 API：

```sh
pnpm --filter @living-network/api start:postgres
```

终端三：启动持久化 Worker：

```sh
pnpm --filter @living-network/worker start:postgres
```

终端四：启动 Web：

```sh
pnpm --filter @living-network/web dev
```

默认服务地址：API `http://127.0.0.1:3000`、Web `http://127.0.0.1:4173`、PostgreSQL `127.0.0.1:5432`、Redis `127.0.0.1:6379`、MinIO API `127.0.0.1:9000`。部署或共享环境前请修改 `.env` 中的开发凭据，并设置明确的 `API_CORS_ORIGINS`。

停止本地基础设施：

```sh
docker compose --env-file .env -f infra/compose/docker-compose.yml down
```

只有明确要删除本地数据库、Redis 和 MinIO 数据时才使用 `down -v`。

## 测试与类型检查

```sh
pnpm typecheck
pnpm test
pnpm test:integration
```

一次执行全部检查：

```sh
pnpm test:all
pnpm build
```

真实 PostgreSQL/Redis 集成测试需要先启动对应容器：

```sh
RUN_REAL_INTEGRATION=1 pnpm exec node --test integration/real-services.test.ts
```

## 仓库结构

```text
apps/api/        TypeScript API 与开发/持久化启动入口
apps/web/        无构建依赖的浏览器 Web MVP
apps/worker/     定时事件、队列、媒体和 Outbox Worker
packages/domain/ 领域模型与业务规则
packages/contracts/共享契约与校验
packages/database/内存仓储、PostgreSQL 适配器与迁移
packages/ai/      OpenAI-compatible Provider 接口
packages/config/  环境变量解析与功能开关
infra/compose/    PostgreSQL、Redis、MinIO 本地编排
integration/      MVP 与真实服务集成测试
docs/             开发计划、进度、发布验收和任务契约
```

## 进一步文档

- [开发说明](docs/DEVELOPMENT.md)
- [当前进度](docs/PROGRESS.md)
- [发布候选验收](docs/RELEASE.md)
- [本地基础设施](infra/compose/README.md)
- [API 说明](apps/api/README.md)
- [Web 说明](apps/web/README.md)
- [Worker 说明](apps/worker/README.md)

## 当前限制

- Web 当前是原生浏览器模块静态页面，不需要 Vite 构建；后续可以迁移到 Vue/Vite。
- 开发 API 使用内存 Seed；生产或持久化运行必须显式配置 PostgreSQL 仓储。
- 没有配置 LLM 或 ComfyUI 时，相关能力使用接口边界和测试替身，不代表已经连接真实供应商。
- 项目默认是本地开发配置，不包含生产级认证、域名、TLS、密钥管理和监控部署方案。
