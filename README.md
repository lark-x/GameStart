# Living Network

角色生活模拟与社交叙事系统。项目采用 pnpm workspace 管理的 TypeScript monorepo，包含 API、Web 界面、后台 Worker、领域模型、数据库适配器、LLM Provider 和本地基础设施。

当前版本适合本地开发和 MVP 验收：可以运行角色世界、动态、聊天、SSE 回复、关系网、世界日历、Story Graph、视觉 Workflow 与表情包界面；持久化运行使用 PostgreSQL 和 Redis。LLM 与 ComfyUI 是可注入的外部适配器，当前媒体由本地文件适配器保存；不配置外部生成服务时仍可使用开发 Seed 和测试替身。

## 环境要求

- Git
- Node.js 22 或更高版本（推荐使用当前 LTS）
- pnpm 11.1.2（仓库通过 `packageManager` 固定版本）
- Python 3（仅在需要运行保留的原生静态 Web 历史入口时使用）
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

终端一：启动 API（默认 `http://127.0.0.1:3001`）：

```sh
pnpm --filter @living-network/api dev
```

终端二：启动 Vue/Vite Web（默认 `http://127.0.0.1:4173`）：

```sh
pnpm --filter @living-network/web dev
```

然后打开 <http://127.0.0.1:4173/>。页面会自动读取开发 Seed 中的故事世界和角色；也可以通过 URL 参数指定 `storyWorldId`、`readerCharacterId` 和 `actorSessionId`。

API 健康检查：

```sh
curl http://127.0.0.1:3001/health
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

# Vite 开发代理固定访问 127.0.0.1:3001；手动运行持久 API 时覆盖示例文件中的 Compose 宿主端口。
export API_PORT=3001
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

以上“宿主进程 + Vite”方式使用 API `http://127.0.0.1:3001` 和 Web `http://127.0.0.1:4173`。完整 Compose 默认从 `.env.example` 暴露 API `http://127.0.0.1:3000`，Web 仍为 `http://127.0.0.1:4173`，容器内部 API 端口为 3001。PostgreSQL、Redis 和 MinIO API 默认分别为 `5432`、`6379` 和 `9000`。部署或共享环境前请修改开发凭据，并设置明确的 `API_CORS_ORIGINS`。

### 启用本地 LLM、ComfyUI 与图片任务

持久化模式下，打开 Web 的“设置”页即可创建多个 LLM 档案，并手动选择一个为当前档案：

- **OpenAI-compatible**：适用于 OpenAI API 兼容的本地或云端服务，填写基础地址、模型名和 API Key。
- **Anthropic**：使用 Anthropic 原生 Messages API，填写基础地址、模型名和 API Key。

设置页写入的 API Key 会以 AES-256-GCM 加密存入 PostgreSQL；启动持久化 API 前必须在 `.env` 中设置一次 `INTEGRATION_SECRET_KEY`。它必须是一个 32 字节随机密钥的 Base64 值，例如：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

请妥善保存该值，不要提交到仓库，也不要在已有档案后随意更换；更换后原来保存的 Key 无法解密。未创建启用档案时，API 会使用 `LLM_BASE_URL`、`LLM_MODEL` 与 `LLM_API_KEY` 作为 OpenAI-compatible 回退配置。

同一页也可配置本机 ComfyUI 的地址、超时、默认工作流版本，以及聊天自动图片意图开关。浏览器不会直接访问 ComfyUI；持久化 Worker 会读取这份配置。要实际生成图片，还需要：

1. 在“视觉工作流”中保存与 ComfyUI 节点字段匹配的工作流版本，并将其设为默认工作流或在请求中指定。
2. 确认 ComfyUI 已启动（默认 `http://127.0.0.1:8188`），再将 `.env` 的 `IMAGE_GENERATION_ENABLED=true`。
3. 重启 Worker。它会在每个调度周期处理已排队和此前已提交的图片任务，将 ComfyUI 输出下载到 `MEDIA_ROOT`。

聊天页可在一对一私聊中明确请求一张图片；系统会创建可查询的图片任务。“聊天自动图片意图”开关会持久化为 ComfyUI 配置，供后续意图驱动策略使用。事件编辑器可分别选择“发送消息”“发布动态”“生成图片”三种输出，并为已启用输出指定接收角色；动态图片在成功后会自动发布。

“管理”页提供世界观条目的分类、启用状态、标签和全文检索。角色的人设文本会作为聊天模型的系统上下文；世界观条目当前用于管理、检索和后续内容编排。

本项目不会自动加载 `.env`。在每个启动 API 或 Worker 的终端中先导入变量；PowerShell 可使用：

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2], 'Process')
  }
}
```

然后分别运行 `pnpm --filter @living-network/api start:postgres` 与 `pnpm --filter @living-network/worker start:postgres`。

停止本地基础设施：

```sh
docker compose --env-file .env -f infra/compose/docker-compose.yml down
```

只有明确要删除本地数据库、Redis 和 MinIO 数据时才使用 `down -v`。

## 测试与类型检查

```sh
pnpm typecheck
pnpm test
pnpm test:local  # 受限环境下的本地回归，不包含外部服务/端口阻断测试
pnpm test:coverage
pnpm test:integration
```

`pnpm test:coverage` 运行 API、Worker、Web、各共享包以及 MVP/基础设施测试，并将行覆盖率设为 100% 门槛。进程启动入口（`main.ts`、`persistent-main.ts`）属于运行时装配层，使用启动/运行时测试验证，未计入单元覆盖率门槛。

一次执行全部检查：

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @living-network/web lint
```

覆盖率需独立执行：

```sh
pnpm test:coverage
```

### CI 质量门槛

GitHub Actions CI 在每个 PR 和 main push 上运行三个 Job：

1. **verify** — `pnpm check:boundaries`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm --filter @living-network/web lint`
2. **real-services** — PostgreSQL/Redis 真实集成测试（`RUN_REAL_INTEGRATION=1 pnpm test:integration`）
3. **e2e** — Playwright 端到端测试（依赖 verify + real-services 通过）

真实 PostgreSQL/Redis 集成测试需要先启动对应容器：

```sh
RUN_REAL_INTEGRATION=1 pnpm exec node --test integration/real-services.test.ts
```

真实 LLM 验收需要配置 OpenAI-compatible endpoint、模型和 Key：

```sh
RUN_LLM_ACCEPTANCE=1 \
LLM_BASE_URL=https://your-provider.example/v1 \
LLM_API_KEY=*** \
LLM_MODEL=your-model \
  node --test integration/llm-acceptance.test.ts
```

真实 ComfyUI 的完整图片链路需要提供 ComfyUI API 格式的有效 Workflow JSON：

```sh
RUN_COMFYUI_ACCEPTANCE=1 \
COMFYUI_BASE_URL=http://127.0.0.1:8188 \
COMFYUI_WORKFLOW_FILE=./path/to/workflow-api.json \
  node --test integration/comfyui-acceptance.test.ts

# 可选：同时验收 ComfyUI WebSocket 进度和终态事件（Node 22+）
RUN_COMFYUI_ACCEPTANCE=1 COMFYUI_PROGRESS_ACCEPTANCE=1 \
COMFYUI_WORKFLOW_FILE=./path/to/workflow-api.json \
  node --test integration/comfyui-acceptance.test.ts
```

Playwright 基线（内存 API + Vue/Vite Web）使用：

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

## 仓库结构

```text
AGENTS.md       模型与开发代理的根级执行契约
apps/api/        TypeScript API 与开发/持久化启动入口
apps/web/        Vue 3 + Vite Web 应用
apps/worker/     定时事件、队列、媒体和 Outbox Worker
packages/domain/ 领域模型与业务规则
packages/contracts/共享契约与校验
packages/ports/  仓储、Outbox、派发和日志接口
packages/database/内存仓储、PostgreSQL 适配器与迁移
packages/ai/      OpenAI-compatible / Anthropic Provider
packages/config/  环境变量解析与功能开关
infra/compose/    PostgreSQL、Redis、MinIO 本地编排
integration/      MVP 与真实服务集成测试
docs/             架构、规范、进度、发布验收、ADR 与历史归档
```

## 进一步文档

- [文档索引](docs/README.md)
- [当前系统架构](docs/architecture.md)
- [开发原则](docs/DEVELOPMENT.md)
- [前端开发规范](docs/frontend-development-standard.md)
- [当前进度](docs/PROGRESS.md)
- [发布候选验收](docs/RELEASE.md)
- [架构决策](docs/decisions/README.md)
- [本地基础设施](infra/compose/README.md)
- [API 说明](apps/api/README.md)
- [Web 说明](apps/web/README.md)
- [Worker 说明](apps/worker/README.md)

## 当前限制

- Web 当前默认入口为 Vue/Vite，`pnpm --filter @living-network/web dev` 会启动 Vite；原生静态 Web 只保留为历史兼容入口。
- 开发 API 使用内存 Seed；生产或持久化运行必须显式配置 PostgreSQL 仓储。
- 未配置 LLM 或 ComfyUI 时，开发 Seed 与测试替身仍可运行；这不代表已连接真实供应商。图片任务泵默认关闭，只有 `IMAGE_GENERATION_ENABLED=true` 的持久化 Worker 才会访问 ComfyUI。
- 项目默认是本地开发配置，不包含生产级认证、域名、TLS、密钥管理和监控部署方案。
- Story Graph 已支持剧情弧、节点、边、Prompt 模板/预览和记忆候选审核；自动剧情生成与状态推进仍属于后续能力。

## 创作者事件派发说明（M7A）

创作者事件调度台支持“进入世界 / 创作中心”双模式。创作模式包含事件调度台、内容管理、视觉工作台和集成设置。内存开发模式可以扫描事件候选并查看只读影响预览，但不能正式派发事件；正式创作者派发必须使用持久化模式，并同时启动 PostgreSQL、Redis 和 Worker。

```sh
# 持久化基础设施
docker compose --env-file .env -f infra/compose/docker-compose.yml up -d postgres redis minio

# 分别导入 .env 后启动 API、Worker 和 Web
pnpm --filter @living-network/api start:postgres
pnpm --filter @living-network/worker start:postgres
pnpm --filter @living-network/web dev
```

M7A 的候选扫描、影响预览和批次状态接口可以在内存模式验证。2026-08-09 已在真实本地 Compose PostgreSQL + Redis + Worker 环境完成 `MANUAL` 候选 → preview → `PENDING_DISPATCH` → BullMQ → `COMPLETED` → 朋友圈 Moment 的派发链验收，并清理验收数据。该结果明确覆盖 M7A 的真实 PostgreSQL/Redis 派发链，但不代表真实 LLM 或 ComfyUI 已验收；这两类外部服务仍需在可用且配置明确后单独验收。
## 交互日志与自动回复

体验者在 USER → AI 私聊中发送文本后，API 会自动排队生成回复；失败不会删除用户消息，可以在聊天页重试。创作中心的“交互日志”页面提供历史筛选与实时 SSE，模型档案支持显式“测试连接”。

- Web：http://127.0.0.1:4173
- API：http://127.0.0.1:3001
- 日志历史：GET /v1/interaction-logs
- 日志实时流：GET /v1/interaction-logs/stream
- 模型测试：POST /v1/llm-provider-profiles/:id/test

持久日志保留 7 天，正文最多保留 500 字符预览，并递归隐藏密钥、认证头、Cookie、token、password 和密文。自动测试只使用 Fake Provider；真实模型调用需要用户在模型档案中主动点击“测试连接”。
