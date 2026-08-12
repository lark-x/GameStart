# Living Network V2 三 AI 独立分支计划（已替代）

状态：已被审查后的主计划替代，不再作为执行依据。

替代文档：[V2 三 AI 并行开发主文档](./ai-parallel-master-plan.md)

旧版计划将 `apps/api`、`packages/database`、`packages/contracts` 和 `docs/v2` 同时分配给多个分支，并把接口裁决推迟到最终集成，无法保证低冲突合并和候选审核事务一致性。

后续分配任务时只使用 `ai-parallel-master-plan.md`。其中已经补充：

- Gate 0 最小骨架与 `V2_BOOTSTRAP_SHA`。
- 按命名空间隔离的 owner paths。
- Candidate Submission 与审核应用的唯一责任。
- SQLite migration 编号、根依赖和 composition root 所有权。
- Slice A-D 分阶段集成与可延期增强范围。
