# Task 0017 — 定时生活事件领域与契约

## 目标

为生日、现实节日、世界节日、剧情节点、用户互动、关系事件和手动触发建立统一的事件边界，先完成可测试的领域模型与跨服务 DTO，不在本任务中引入队列、定时器或外部日历依赖。

## 交付内容

- `WorldEventDefinition`：事件身份、触发来源、故事世界时区、一次性/年度重复规则、目标角色、优先级、冷却和启用开关。
- `ScheduledOccurrence`：具体 UTC 执行时间、定义快照身份、幂等 occurrence key 和生命周期状态。
- 年度事件 key：`<definitionId>:<year>-<MM>-<DD>`，用于按年物化和去重。
- 生命周期：`PENDING → ENQUEUED → RUNNING → COMPLETED/FAILED`，失败可重新入队，未执行实例可取消。
- contracts 包中的 DTO 与 JSON Schema，供 API、Worker 和后续持久化复用。

## 关键约束

- 目标角色必须属于同一故事世界，且不能重复。
- 年度日期接受 2 月 29 日；具体非闰年是否跳过由后续调度器决定。
- 所有执行时间使用 ISO 时间戳；定义保留 IANA 时区，避免在领域层隐式处理 DST。
- 静态故事仍可保存禁用或一次性事件；是否启用由 `enabled` 控制，不把故事模式强行绑定到调度器。
- 本任务不修改正式业务 API，不改变已有对话、记忆或关系行为。

## 验证

- `packages/domain/src/event.test.ts` 覆盖生日年度 key、一次性禁用事件、日期/时区/世界归属校验、幂等实例和状态迁移。
- `packages/contracts/src/contracts.test.ts` 覆盖事件 DTO 对应的枚举、递归规则和闭合 Schema。
- 使用 Node 内置测试运行器与缓存 TypeScript 编译器执行，避免当前环境的网络安装依赖。

## 回滚

删除本任务新增的 `event.ts`、`event.test.ts`、契约事件定义/schema/test 变更及本任务文档即可；不涉及数据库迁移或运行时配置。
