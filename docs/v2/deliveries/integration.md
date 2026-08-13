# V2 Integration Delivery

状态：V2 Core/Generation/Assets/Web 已集成并完成本地最终验收（2026-08-13）

分支：`codex/v2-integration`

## 已集成来源

- Bootstrap：`d1c00469b66b39d14417a0a6b36815a947a5ecc5`
- AI-1 Core：`fc86bea96028daec103b8669a9d5624223215c44`
- AI-2 Generation/Assets：`f2cd7e609cabedd61fc5289b193c7247f35dac79`
- AI-3 Web：`1e9a0dae684b29a64ae70cc6d7e81fad6f49b085`

三个业务分支均以已验收 Bootstrap 为共同基线，并按 Core → Generation/Assets → Web 顺序集成。本分支后续补充了运行时装配、迁移注册、Worker、Compose、CI、媒体访问和完整离线闭环测试。

## 当前运行时

- Fastify V2 API：`pnpm --filter @living-network/api dev:v2`
- SQLite + FTS5：唯一业务事实来源；API 执行 up migration，Worker 只检查 schema
- BullMQ/Redis：只保存可重建队列和派发运行状态
- V2 Worker：`pnpm --filter @living-network/worker start:v2`
- Vue/Vite Web：`pnpm --filter @living-network/web dev`，默认入口 `/v2`
- 场景生成、资产生成、LLM、ComfyUI 默认关闭，启用后仍经过 Job/Candidate/Review 边界

## 已完成的集成修复

- 将 Core 与 Generation/Asset migration 注册到一个确定性 V2 registry，并保证 migration 与 registry 记录在同一事务中。
- API runtime 使用同一 SQLite 连接组装 Core、Generation、Asset 仓储和 `/api/v2` 路由。
- Canon snapshot、Candidate submission、revision/idempotency 和候选审核边界已接通。
- Release preflight 校验 Typed State gate/consequence 的 key/type，旧 Release 与 Save 保持版本绑定。
- Web HTTP adapter 已改为真实 V2 Core/Generation/Asset 路由；空工作区提供显式 Starter World；Mock 仅显式启用。
- Worker dispatch pump、场景/资产消费者、有限重试、租约恢复和本地受控媒体访问已接通。
- Compose 已切换到 `api`、`worker`、`redis`、`web` + SQLite/media/Redis volumes；CI 仅验证 V2。
- Playwright 使用隔离端口，覆盖旧路由重定向、Mock 闭环、空 SQLite HTTP 闭环和 360px 布局。

## 明确延期与证据边界

- Slice D 的 Qdrant 和 Social Temp 按主计划延期，不阻塞 V2 Core 版本。
- Fake/内存/SQLite 测试通过只证明离线核心路径，不等于真实 Redis、LLM、ComfyUI 或 Qdrant 已验收。
- 真实 Redis 必须通过显式 `RUN_V2_REAL_INTEGRATION=1` 单独运行；LLM、ComfyUI、Qdrant 未配置时报告未执行。
- V1 已冻结并从默认入口、CI 和 Compose 移除；V1 PostgreSQL、旧 API、旧 migration 和历史文档仍保留，物理删除是后续独立任务。

## 集成验收命令

```sh
pnpm install --frozen-lockfile
pnpm check:boundaries
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm --filter @living-network/web lint
pnpm test:integration
pnpm test:e2e
```

最终执行结果必须以本分支实际命令退出码为准，并逐项区分通过、失败、跳过和真实服务不可用。

本次最终本地证据：安装、边界、类型、workspace tests、coverage、build、Web lint、默认 integration、真实 Redis integration、Playwright 和 `git diff --check` 均 exit 0；coverage 为 148 tests/100% V2 production line，Playwright 为 2/2。真实 LLM、ComfyUI、Qdrant 未执行。
