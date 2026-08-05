# Living Network 开发进度

最后更新：2026-08-05

这份文件是当前实现状态的唯一进度视图。`docs/tasks/` 保存任务契约和设计决策，不单独代表任务已经可以在真实运行环境中使用。

## 当前阶段

项目已经完成领域模型、API application、内存/SQL 仓储边界、事件/图片/动态 MVP 链路和 Web MVP 界面。0039–0055 的运行链补强已落地，当前进入发布候选验收。

## 已完成的能力边界

| 能力 | 任务 | 状态 | 证据 |
| --- | --- | --- | --- |
| 领域模型与状态机 | 0001–0003、0010、0015、0017、0019、0020–0023 | 已完成 | `packages/domain/src/` 与对应测试 |
| API application 与 SSE | 0004、0009、0011、0014、0021、0024、0027、0028、0035–0037 | 已完成 | `apps/api/src/` 与 API 测试 |
| 内存/SQL 仓储与迁移 | 0005–0007、0012、0016 | 适配器完成 | SQL client 仍需真实 PostgreSQL 驱动和运行入口 |
| 事件、行为与动态 | 0018–0021、0025–0026、0030 | MVP 闭环完成 | `apps/worker/src/` 与 `integration/mvp-flow.test.ts` |
| LLM Provider | 0013 | Provider 完成 | 普通完成和 SSE 已测试，尚无完整对话编排 |
| ComfyUI 与图片任务 | 0022–0025、0027、0037 | 适配器完成 | Fake 与 HTTP client 已测试，尚无常驻任务运行器和媒体存储 |
| Web MVP | 0032–0038 | 界面完成 | 原生浏览器 shell 已覆盖主要 API |
| 本地基础设施与 CI | 0029、0031 | 配置完成 | Compose 和 CI 配置存在，真实服务集成尚未验证 |

## 当前执行顺序

### M1：本地可运行 MVP（已完成）

- 0039：进度台账与开发运行手册
- 0040：API 可执行启动入口
- 0041：开发 Seed 数据
- 0042：Web/API 联调、CORS 或同源代理

验收：`apps/api/src/main.ts` 和静态 Web 已启动；浏览器已验证世界、聊天、关系和设置页面，浏览器控制台无 error/warning。

### M2：真实 PostgreSQL（已完成）

- 0043：真实 PostgreSQL Driver Adapter
- 0044：Migration Runner
- 0045：PostgreSQL Seed 与真实集成测试

验收：真实 PostgreSQL 已执行 0010 migrations 和 Seed；持久化 API 的 `/health`、`/ready`、世界查询、CORS、request ID 均通过；重启后 Seed 数据可读。

### M3：Worker、队列与图片（已完成）

- 0046：Worker 可执行入口
- 0047：Redis/BullMQ Adapter
- 0048：Outbox 一致性
- 0049：ComfyUI 进度、媒体存储与失败恢复

验收：持久化 Worker 可启动；BullMQ 真实 Redis 入列/消费通过；Outbox 在 PostgreSQL 事务中写入后发布到 Redis，幂等发布后 pending 为 0；本地媒体存储、图片下载校验和 ComfyUI NOT_READY 重试已覆盖。

### M4：对话、记忆与主动行为（已完成）

- 0050：Conversation Orchestrator 和 AI 回复持久化
- 0051：记忆检索、Prompt 注入和异步写入
- 0052：主动消息、图片意图和人工审核

验收：SSE 生成完成后 AI Message 幂等持久化；记忆检索按可见性注入 Prompt，LLM 派生记忆带低置信度和来源；主动消息协调器支持结构化图片意图。

### M5：安全与发布（已完成）

- 0053：可信 Actor Context 和认证边界
- 0054：日志、健康检查、就绪检查和运行摘要
- 0055：浏览器 E2E、Compose 验收和发布候选版本

验收：可信 Actor 模式拒绝缺失/错配身份；`/ready` 区分依赖不可用；HTTP 响应带 request ID；动态人工审核开关生效；真实浏览器冒烟和静态 Web 联调通过。

## 验证记录

- 全仓库直接 Node 测试：`196 passed / 1 skipped`，退出码 `0`；跳过项是未设置 `RUN_REAL_INTEGRATION=1` 的真实服务测试。
- 全仓库直接 TypeScript 检查：API、Worker、AI、Config、Contracts、Database、Domain 均退出码 `0`。
- 真实服务测试：`RUN_REAL_INTEGRATION=1 node --test integration/real-services.test.ts`，`1 passed`；覆盖 PostgreSQL migration 幂等、事务 Outbox、Redis BullMQ 入列/消费和发布状态。
- 浏览器：Web `4173` + API `3000` 已验证世界加载、聊天会话、关系网、Workflow/视觉设置；控制台 error/warning 数为 0。

发布候选启动、回滚和浏览器清单见 [RELEASE.md](./RELEASE.md)。

## 统一完成标准

每个任务都必须有明确范围、独立测试、退出码为 0 的验证命令、更新后的运行文档，并且不能依赖隐式内存存储。涉及数据库迁移、事务一致性或身份权限的任务，需要在实现前做单独的高风险审查。

## 暂缓事项

Vue/Vite 迁移、Fastify 替换、Drizzle、pgvector、微服务拆分、Tauri、复杂 RBAC 和完整 OpenTelemetry 不作为 M1–M4 的前置条件。
