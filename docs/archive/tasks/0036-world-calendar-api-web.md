# Task 0036 — 世界日历 API 与 Web 视图

## 目标

把生日、现实节日、世界节日和剧情事件的定义/排期从 Worker 仓储暴露到 API，并在 Web 中按月份展示。

## 交付内容

- `ScheduledOccurrenceRepository.listByWindow`：半开区间 `[startsAt, endsAt)`，覆盖所有状态并限制结果数量。
- `WorldCalendarDto` 与 JSON Schema。
- `GET /v1/worlds/:id/calendar?startsAt=&endsAt=&limit=`：返回事件定义和时间窗口内 occurrence。
- Web 日历标签页：月份选择、世界时区显示、排期状态时间线和事件定义卡片。
- 内存/SQL 仓储、contracts、API 和 Web 测试。

## 明确未包含

- 日历事件编辑、手动触发 API、拖拽排期和重复规则编辑器。
- Web 月份窗口当前按 UTC 月份查询，再按世界时区展示；严格世界本地月边界转换留给后续日历适配器。
- 外部节假日数据源和真实 BullMQ 队列。

## 验证

- `node --test packages/database/src/events.test.ts packages/database/src/sql.test.ts apps/api/src/calendar.test.ts apps/web/web-shell.test.ts`
- 仓库全量 Node 测试与全部严格 TypeScript 检查。
