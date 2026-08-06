# Living Network 开发进度

最后更新：2026-08-06

这份文件是当前实现状态的唯一进度视图。`docs/tasks/` 保存任务契约和设计决策，不单独代表任务已经可以在真实运行环境中使用。

## 当前阶段

项目已形成可重复的本地 MVP 运行链，覆盖领域模型、API、持久化入口、Worker、SSE、动态、关系、日历和 Web 冒烟。`M1–M5` 用于记录本地能力的阶段性闭环；`0039–0055` 是里程碑代号，并非均已具备独立任务契约和完成证据。当前阶段从“本地 MVP 验收”进入“产品化补齐”。

M6 已完成文档校准、CI 分层验收、运行时内容编辑器、ComfyUI 进度适配器、原生 Web 的本地 Playwright 验收以及 Vue/Vite 的本地构建和类型检查；LLM、ComfyUI 真实服务验收仍待完成，Playwright 尚未接入 CI 门禁，Web 默认入口仍保留原生 shell。

## 已完成的能力边界

| 能力 | 任务 | 状态 | 证据 |
| --- | --- | --- | --- |
| 领域模型与状态机 | 0001–0003、0010、0015、0017、0019、0020–0023 | 已完成 | `packages/domain/src/` 与对应测试 |
| API application 与 SSE | 0004、0009、0011、0014、0021、0024、0027、0028、0035–0037 | 已完成 | `apps/api/src/` 与 API 测试 |
| 内存/SQL 仓储与迁移 | 0005–0007、0012、0016 | 本地持久化入口完成 | 内存仓储、迁移与 `start:postgres` 已落地，真实集成验证已覆盖基础链路 |
| 事件、行为与动态 | 0018–0021、0025–0026、0030 | MVP 闭环完成 | `apps/worker/src/` 与 `integration/mvp-flow.test.ts` |
| LLM Provider | 0013、0059 | 编排完成，真实服务待验收 | Provider、SSE、对话回复持久化和可选记忆写入已测试；真实模型验收脚本已覆盖 API 链路 |
| ComfyUI 与图片任务 | 0022–0025、0027、0037、0062 | HTTP/WebSocket 适配器与本地媒体存储完成，真实服务待验收 | Fake、HTTP client、WebSocket 进度、终态状态同步、重试、下载存储和 Worker 生命周期已测试；真实实例验收脚本待执行 |
| Web MVP | 0032–0038、0058、0060、0061 | 原生 shell、Vue/Vite 构建和本地 E2E 可用，默认入口待切换 | 原生 shell 已覆盖主要 API 和内容管理；Playwright 8 个核心路径本地通过；Vue Router/Pinia/7 个视图组件已通过 `vue-tsc` 和 `vite build` |
| 本地基础设施与 CI | 0029、0031、0057 | 已完成 | Compose、CI 分层验收（PR 快速门禁 + main 真实服务）已落地 |

## 当前执行顺序

### M6：产品化基础（进行中）

- 0056：进度台账与开发运行手册（已完成）
- 0057：CI 真实服务验收升级（已完成）
- 0058：内容管理与角色/世界/关系/基础事件编辑器（已完成）
- 0059：真实 LLM 联调与验收（脚本已完成，待真实配置）
- 0060：Web 前端 Vue/Vite 迁移启动（依赖、类型检查和构建已完成，默认入口待切换）
- 0061：浏览器 E2E 验收（本地 8/8 通过，待接入 CI 门禁）
- 0062：真实 ComfyUI 图片链路验收（HTTP/WebSocket 与终态同步已完成，待真实实例）

验收：进度文档与 README/RELEASE 口径一致；CI 具备 PostgreSQL/Redis 服务验证或明确分层；基础内容可在运行时创建与修改；至少一条真实 LLM 联调链路通过验收；前端完成 Vue/Vite 迁移并可独立启动；核心路径有 Playwright E2E 自动覆盖；真实 ComfyUI 图片生成链路可重复验收。

### M1：本地可运行 MVP（实现与原生 Web 浏览器验收已落地）

- 0039：进度台账与开发运行手册
- 0040：API 可执行启动入口
- 0041：开发 Seed 数据
- 0042：Web/API 联调、CORS 或同源代理

验收：`apps/api/src/main.ts` 和静态 Web 启动入口已落地；Playwright 已自动拉起开发 API 与静态 Web，世界、角色、动态、聊天、关系和内容管理路径已在本地 Chromium 验收通过。

### M2：真实 PostgreSQL（适配器已落地，真实服务验收待复跑）

- 0043：真实 PostgreSQL Driver Adapter
- 0044：Migration Runner
- 0045：PostgreSQL Seed 与真实集成测试

验收：真实 PostgreSQL 迁移、Seed、持久化 API、CORS 和重启读取路径已具备脚本；当前环境未运行 PostgreSQL，需在服务可用后复跑。

### M3：Worker、队列与图片（实现已落地，真实 Redis/图片服务验收待复跑）

- 0046：Worker 可执行入口
- 0047：Redis/BullMQ Adapter
- 0048：Outbox 一致性
- 0049：ComfyUI 进度、媒体存储与失败恢复

验收：持久化 Worker、BullMQ、Outbox 和真实 Redis/ComfyUI 路径已有运行入口与测试；当前只完成 Fake/HTTP 边界和本地媒体回归，真实服务需复跑。

### M4：对话、记忆与主动行为（本地编排已完成，真实模型验收待复跑）

- 0050：Conversation Orchestrator 和 AI 回复持久化
- 0051：记忆检索、Prompt 注入和异步写入
- 0052：主动消息、图片意图和人工审核

验收：SSE 生成完成后 AI Message 幂等持久化；记忆检索按可见性注入 Prompt，LLM 派生记忆带低置信度和来源；主动消息协调器支持结构化图片意图。

### M5：安全与发布（能力已落地，本地浏览器基线通过）

- 0053：可信 Actor Context 和认证边界
- 0054：日志、健康检查、就绪检查和运行摘要
- 0055：浏览器 E2E、Compose 验收和发布候选版本

验收：可信 Actor 模式拒绝缺失/错配身份；`/ready` 区分依赖不可用；HTTP 响应带 request ID；动态人工审核开关生效；静态 Web 的 8 个 Playwright 核心路径已在本地通过，CI 自动执行仍待接入。

## 验证记录

- `pnpm test:local` 退出码为 `0`：249 个测试中 241 passed、8 skipped；它明确排除了本地端口、PostgreSQL driver 和 BullMQ 队列测试。
- `pnpm test:e2e` 退出码为 `0`：8 个 Playwright 用例全部通过，覆盖世界、角色、动态、聊天、关系、内容管理以及关系/一次性事件的创建和修改。`@playwright/test` 已写入根依赖和锁文件，Chromium 本地运行时已安装。
- `pnpm test:all` 退出码为 `0`：8 个工作区包共 249 个测试通过；集成测试 3 passed、8 skipped，跳过项为未启用的真实 LLM、ComfyUI、PostgreSQL/Redis 验收。
- API/Contract/Web 关键测试均已通过；新增关系 CRUD、故事模式切换一致性、重复创建冲突和孤儿角色拒绝均有断言。
- `pnpm typecheck` 退出码为 `0`：API、Web、Worker、AI、Config、Contracts、Database、Domain 的 TypeScript 检查均通过。
- `pnpm install --frozen-lockfile` 退出码为 `0`：workspace 已明确将可选的 `msgpackr-extract` 原生构建设为不执行，BullMQ/pg/Playwright 工作区链接已恢复。
- `pnpm --filter @living-network/web exec vue-tsc -p tsconfig.json --noEmit` 退出码为 `0`；`pnpm --filter @living-network/web build` 退出码为 `0`，Vue 入口已生成生产构建产物。Web workspace 使用独立 TypeScript 5.x 检查 Vue 文件，根 workspace 仍使用 TypeScript 7。
- 真实 PostgreSQL/Redis、真实 LLM 和真实 ComfyUI 尚未在当前环境执行；ComfyUI WebSocket 进度适配器已由本地 Fake WebSocket 测试覆盖。
- 当前所有 M6 代码和文档仍在未提交工作区；最新 Git 提交仍为 `7c9b06f test: add full module coverage`。

发布候选启动、回滚和浏览器清单见 [RELEASE.md](./RELEASE.md)。

## 统一完成标准

每个任务都必须有明确范围、独立测试、退出码为 0 的验证命令、更新后的运行文档，并且不能依赖隐式内存存储。涉及数据库迁移、事务一致性或身份权限的任务，需要在实现前做单独的高风险审查。

## 暂缓事项

Vue/Vite 迁移、Fastify 替换、Drizzle、pgvector、微服务拆分、Tauri、复杂 RBAC 和完整 OpenTelemetry 不作为 M1–M4 的前置条件。
