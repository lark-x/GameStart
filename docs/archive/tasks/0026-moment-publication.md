# Task 0026 — READY 草稿到动态发布

## 目标

把图片/正文完成后的 `MomentDraft` 显式发布为可见 Feed 中的 `Moment`，并保留人工审核和安全重放边界。

## 交付内容

- `MomentPublicationCoordinator.publish`：
  - 只接受 `READY` 草稿；
  - 若草稿关联图片任务，必须确认任务为 `SUCCEEDED` 且有媒体引用；
  - 校验 audience 角色属于同一故事世界；
  - 创建 `Moment` 并把草稿转为 `PUBLISHED`；
  - 使用调用方提供的稳定 moment id 支持幂等重放。
- Worker 测试覆盖公开/群组 audience、图片媒体引用、重复发布和失败图片保护。

## 明确未包含

- 自动发布策略、人工审核 API、通知、撤回/编辑和互动计数。
- PostgreSQL 事务/锁：当前协调器先保存 Moment 再保存草稿状态；生产适配器需要把两步放入同一事务或 Outbox。
- 真实对象存储、CDN、缩略图和媒体内容扫描。

## 验证

- `node --test apps/worker/src/publication.test.ts`
- Worker 严格 TypeScript 检查。
- 阶段结束运行仓库全量 Node 测试和全部严格 `tsc` 项目。

## 回滚

删除 `apps/worker/src/publication.ts`、测试、导出和本任务文档；保留 Task 0025 的图片任务只到 `READY`，不改变已有 Feed 数据模型。
