# Living Network 开发进度

最后更新：2026-08-09

这份文件是当前实现状态的唯一进度视图。`docs/tasks/` 保存任务契约和设计决策，不单独代表任务已经可以在真实运行环境中使用。

## 当前阶段

项目已形成可重复的本地 MVP 运行链，覆盖领域模型、API、持久化入口、Worker、SSE、动态、关系、日历和 Web 冒烟。`M1–M5` 用于记录本地能力的阶段性闭环；`0039–0055` 是里程碑代号，并非均已具备独立任务契约和完成证据。当前阶段从“本地 MVP 验收”进入“产品化补齐”。

M6 已完成文档校准、CI 分层验收、运行时内容编辑器、ComfyUI 进度适配器、原生 Web 的历史 Playwright 验收以及 Vue/Vite 的默认入口切换、本地构建和类型检查；LLM、ComfyUI 真实服务验收仍待完成，Playwright 尚未接入 CI 门禁。M7A 已完成创作者事件调度台实现，并通过真实本地 Compose PostgreSQL + Redis + Worker 派发链验收。

## 已完成的能力边界

| 能力 | 任务 | 状态 | 证据 |
| --- | --- | --- | --- |
| 领域模型与状态机 | 0001–0003、0010、0015、0017、0019、0020–0023 | 已完成 | `packages/domain/src/` 与对应测试 |
| API application 与 SSE | 0004、0009、0011、0014、0021、0024、0027、0028、0035–0037 | 已完成 | `apps/api/src/` 与 API 测试 |
| 内存/SQL 仓储与迁移 | 0005–0007、0012、0016 | 本地持久化入口完成 | 内存仓储、迁移与 `start:postgres` 已落地，真实集成验证已覆盖基础链路 |
| 事件、行为与动态 | 0018–0021、0025–0026、0030 | MVP 闭环完成 | `apps/worker/src/` 与 `integration/mvp-flow.test.ts` |
| LLM Provider | 0013、0059 | 编排完成，真实服务待验收 | Provider、SSE、对话回复持久化和可选记忆写入已测试；真实模型验收脚本已覆盖 API 链路 |
| ComfyUI 与图片任务 | 0022–0025、0027、0037、0062 | HTTP/WebSocket 适配器与本地媒体存储完成，真实服务待验收 | Fake、HTTP client、WebSocket 进度、终态状态同步、重试、下载存储和 Worker 生命周期已测试；真实实例验收脚本待执行 |
| Web MVP | 0032–0038、0058、0060、0061 | Vue/Vite 已作为默认入口；原生 shell 保留历史验收证据 | 原生 shell 曾覆盖主要 API 和内容管理，Playwright 8 个核心路径本地通过；当前 `pnpm --filter @living-network/web dev` 启动 Vue/Vite，Vue Router/Pinia 视图已通过 `vue-tsc` 和 `vite build` |
| 本地基础设施与 CI | 0029、0031、0057 | 已完成 | Compose、CI 分层验收（PR 快速门禁 + main 真实服务）已落地 |


### M7A：创作者事件调度台（已实现）

- 新增双模式应用壳：玩家模式用于进入世界，创作模式用于事件调度、内容管理、视觉工作台和集成设置；`/admin`、`/settings` 保留兼容跳转。
- 新增候选扫描、只读影响预览、批量确认、状态追踪和幂等派发；扫描不会自动执行事项，也不会调用 LLM 或 ComfyUI。
- 候选规则覆盖逾期 `PENDING`、未来 7 天、`FAILED` 重试、超过 15 分钟的 `RUNNING`、启用的 `MANUAL` 事件，并排除 disabled、completed、cancelled 项。
- 新增四个创作者调度接口：候选扫描、影响预览、批量派发、批次状态查询。
- 新增持久化 dispatch request、attempts/last error、BullMQ job 幂等键和 Worker heartbeat；Redis 不可用时 request 保留为 `PENDING`。
- 内存模式支持扫描和预览，但禁用正式派发；持久模式正式派发需要 PostgreSQL、Redis 和 Worker。
- 本地契约、数据库、Worker、API 和 Web 检查已完成。2026-08-09 已在真实本地 Compose PostgreSQL + Redis + Worker 环境完成 `MANUAL` 候选 → preview → `PENDING_DISPATCH` → BullMQ → `COMPLETED` → 朋友圈 Moment，并清理验收数据；M7A 的真实 PostgreSQL/Redis 派发链已验收。真实 LLM、ComfyUI 仍未验收。

### M7B-M7F：后续顺序

1. M7B：内容生成质量，读取角色人设、世界观、关系、日程和记忆，使用结构化输出。
2. M7C：图文动态闭环，共用 MomentDraft，图片完成后发布，失败进入可重试状态。
3. M7D：世界反馈，按规则应用关系变化并记录审计；事件和互动写入可追溯记忆。
4. M7E：玩家互动，补齐朋友圈点赞、评论、角色回复和实时刷新，使互动可继续触发事件。
5. M7F：产品化验收，完善 Vue Playwright、CI、真实 PostgreSQL/Redis 扩展回归，以及真实 LLM、ComfyUI 验收，再评估 Tauri、备份恢复和发布。
## 当前执行顺序

### M6：产品化基础（进行中）

- 0056：进度台账与开发运行手册（已完成）
- 0057：CI 真实服务验收升级（已完成）
- 0058：内容管理与角色/世界/关系/基础事件编辑器（已完成）
- 0059：真实 LLM 联调与验收（脚本已完成，待真实配置）
- 0060：Web 前端 Vue/Vite 迁移启动（已完成，`pnpm --filter @living-network/web dev` 默认启动 Vite）
- 0061：浏览器 E2E 验收（本地 8/8 通过，待接入 CI 门禁）
- 0062：真实 ComfyUI 图片链路验收（HTTP/WebSocket 与终态同步已完成，待真实实例）

验收：进度文档与 README/RELEASE 口径一致；CI 具备 PostgreSQL/Redis 服务验证或明确分层；基础内容可在运行时创建与修改；至少一条真实 LLM 联调链路通过验收；前端完成 Vue/Vite 迁移并可独立启动；核心路径有 Playwright E2E 自动覆盖；真实 ComfyUI 图片生成链路可重复验收。

### M1：本地可运行 MVP（实现与原生 Web 浏览器验收已落地）

- 0039：进度台账与开发运行手册
- 0040：API 可执行启动入口
- 0041：开发 Seed 数据
- 0042：Web/API 联调、CORS 或同源代理

验收：`apps/api/src/main.ts` 和静态 Web 启动入口已落地；Playwright 已自动拉起开发 API 与静态 Web，世界、角色、动态、聊天、关系和内容管理路径已在本地 Chromium 验收通过。

### M2：真实 PostgreSQL（适配器已落地，M7A 持久派发链已验收）

- 0043：真实 PostgreSQL Driver Adapter
- 0044：Migration Runner
- 0045：PostgreSQL Seed 与真实集成测试

验收：真实 PostgreSQL 迁移、Seed、持久化 API、CORS 和重启读取路径已具备脚本；2026-08-09 的 M7A 验收已覆盖持久化 API 与派发所需 PostgreSQL 链路，其他数据库集成场景仍按各任务边界单独回归。

### M3：Worker、队列与图片（Redis 派发链已验收，真实图片服务待验收）

- 0046：Worker 可执行入口
- 0047：Redis/BullMQ Adapter
- 0048：Outbox 一致性
- 0049：ComfyUI 进度、媒体存储与失败恢复

验收：持久化 Worker、BullMQ、Outbox 和 Redis/ComfyUI 路径已有运行入口与测试；2026-08-09 的 M7A 验收已覆盖真实本地 Redis、BullMQ 和 Worker 派发链，真实 ComfyUI 与图片生成链仍待单独验收。

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
- 2026-08-09 已在真实本地 Compose PostgreSQL + Redis + Worker 环境完成 M7A 派发链验收，并清理验收数据；该结果不等同于所有 PostgreSQL/Redis 集成场景均已验收。
- 真实 LLM 和真实 ComfyUI 尚未在当前环境执行；ComfyUI WebSocket 进度适配器已由本地 Fake WebSocket 测试覆盖。
- 当前所有 M6 代码和文档仍在未提交工作区；最新 Git 提交仍为 `7c9b06f test: add full module coverage`。

发布候选启动、回滚和浏览器清单见 [RELEASE.md](./RELEASE.md)。

## 统一完成标准

每个任务都必须有明确范围、独立测试、退出码为 0 的验证命令、更新后的运行文档，并且不能依赖隐式内存存储。涉及数据库迁移、事务一致性或身份权限的任务，需要在实现前做单独的高风险审查。

## 暂缓事项

Vue/Vite 迁移、Fastify 替换、Drizzle、pgvector、微服务拆分、Tauri、复杂 RBAC 和完整 OpenTelemetry 不作为 M1–M4 的前置条件。

### 交互可观测性与自动回复（已实现）

- 新增 0017_interaction_logs、7 天清理、稳定游标、脱敏和 500 字符预览。
- 新增 API/AI/Worker 全链路 correlation 日志、历史查询与实时 SSE。
- USER → AI 私聊文本自动回复、确定性幂等、失败保留与显式重试已完成。
- 创作中心交互日志页和模型档案“测试连接”已完成。
- 2026-08-09 验收：pnpm typecheck、370 项本地回归（362 passed、8 skipped）、整仓 build、Playwright 11/11 通过；Compose 保留数据卷重建健康，迁移 0017 与真实 PostgreSQL/SSE 日志链已验证。
- 自动验收未调用真实 LLM 或 ComfyUI；真实模型只允许用户主动点击“测试连接”。