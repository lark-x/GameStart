# V1 基线修复与正式退役计划

状态：V1 已冻结，V2 已完成正式运行时切换验收（2026-08-13）

本文记录 V1 的边界修复、冻结、切换和后续物理删除，不重新设计 V2。V2 事实以 ADR-0006、[common-baseline.md](../v2/common-baseline.md)、[ai-parallel-master-plan.md](../v2/ai-parallel-master-plan.md) 和 [execution-entry.md](../v2/execution-entry.md) 为准。

## 1. 已接受的切换决策

- V2 使用 Fastify + Node `node:sqlite` + FTS5；SQLite 是唯一业务事实来源。
- Redis 只承担 BullMQ 队列及可重建运行状态；LLM、ComfyUI、Qdrant 是可选外部能力。
- V1 不迁移到 V2、不双写、不兼容旧 API；V1 代码和数据冻结，物理删除另行审批。
- 默认 Web/API/Worker/CI 只走 V2；旧 Web 路由重定向到 `/v2`。
- V1 归档分支已创建：`archive/v1-final`，基线 SHA `96130c5e37e83fddfe3e2c252a46c3ca0d17a340`。
- 本次切换不删除 V1 PostgreSQL/Redis 数据、不修改 V1 历史 migration 的已发布语义。

## 2. 当前实施状态

| 阶段 | 状态 | 证据/说明 |
| --- | --- | --- |
| Gate 0 与三 AI 分支 | 已完成 | 已合入 `codex/v2-integration` |
| V2 Core/SQLite/FTS5 | 已完成 | Canon、Graph、Typed State、Candidate、Release、Runtime/Save/Export |
| V2 Generation/Assets/Worker | 已完成 | Job、SQLite dispatch、BullMQ adapter、有限重试、媒体落盘 |
| V2 Web 默认入口 | 已完成 | `/v2` 默认、HTTP adapter、旧入口重定向、受控媒体 URL |
| V2 Compose/Nginx/CI | 已完成 | SQLite + Redis + API/Worker/Web；CI 仅 V2 |
| 本地覆盖率门槛 | 已完成 | 148 个 coverage tests，生产 V2 行覆盖率 100%，门槛未降低 |
| 真实 Redis | 已完成 | 显式 Redis round-trip lane exit 0，6/6 通过；CI 同样保留真实服务 job |
| 真实 LLM/ComfyUI/Qdrant | 未验收 | 默认未配置，不阻断 Core |
| V1 物理删除 | 后续独立任务 | 删除前需完成引用清零、备份/保留策略和维护者批准 |

## 3. V1 退役执行顺序

1. 固定并记录 V1 最终 SHA，创建归档分支（已完成）。
2. 停止 V1 API/Worker/迁移/Seed 的默认启动路径，停止旧 CI 回归（已完成；V1 文件仍保留）。
3. 切换 Web 默认入口到 `/v2`，旧入口只做显式退役重定向（已完成）。
4. 以 V2 SQLite/Redis/Worker/Compose 运行和验收；禁止长期双写（已完成）。
5. 归档 V1 数据和运行手册，确认保留期、备份和访问权限（本次不代替运维数据处理）。
6. 在独立删除任务中全仓清点 V1 runtime 引用，删除代码和旧适配器；历史 migration、归档分支和必要的审计文档保留。

## 4. 已废止的 T1/T2/T3 任务

原文中的 T1（修订未发布的 V1 `0023`）、T2（V1 CI job/证据绑定）和 T3（V1 工具链统一）不再是本次 V2 切换的前置任务：V1 已被冻结，V2 不依赖 PostgreSQL migration。不得新增 `0025`、不得修改已发布 `0020`，也不得以这些任务为理由把 PostgreSQL 带回 V2。

若未来仍需维护 V1 归档分支，应在该归档分支上独立执行并验证对应 migration 任务；它不应回流到 V2 集成线。

## 5. 数据与回滚边界

本次没有执行任何 V1 数据删除、PostgreSQL down migration 或 Redis 清理。V2 回滚使用上一个已验收 V2 commit 和 SQLite/媒体备份；需要恢复 V1 时检出 `archive/v1-final` 并使用未删除的 V1 数据。任何物理清理必须先明确目标实例、备份验证、保留期和恢复演练。

## 6. 验收报告规则

交付必须区分：已执行且 exit 0、已执行但失败、跳过、因真实服务不可用而无法执行。Fake/内存/SQLite 通过不能声称真实 Redis、LLM、ComfyUI 或 Qdrant 已验收。
