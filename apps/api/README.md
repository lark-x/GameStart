# `@living-network/api`

当前阶段提供无外部运行依赖的 API application 边界和 Node HTTP adapter：

- `GET /health`
- `GET /v1/worlds`
- `GET /v1/characters?storyWorldId=...`
- `POST/PUT /v1/worlds`、`POST/PUT /v1/characters`
- `GET/POST/PUT /v1/relationships`
- `GET/POST /v1/world-events`、`PUT /v1/world-events/:id`
- `POST /v1/actor-sessions/switch`

当前使用内存 Store 作为可重复测试的适配器，并提供运行时内容编辑、角色视觉身份与 ComfyUI workflow 模板端点。数据库、认证、LLM、Worker 和 Fastify 集成仍按任务逐步接入；业务规则仍由 `packages/domain` 负责。

`createApiRuntime(config, repositories)` 负责组装配置、仓储、应用和 Node server；启动方必须显式提供仓储，不会在生产路径隐式创建内存数据库。

## 本地开发启动

开发阶段可以使用显式的内存 Seed 启动 API：

```sh
pnpm --filter @living-network/api dev
```

默认监听 `127.0.0.1:3001`，健康检查为 `http://127.0.0.1:3001/health`。Seed 仅用于开发入口；生产启动必须注入真实仓储，不能复用 `createDevelopmentRepositories()`。

接入本地 PostgreSQL 后，可以显式执行 migration、Seed 和持久化 API：

```sh
DATABASE_URL=postgresql://living_network:living_network_dev_only@127.0.0.1:5432/living_network \
  pnpm --filter @living-network/api seed:postgres
DATABASE_URL=postgresql://living_network:living_network_dev_only@127.0.0.1:5432/living_network \
  pnpm --filter @living-network/api start:postgres
```

持久化启动会先执行缺失的 up migrations；不会执行 down migrations，也不会隐式回退到内存仓储。
