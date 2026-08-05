# 本地发布候选验收

## 依赖与启动

```sh
docker compose -f infra/compose/docker-compose.yml up -d postgres redis

DATABASE_URL=postgresql://living_network:living_network_dev_only@127.0.0.1:5432/living_network \
  node apps/api/src/seed.ts

DATABASE_URL=postgresql://living_network:living_network_dev_only@127.0.0.1:5432/living_network \
REDIS_URL=redis://127.0.0.1:6379 \
  node apps/api/src/persistent-main.ts
```

另开终端启动 Worker 和 Web：

```sh
DATABASE_URL=postgresql://living_network:living_network_dev_only@127.0.0.1:5432/living_network \
REDIS_URL=redis://127.0.0.1:6379 \
  node apps/worker/src/persistent-main.ts

python3 -m http.server 4173 --directory apps/web
```

生产环境必须设置真实 `DATABASE_URL`、`REDIS_URL`、`API_CORS_ORIGINS` 和可信 Actor 代理。开发 Seed 只能用于本地环境。

## 自动验证

```sh
node_modules/.bin/tsc -p apps/api/tsconfig.json --pretty false
node_modules/.bin/tsc -p apps/worker/tsconfig.json --pretty false
node --test packages/*/src/*.test.ts apps/api/src/*.test.ts \
  apps/worker/src/*.test.ts apps/web/*.test.ts apps/web/src/*.test.ts \
  integration/*.test.ts infra/compose/*.test.ts .github/workflows/*.test.ts
```

真实服务验收需要已启动 PostgreSQL 和 Redis：

```sh
RUN_REAL_INTEGRATION=1 \
DATABASE_URL=postgresql://living_network:living_network_dev_only@127.0.0.1:5432/living_network \
REDIS_URL=redis://127.0.0.1:6379 \
  node --test integration/real-services.test.ts
```

## 浏览器冒烟清单

- Web 页面显示故事世界和当前角色。
- 聊天页显示 Seed 会话和历史消息。
- 动态、关系网、日历和 Workflow 设置可以加载。
- 角色切换后 Feed、会话和 ActorSession 上下文同步。
- API 跨来源请求不被 CORS 拦截。
- 浏览器控制台没有 error/warning。

## 停止与回滚

停止服务：

```sh
docker compose -f infra/compose/docker-compose.yml down
```

这不会删除 PostgreSQL、Redis 或 MinIO 数据卷。只有明确需要重建本地数据时才使用 `down -v`。代码任务按独立提交回滚；数据库只执行已记录的 up migration，不在服务启动时自动执行 down migration。
