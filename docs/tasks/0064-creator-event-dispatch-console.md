# 0064 创作者事件调度台（M7A）

## 目标

在同一个 `StoryWorld` 数据之上提供双模式应用壳：玩家进入世界进行聊天、朋友圈、关系、日程和相册体验；创作者进入创作中心管理事件调度、内容、视觉工作台和集成配置。M7A 的核心闭环是“创作者触发事件 → Worker 消费 → 角色产生行动 → 玩家端看到结果”。

本任务记录已实现并完成真实本地基础设施验收的 M7A 调度闭环。2026-08-09 已在本地 Compose PostgreSQL + Redis + Worker 环境完成 `MANUAL` 候选 → preview → `PENDING_DISPATCH` → BullMQ → `COMPLETED` → 朋友圈 Moment 的完整链路，并清理验收数据。该证据仅覆盖 M7A 的真实 PostgreSQL/Redis 派发链，不代表真实 LLM 或 ComfyUI 已验收。

## 双模式与路由

- 玩家模式：聊天、朋友圈、关系、日程、相册。
- 创作模式：事件调度台、内容管理、视觉工作台、集成设置。
- 应用壳提供“进入世界 / 创作中心”模式切换。
- `/creator/dispatch` 是创作者事件调度台入口。
- `/admin`、`/settings` 保留兼容跳转，旧链接不会失效。
- 进入创作中心或切换当前世界时执行候选扫描；也支持手动刷新。
- 扫描和预览是只读操作，不自动执行事项，不调用 LLM 或 ComfyUI。

## 候选规则

扫描按故事世界时区执行，默认查看未来 7 天：

- 已到期且仍为 `PENDING` 的事项：`待补执行`。
- 未来 7 天内的事件：`即将发生`，允许独立试演。
- `FAILED` occurrence：`可重试`，沿用 occurrence 并增加 execution attempt。
- `RUNNING` 超过 15 分钟：`疑似卡住`，首版仅查看详情。
- 已启用的 `MANUAL` 事件：`可手动触发`。
- 排除 disabled、completed 和 cancelled 项。
- 一次性事件检查全部未完成历史；年度事件只检查当前年度，避免补跑往年事件。

## 派发动作

- `EXECUTE_EXISTING`：执行已有的逾期 occurrence。
- `RETRY_FAILED`：重试失败 occurrence，增加 execution attempt。
- `RUN_TRIAL`：创建独立的 creator-triggered occurrence；正式排期保持不变。

支持多选、统一确认和批次状态追踪。确认时重新校验所选项目；状态发生变化时整批返回冲突，不产生部分提交。批次和单项均使用幂等键，重复点击不会产生重复任务。预览展示角色、接收者、消息/动态/图片输出摘要，以及缺失会话、预算不足、工作流未配置等风险，但不会提前生成实际输出。

## HTTP 接口

- `GET /v1/creator/worlds/:worldId/event-candidates?horizonDays=7`
- `POST /v1/creator/worlds/:worldId/event-dispatches/preview`
- `POST /v1/creator/worlds/:worldId/event-dispatches`
- `GET /v1/creator/event-dispatches/:batchId`

共享契约包含 `CreatorEventCandidateDto`、`EventDispatchPreviewDto`、`EventDispatchBatchDto`，以及批次和单项的 `PENDING_DISPATCH`、`DISPATCHED`、`RUNNING`、`COMPLETED`、`FAILED`、`CANCELLED` 状态；批次项可记录 `occurrenceId`、`executionId`、`outputSnapshot` 和 `failureReason`。

## Dispatch request 与 Worker

- 持久模式在创建批次时持久化 execution dispatch request；试演 occurrence 与派发请求在同一事务边界内创建。
- Worker 每轮扫描未派发 request，并将其写入现有 `living-network-occurrences` BullMQ 队列。
- BullMQ job ID 使用 dispatch request ID；业务幂等由 occurrence、execution 和 idempotency key 共同保证。
- Redis 入队失败时 request 保留为 `PENDING`，记录 attempts 和 last error，等待后续扫描重试。
- Worker 写入 heartbeat 和停止状态；创作中心可据此显示运行正常、未启动或心跳过期。
- 首版对超过 15 分钟的 `RUNNING` 项只提供详情查看，不提供强制重试。

内存开发模式支持候选扫描和影响预览，但禁用正式派发，并明确提示需要 PostgreSQL、Redis 和 Worker。持久模式派发仍需显式启动 API、Worker 及对应基础设施。

## 验收命令

已覆盖的本地验证：

```sh
pnpm --filter @living-network/contracts typecheck
pnpm --filter @living-network/database typecheck
pnpm --filter @living-network/database test
pnpm --filter @living-network/worker typecheck
pnpm --filter @living-network/worker test -- dispatch-pump.test.ts
pnpm --filter @living-network/api test -- creator-events.test.ts creator-dispatch-api.test.ts
pnpm --filter @living-network/web typecheck
pnpm --filter @living-network/web build
pnpm --filter @living-network/web test
```

上述命令验证本地契约、数据库仓储、Worker 派发泵、API 调度接口和 Web 调度台。除此之外，2026-08-09 已使用真实本地 Compose PostgreSQL、Redis 和 Worker 完成 `MANUAL` 候选 → preview → `PENDING_DISPATCH` → BullMQ → `COMPLETED` → 朋友圈 Moment 的 M7A 验收，并在结束后清理验收数据。真实 LLM 和真实 ComfyUI 仍未验收；不得将本地 Fake、内存仓储或适配器测试记为这两类真实服务验收。