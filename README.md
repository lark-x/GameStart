# Living Network

Living Network V2 是一个本地优先的 AI 互动游戏创作、审核、发布和游玩平台。创作者维护世界 Canon、叙事图和类型化状态；AI 输出只能成为候选，审核后才能进入 Canon 或不可变 Release。

当前默认运行时为 Vue 3/Vite Web、Fastify API、独立 Worker、SQLite + FTS5 和可选 Redis/BullMQ。V1 的 PostgreSQL、旧 API 和旧 Web 功能已冻结，仅保留在工作树和归档分支中，不是当前启动、CI 或产品入口。

## 环境要求

- Node.js 24+
- pnpm 11.1.2
- Docker Compose（仅持久化本地栈需要）

```sh
corepack enable
corepack prepare pnpm@11.1.2 --activate
pnpm install --frozen-lockfile
```

## 本地开发

复制 `.env.example` 后，核心编辑、发布和游玩不需要 Redis、LLM 或 ComfyUI：

```sh
cp .env.example .env
pnpm --filter @living-network/api dev:v2
pnpm --filter @living-network/web dev
```

- Web：<http://127.0.0.1:4173/v2>
- API：<http://127.0.0.1:3002>
- Health：`GET /api/v2/health`
- Ready：`GET /api/v2/ready`
- Capabilities：`GET /api/v2/capabilities`

首次打开空 SQLite 工作区时，Web 的 HTTP 模式会提供创建 Starter World 的入口。只读上下文预览可以离线使用；场景生成和资产生成默认关闭，必须显式配置外部服务后开启。

需要运行 Worker 时，先启动 Redis，再执行：

```sh
pnpm --filter @living-network/worker start:v2
```

Worker 等待 API 创建并迁移 SQLite schema，不执行 migration。Redis 只保存可重建队列状态。

## Compose 持久化栈

```sh
docker compose --env-file .env -f infra/compose/docker-compose.yml up -d
docker compose --env-file .env -f infra/compose/docker-compose.yml ps
```

Compose 服务为 `redis`、`api`、`worker`、`web`，SQLite、媒体和 Redis 使用独立卷。停止时保留数据：

```sh
docker compose --env-file .env -f infra/compose/docker-compose.yml down
```

不要在未确认备份前使用 `down -v`，它会删除本地 V2 数据卷。V1 数据删除不属于本次切换。

## 可选外部能力

场景生成需要 `V2_SCENE_GENERATION_ENABLED=true`、`LLM_BASE_URL` 和 `LLM_MODEL`；资产生成需要 `V2_ASSET_GENERATION_ENABLED=true` 和 `COMFYUI_BASE_URL`。外部输出必须经过解析、校验和候选审核，浏览器不直接访问供应商服务。

Web Mock 只能显式启用：

```sh
VITE_V2_ENABLE_MOCK=true pnpm --filter @living-network/web dev
```

## 验证

```sh
pnpm check:boundaries
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm --filter @living-network/web lint
pnpm test:integration
pnpm test:e2e
```

`test:coverage` 保持 V2 生产文件 100% 行覆盖率门槛。真实 Redis 通过 `RUN_V2_REAL_INTEGRATION=1` 单独验收；真实 LLM、ComfyUI 和 Qdrant 未配置时不能声称已验收。

## 文档与退役边界

- [当前架构](docs/architecture.md)
- [开发原则](docs/DEVELOPMENT.md)
- [当前进度](docs/PROGRESS.md)
- [发布验收](docs/RELEASE.md)
- [V2 执行入口](docs/v2/execution-entry.md)
- [V1 退役计划](docs/plans/v1-retirement-and-baseline-repair.md)

V1 归档分支为 `archive/v1-final`，基线 SHA 为 `96130c5e37e83fddfe3e2c252a46c3ca0d17a340`。本次切换不迁移、不双写、不删除 V1 数据或历史 migration；物理删除需要单独批准的后续任务。
