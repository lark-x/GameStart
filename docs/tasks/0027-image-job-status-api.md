# Task 0027 — ImageJob 状态查询 API

## 目标

让客户端和未来 Web 界面能够查询图片任务的真实生命周期，而不是从 Feed 内容推断生成状态。

## 交付内容

- `GET /v1/image-jobs/:id` 返回共享 `ImageJobDto`，包括 `attempt`、状态、ComfyUI 外部 id、媒体引用和失败原因。
- 未找到任务返回 404；非 GET 方法返回 405；不引入新的存储或供应商依赖。
- API 测试覆盖成功读取、缺失任务和方法错误。

## 明确未包含

- 任务取消/重试 API、权限鉴权、实时 SSE/WebSocket 推送和批量查询。
- 任务控制权仍属于 Worker；客户端只能读取状态。

## 验证

- `node --test apps/api/src/jobs.test.ts`
- API 严格 TypeScript 检查。
- 阶段结束运行仓库全量 Node 测试和全部严格 `tsc` 项目。

## 回滚

删除 `GET /v1/image-jobs/:id` 路由、测试和本任务文档；不影响 Worker 状态机和数据库仓储。
