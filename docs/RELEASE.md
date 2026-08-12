# 本地发布候选验收

最后核对：2026-08-12

本清单用于当前 Vue/Vite、PostgreSQL、Redis 和 Worker 架构。默认自动验证不会调用真实 LLM 或 ComfyUI。

## 1. 工具链与配置

- Node.js 24（与 CI 一致）。
- pnpm 11.1.2。
- Docker Compose（持久模式）。
- 从 `.env.example` 创建未提交的 `.env`，并为持久化的模型档案设置稳定 `INTEGRATION_SECRET_KEY`。

```sh
corepack prepare pnpm@11.1.2 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

`.env.example` 的开发凭据只适用于本地；共享或部署前必须替换数据库、MinIO 和集成密钥，并配置可信认证代理、TLS 与 CORS。

## 2. 快速内存模式

分别启动 API 与 Web：

```sh
pnpm --filter @living-network/api dev
pnpm --filter @living-network/web dev
```

打开 <http://127.0.0.1:4173>。该模式不验证 PostgreSQL、Redis、Worker、持久化恢复或正式创作者派发。

## 3. 持久模式

完整 Compose 栈会构建应用、执行 migration/seed，并启动 API、Worker 和 Nginx Web：

```sh
docker compose --env-file .env -f infra/compose/docker-compose.yml up -d
docker compose --env-file .env -f infra/compose/docker-compose.yml ps
```

也可以只启动基础设施，导入 `.env` 后分别运行应用：

```sh
docker compose --env-file .env -f infra/compose/docker-compose.yml up -d postgres redis minio

set -a
. ./.env
set +a

export API_PORT=3001

pnpm --filter @living-network/api bootstrap:postgres
pnpm --filter @living-network/api start:postgres
pnpm --filter @living-network/worker start:postgres
pnpm --filter @living-network/web dev
```

API 与 Worker 必须在不同终端运行。这里覆盖为 3001 是为了匹配 Vite 开发代理；完整 Compose 使用 `.env` 的宿主映射（示例为 3000），但容器内部 API 始终监听 3001。持久 API 的 `/ready` 应返回成功，Worker 心跳应在创作者调度台显示可用。

## 4. 自动质量门槛

与 CI 对齐执行：

```sh
pnpm check:boundaries
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm --filter @living-network/web lint
```

真实 PostgreSQL/Redis 集成：

```sh
RUN_REAL_INTEGRATION=1 \
DATABASE_URL=postgresql://living_network:living_network_dev_only@127.0.0.1:5432/living_network \
REDIS_URL=redis://127.0.0.1:6379 \
  pnpm test:integration
```

Playwright 会自动启动内存 API 与 Vue/Vite Web：

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

CI 在 PR 和 `main` push 上运行 verify、真实 PostgreSQL/Redis 和 E2E 三个 Job。自动测试通过不等于真实外部生成服务已验收。

## 5. 显式外部服务验收

真实 OpenAI-compatible LLM：

```sh
RUN_LLM_ACCEPTANCE=1 \
LLM_BASE_URL=https://provider.example/v1 \
LLM_API_KEY=... \
LLM_MODEL=... \
  node --test integration/llm-acceptance.test.ts
```

真实 ComfyUI：

```sh
RUN_COMFYUI_ACCEPTANCE=1 \
COMFYUI_BASE_URL=http://127.0.0.1:8188 \
COMFYUI_WORKFLOW_FILE=./path/to/workflow-api.json \
  node --test integration/comfyui-acceptance.test.ts
```

若同时验证 WebSocket 进度，增加 `COMFYUI_PROGRESS_ACCEPTANCE=1`。真实调用可能产生供应商费用或本地 GPU 负载，必须由使用者显式启用。

## 6. 浏览器验收清单

- 世界、角色和 ActorSession 能加载并切换。
- 聊天能保存消息、显示 SSE 回复、失败后重试，并正确展示图片/贴纸状态。
- Feed、关系、日历、相册和创作中心页面可访问，控制台无阻塞错误。
- 内容管理能编辑世界、角色、关系、事件、世界资料和 Story Graph，刷新后持久数据仍存在。
- Story Graph 可编辑剧情弧、节点和边，Prompt 预览不调用模型，记忆候选必须经审核。
- 创作者派发经过扫描、预览、确认、PENDING、BullMQ 和最终状态，重放不重复产生输出。
- 三套前端主题和 360px 窄屏无横向溢出或关键操作遮挡。
- 未配置 LLM/ComfyUI 时，界面明确降级，不把占位或失败状态显示为真实成功。

## 7. 停止与回滚

```sh
docker compose --env-file .env -f infra/compose/docker-compose.yml down
```

该命令保留 PostgreSQL、Redis、MinIO 和媒体卷。只有明确需要销毁本地数据时才使用 `down -v`。数据库正常运行只执行 up migration；down migration 用于经过确认的开发回滚，不在服务启动时自动执行。
