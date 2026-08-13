# Living Network 开发进度

最后核对：2026-08-13（`codex/v2-integration`）

本文是当前能力、切换状态和验证证据的进度视图。当前架构见 [architecture.md](./architecture.md)，历史 V1 报告不替代当前代码和测试证据。

## 1. 当前阶段

V2 已完成 Core/Generation/Assets/Web 集成并完成正式运行时切换验收：V2 是默认 API、Worker、Web、Compose 和 CI 路径；V1 已冻结并归档。当前不删除 V1 数据或历史 migration，物理删除另行审批。

## 2. 当前能力矩阵

| 能力 | 状态 | 当前证据与边界 |
| --- | --- | --- |
| World Canon | 已实现 | SQLite、revision/idempotency、世界/地点/角色/事实/规则/时间线与 FTS5 |
| Narrative Graph | 已实现 | Arc/Scene/Choice、入口/可达性/引用校验和图诊断 |
| Typed State | 已实现 | 类型化 schema、初始状态、delta preview、gate/consequence 校验 |
| Candidate Review | 已实现 | 场景/资产候选、approve/reject/request changes、审计和原子应用 |
| Immutable Release | 已实现 | preflight、稳定 content hash、release manifest 与导出 |
| Play Runtime/Save | 已实现 | Release 绑定运行、选择、条件、保存、恢复和版本校验 |
| Generation/Assets API | 已实现 | Job、上下文快照、资产 Job、受控媒体引用和能力 503 |
| V2 Worker | 已实现 | SQLite outbox 派发、BullMQ、有限重试、租约恢复、候选提交和本地媒体 |
| Web `/v2` | 已实现 | HTTP 默认 adapter、显式 Mock、创作/审核/发布/游玩/导出工作区、旧路由重定向 |
| V1 运行时 | 已冻结 | 归档分支保留；不再作为默认入口、CI 或新功能依赖 |
| LLM/ComfyUI/Qdrant | 可选未验收 | 关闭时 Core 编辑/发布/游玩可用；真实服务需显式配置并单独验收 |

## 3. 已执行验证

最终本地已执行并通过：

- `pnpm install --frozen-lockfile`：exit 0。
- `pnpm check:boundaries`：exit 0。
- `pnpm typecheck`：exit 0。
- `pnpm test`：exit 0，所有 V2 workspace tests 通过。
- `pnpm test:coverage`：exit 0；148 个测试通过，V2 生产文件行覆盖率 100%，门槛保持 100%。
- `pnpm build`：exit 0。
- `pnpm --filter @living-network/web lint`：exit 0。
- `pnpm test:integration`：exit 0；默认 lane 的 5 个 Compose/SQLite 检查通过，未启用真实 Redis 时 1 项跳过。
- `RUN_V2_REAL_INTEGRATION=1 REDIS_URL=redis://127.0.0.1:6379 pnpm test:integration`：exit 0，6/6 通过。
- `pnpm test:e2e`：exit 0，2/2 V2 Playwright 场景通过，覆盖旧入口重定向、Mock/HTTP 闭环、Save/Restore/Export 和 360px 布局。
- `pnpm test:local`：exit 0，157 项通过、1 项真实 Redis 测试在未启用环境下跳过。
- `git diff --check`：exit 0。

真实 LLM、ComfyUI、Qdrant 和生产级认证/TLS/备份恢复未配置或未执行，不能据此声称已验收；CI 已提供真实 Redis job。

## 4. 当前限制

- Slice D 的 Qdrant 和 Social Temp 按主计划延期，不阻塞 Slice A–C 核心版本。
- 真实 LLM、ComfyUI、Qdrant 和生产级认证/TLS/备份恢复尚未验收。
- Worker 的真实 Redis round-trip 已在本地显式 lane 通过；Fake/SQLite 测试仍不能替代真实 LLM、ComfyUI 或 Qdrant 证据。
- V1 代码、PostgreSQL 迁移和旧文档仍存在于仓库历史/工作树，后续必须以独立删除任务清理，不能在本切换中误删或误改数据。

## 5. 后续优先顺序

1. 真实 LLM/ComfyUI 与备份恢复验收。
2. Slice D：可重建 Qdrant 索引和 Social Temp。
3. 物理删除 V1 运行时、PostgreSQL 适配与旧入口（另行批准，保留归档和历史 migration）。
4. 产品化安全、认证、监控和发布流程。
