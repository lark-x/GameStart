# V2 本地发布候选验收

最后核对：2026-08-14

V2 是当前唯一正式运行时：Fastify + SQLite/FTS5 + Redis/BullMQ + Vue/Vite。V1 PostgreSQL 运行方式已冻结，不再作为本发布候选的验收路径。

## 1. 工具链与配置

- Node.js 24；pnpm 11.1.2；Docker Compose（可选持久栈）。
- 从 `.env.example` 创建未提交的 `.env`。
- `V2_SCENE_GENERATION_ENABLED`、`V2_ASSET_GENERATION_ENABLED` 默认 false；未配置外部服务时仍可编辑、发布和游玩。模型档案、图片服务和外观主题通过 Web 的“平台配置”页面保存到 V2 SQLite。
- 生产或共享环境应设置 `INTEGRATION_SECRET_KEY`（Base64 编码的 32 字节密钥），用于加密保存模型 API 密钥。

```sh
pnpm install --frozen-lockfile
cp .env.example .env
```

## 2. 本地开发

```sh
pnpm --filter @living-network/api dev:v2
pnpm --filter @living-network/web dev
```

打开 <http://127.0.0.1:4173/v2>，API 检查：

```sh
curl http://127.0.0.1:3003/api/v2/health
curl http://127.0.0.1:3003/api/v2/ready
```

V2 默认使用 `.data/living-network-v2.sqlite`；测试可使用 `V2_SQLITE_PATH=:memory:`。Web 默认使用 HTTP adapter，Mock 只能通过 `VITE_V2_ENABLE_MOCK=true` 显式启用。V2 Web 当前为中文单语言界面，不包含语言切换设置。

## 3. 持久本地栈

```sh
docker compose --env-file .env -f infra/compose/docker-compose.yml up -d
docker compose --env-file .env -f infra/compose/docker-compose.yml ps
```

Compose 服务为 `redis`、`api`、`worker`、`web`；API 负责向上 migration，Worker 等待 `/api/v2/ready`。SQLite、Redis 和媒体使用命名卷。

停止但保留数据：

```sh
docker compose --env-file .env -f infra/compose/docker-compose.yml down
```

不要在普通停机中使用 `down -v`；它会删除本地 SQLite、Redis 和媒体卷。V1 数据未在本切换中删除。

## 4. 自动质量门槛

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

`pnpm test:coverage` 保持 V2 生产文件 100% 行覆盖率门槛。默认 integration 在没有 Redis 时只报告跳过真实 Redis 用例；不能把跳过当作真实服务验收。

## 5. 真实服务证据

Redis：

```sh
RUN_V2_REAL_INTEGRATION=1 REDIS_URL=redis://127.0.0.1:6379 pnpm test:integration
```

真实 LLM/ComfyUI 需要显式开关、端点、模型/Workflow 和密钥；也可以先在 Web“平台配置”中保存模型档案并绑定能力。真实 Qdrant 需按后续 Slice D 计划验收。未配置时报告“未执行”，不报告为通过。

## 6. 发布回滚

应用回滚使用上一个已验收 V2 commit 和 SQLite/媒体备份。V1 回滚使用归档分支 `archive/v1-final`（基线 SHA `96130c5e37e83fddfe3e2c252a46c3ca0d17a340`）；本切换没有删除旧 PostgreSQL/Redis 数据，因此恢复数据生命周期仍需单独运行手册和批准。
