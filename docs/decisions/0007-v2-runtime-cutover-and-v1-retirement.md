# ADR-0007：V2 正式运行时切换与 V1 退役

- 状态：已接受
- 日期：2026-08-13
- 前置决策：[ADR-0006](./0006-v2-local-creator-game-platform.md)
- 替代范围：V2 默认运行时、CI、Compose、Web 入口和当前发布验收

## 决策

Living Network 现在正式切换到 ADR-0006 定义的 V2 运行时：

- Fastify V2 API、Vue/Vite Web、V2 Worker 和 `/api/v2` 成为默认启动与验收路径。
- SQLite + FTS5 成为唯一业务事实来源；Redis 仅保存可重建的 BullMQ 队列和派发状态。
- V2 Compose 只运行 API、Worker、Redis、Web，并使用 SQLite、媒体和 Redis 卷。
- 默认 CI 只验证 V2；真实 Redis 集成单独运行，LLM、ComfyUI 和 Qdrant 仍需显式验收。
- Web 根入口和旧 V1 页面路径重定向到 `/v2`；旧 `/v1` API 不再是兼容目标。
- V1 PostgreSQL、旧 `node:http` API、旧 Worker、历史 migration 和旧数据不迁移、不双写、不删除，冻结在当前工作树及 `archive/v1-final` 归档分支中。

## 原因

V2 的产品事实模型、领域边界和本地部署方式已经与 V1 不同。继续让 V1 进入默认启动或 CI 会造成两套事实来源、两套接口语义和错误的完成信号。保留 V1 数据和历史 migration 可以支持审计与后续独立删除，但不应阻碍 V2 的本地核心闭环。

## 影响

- 当前开发、测试、发布文档和脚本必须描述 V2 命令；V1 说明只能明确标记为冻结、归档或历史。
- V2 API 启动负责顺序执行 up migration；服务不自动执行 down migration。Worker 在 schema 未就绪时失败并等待 API readiness。
- 物理删除 V1 代码、数据库适配器或数据实例是另一个任务，必须先完成备份、保留期、引用清零和恢复演练审查。
- ADR-0001 的模块化单体、ADR-0004 的依赖方向和 ADR-0005 的外部信任边界继续适用于 V2；ADR-0002 的 `node:http` 和 ADR-0003 的 PostgreSQL 事实库仅保留给归档的 V1 维护线。任何历史 ADR 文件都不回写。
