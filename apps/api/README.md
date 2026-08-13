# `@living-network/api`

V2 Fastify API。当前公共路径为 `/api/v2`，业务事实存储为 Node `node:sqlite` + FTS5。

## 本地启动

```sh
pnpm --filter @living-network/api dev:v2
```

默认监听 `127.0.0.1:3002`，SQLite 路径由 `V2_SQLITE_PATH` 控制，默认是 `.data/living-network-v2.sqlite`。API 启动时只执行缺失的 V2 up migration，不执行 down migration；Worker 必须等待 `/api/v2/ready`。

基础端点：

- `GET /api/v2/health`
- `GET /api/v2/ready`
- `GET /api/v2/capabilities`
- `/api/v2/core/*`：Canon、Graph、Typed State、Review、Release、Runtime 和 Export
- `/api/v2/generation/*`：上下文预览、任务、资产候选和审核

场景/资产生成能力默认关闭。配置 `V2_SCENE_GENERATION_ENABLED` 或 `V2_ASSET_GENERATION_ENABLED` 后，API 仍只创建 Job/Candidate，不直接把外部输出写入最终 Canon。

## 验证

```sh
pnpm --filter @living-network/api typecheck
pnpm --filter @living-network/api test
pnpm --filter @living-network/api build
```

V1 `node:http` API、PostgreSQL 入口和旧 `/v1` 路由代码仍作为冻结归档内容保留，不是本包默认脚本或当前运行时。
