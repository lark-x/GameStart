# Task 0019 — 角色日程、执行审计与主动消息预算

## 目标

把定时 occurrence 从“可调度记录”推进到“可审计的执行启动边界”，但仍不调用 LLM、ComfyUI 或 Redis。执行协调器读取角色计划和主动消息预算，决定启动、取消或失败，并保留可重放的输入快照。

## 交付内容

- `CharacterPlan`：角色、故事世界、UTC 时间段、IANA 时区、地点、活动和可打断性。
- `EventExecution`：occurrence/definition 链接、目标角色、attempt、规则版本、JSON 输入快照、执行状态、输出快照和失败原因。
- `ProactiveMessageBudget`：角色在 UTC 窗口内的主动消息上限与已消耗数量。
- 领域校验：半开时间区间、跨世界引用、JSON 快照、执行终态字段和预算边界。
- contracts DTO/Schema，数据库 migration `0005_life_simulation.sql`，内存/SQL 仓储。
- `EventExecutionCoordinator`：
  - `PENDING/FAILED → ENQUEUED → RUNNING`；
  - 计划为 `BLOCKED` 或预算不足时生成取消审计；
  - 正常启动时扣除预算并返回 `RUNNING`；
  - 重复调用复用已有 RUNNING/终态执行记录，不重复扣预算；
  - 持久化预算异常时生成 `FAILED` 执行和 occurrence。

## 明确未包含

- 行为规划器、EventExecution 完成后的 LLM 输出、聊天消息/动态发布、ComfyUI 图片任务。
- Redis/BullMQ 事务、数据库锁和跨记录原子事务；当前协调器的多预算更新仍需后续事务适配器加强。
- 真实 PostgreSQL 服务验证；当前环境没有可用数据库连接。

## 验证

- Domain/Contracts 测试覆盖计划区间、执行快照/终态和预算消费。
- Database 测试覆盖 migration、内存仓储、SQL 参数化映射和 attempt 查询。
- Worker 测试覆盖正常启动、重放幂等、计划阻断、预算耗尽和缺少仓储错误。
- 全量 Node 测试与严格 TypeScript 检查必须通过。

## 回滚

删除 `life-simulation.ts`、对应测试、contracts life-simulation DTO/schema、database migration `0005` 及仓储扩展、Worker executor 和本任务文档；恢复 Task 0018 的仓储接口与 Worker 入口即可。
