# Task 0018 — 事件持久化与 Worker 调度边界

## 目标

把 Task 0017 的事件定义和 occurrence 接入可替换的仓储端口，并提供一个不依赖 Redis/BullMQ 的 Worker 调度器。调度器只负责在 UTC 时间窗口内物化启用事件，执行行为和外部队列留给后续阶段。

## 交付内容

- `WorldEventDefinitionRepository`：按故事世界读取、按 ID 读取和保存事件定义。
- `ScheduledOccurrenceRepository`：按幂等 key 查询、查询到期 PENDING、幂等保存和状态更新。
- `InMemoryRepositories`：引用校验、防御性复制、重复 occurrence key 去重和到期排序。
- `SqlRepositories`：参数化 SQL、年度/一次性 recurrence 映射、occurrence 幂等写入和状态更新。
- PostgreSQL migration `0004_events.sql` 与可逆 down migration：
  - 事件定义的 recurrence 形状约束；
  - 目标角色必须属于同一故事世界；
  - occurrence 的 `(story_world_id, occurrence_key)` 唯一约束；
  - 到期查询索引。
- `apps/worker/src/scheduler.ts`：
  - 一次性事件按 `[from, to)` 窗口物化；
  - 年度事件按故事世界时区计算本地日期，再转换为 UTC；
  - 禁用事件跳过；
  - 重复调度返回已存在 occurrence，不覆盖已推进的状态。

## 明确未包含

- Redis、BullMQ、队列消费者、EventExecution、CharacterPlan、LLM/ComfyUI 调用。
- 真实 PostgreSQL/Redis 连接和端到端时区数据库验证；当前环境没有可用数据库服务。
- DST 重复/不存在本地时间的业务策略；当前转换器对普通时区偏移可用，后续日历适配器必须明确该策略。

## 验证

- database 测试覆盖内存仓储、SQL 参数化映射、幂等写入、到期查询、状态更新和 migration 文本约束。
- worker 测试覆盖 Asia/Shanghai 与 UTC 转换、年度/一次性窗口、禁用事件、重放幂等和仓储缺失错误。
- 使用 Node 内置测试运行器与缓存 TypeScript 编译器；不执行网络安装。

## 回滚

删除 `0004_events*`、database 事件仓储扩展、`apps/worker/src` 调度器及本任务文档；恢复 `apps/worker/package.json` 和 database/domain 相关接口到 Task 0017 状态即可。不会影响已有 0001–0003 migration。
