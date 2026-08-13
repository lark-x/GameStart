# Living Network V2 执行入口说明

状态：V2 正式切换已完成（2026-08-13，`codex/v2-integration`）

适用范围：所有 V2 replacement、集成、验收和后续维护任务。

## 1. 权威阅读顺序

1. 根目录 [AGENTS.md](../../AGENTS.md)
2. [ADR-0006](../decisions/0006-v2-local-creator-game-platform.md)
3. [common-baseline.md](./common-baseline.md)
4. [ai-parallel-master-plan.md](./ai-parallel-master-plan.md) 中与任务相关的章节
5. 修改 Web 时加读 [frontend-development-standard.md](../frontend-development-standard.md)
6. V1 退役边界读 [v1-retirement-and-baseline-repair.md](../plans/v1-retirement-and-baseline-repair.md)

`three-ai-execution-plan.md` 已被主计划替代，不得用于重新分支分配。

## 2. 当前正式边界

- API：Fastify，路径 `/api/v2`。
- 业务事实：SQLite + FTS5。
- 队列：Redis/BullMQ，仅保存可重建状态。
- Web：`/v2` 为默认产品入口；旧入口重定向。
- Worker：V2 dispatch、scene/asset consumers、有限重试、租约恢复和候选提交。
- 外部能力：LLM、ComfyUI、Qdrant 默认可关闭；关闭不影响 Core 编辑、发布和已发布游玩。

## 3. 已完成的 V2 核心闭环

Canon → Narrative Graph → Typed State → Candidate Review → Immutable Release → Play Runtime/Save/Export 已有 SQLite 仓储、Fastify API、Web adapter 和行为测试。Generation/Assets 任务只能通过 Job/Candidate 进入审核边界，媒体 URL 只能引用受控本地哈希路径。

## 4. V1 关系

V1 已冻结，不迁移、不双写、不作为 CI 或默认运行时。归档分支：`archive/v1-final`，SHA `96130c5e37e83fddfe3e2c252a46c3ca0d17a340`。本切换没有删除 V1 PostgreSQL/Redis 数据、代码或历史 migration；后续物理删除必须是独立任务。

外部《GameStart_V2完全替代Legacy整改与迁移方案》已废止，尤其不得把 PostgreSQL 事实库、V1 数据迁移、旧 API 兼容或 shadow read 带回 V2。

## 5. 验收入口

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

真实 Redis、LLM、ComfyUI、Qdrant 必须单独报告。未运行不得写成“已验收”。

本次切换的本地证据：V2 coverage 148 tests/100% production line，显式真实 Redis round-trip 6/6，Playwright 2/2；真实 LLM、ComfyUI、Qdrant 未执行。
