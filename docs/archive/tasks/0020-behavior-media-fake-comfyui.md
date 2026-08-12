# Task 0020 — 结构化行为、动态草稿与 Fake ComfyUI

## 目标

建立从 `EventExecution` 到结构化行为、动态草稿和图片任务的最小可验证链路。生产 LLM、Redis/BullMQ 和真实 ComfyUI 仍通过端口替换，不在本任务中引入供应商依赖。

## 交付内容

- `BehaviorAction`：`NOOP`、`SEND_MESSAGE`、`CREATE_MOMENT`、`REQUEST_IMAGE`，带 payload、优先级和提议/接受/拒绝状态。
- `MomentDraft`：动态正文、作者、可见性、草稿/就绪/发布/拒绝状态，可关联图片任务。
- `ImageJob`：workflow 版本、prompt、seed、ComfyUI 外部任务 ID、媒体引用和队列生命周期。
- contracts DTO/Schema，数据库 migration `0006_behavior_media.sql` 与可逆 down migration。
- 内存/SQL 仓储：行动按执行查询，草稿/图片任务按 action 幂等查找。
- `BehaviorMediaCoordinator`：
  - 从执行记录创建结构化行动；
  - `CREATE_MOMENT` 自动创建动态草稿；
  - 图片意图自动创建图片任务；
  - Fake ComfyUI 提交/完成图片；
  - 图片成功后草稿推进到 READY，失败则 REJECTED；
  - 重放同一 action 不重复创建相关记录。

## 明确未包含

- 真实 LLM 行为规划、动态发布 API、评论/点赞、媒体缩略图和对象存储。
- 真实 ComfyUI WebSocket、Workflow JSON 校验和 BullMQ 消费者。
- 生产数据库端到端执行；当前环境没有可用 PostgreSQL 服务。

## 验证

- Domain 测试覆盖 action payload、目标角色、moment 状态和 image job 生命周期。
- Database 测试覆盖 migration、内存仓储、SQL 参数化映射和 action 幂等边界。
- Worker 测试覆盖行动重放、草稿创建、Fake ComfyUI 提交/完成、失败拒绝和缺少仓储错误。
- 全量 Node 测试与严格 TypeScript 检查必须通过。

## 回滚

删除 `behavior-media.ts`、对应 contracts/domain/database/Worker 文件及 migration `0006`，恢复 Task 0019 的仓储和 Worker 入口即可。
