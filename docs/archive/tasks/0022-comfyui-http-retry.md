# Task 0022 — ComfyUI HTTP 适配与图片任务重试

## 目标

为图片生成边界提供可替换的 ComfyUI HTTP 客户端，并让 `ImageJob` 的失败、重试和永久失败状态可持久化、可审计。

## 交付内容

- `COMFYUI_BASE_URL` 与 `COMFYUI_TIMEOUT_MS` 配置，配置摘要只暴露非敏感连接信息。
- `ComfyUiHttpClient`：
  - `POST /prompt` 提交 workflow，携带 `client_id` 和 Living Network 任务元数据；
  - `GET /history/:promptId` 读取第一张输出图片，并构造 `/view` 媒体引用；
  - 将超时、网络错误、HTTP 错误、无效响应和未完成结果归一为带 `retryable` 标记的 `ComfyUiError`。
- `ImageJob.attempt`：从 1 开始，失败后通过领域函数重排为 `QUEUED`，默认最多 3 次尝试；达到上限后保持 `FAILED`。
- `0006_behavior_media` migration、内存仓储、SQL 仓储和 contracts 同步支持 `attempt`。
- Worker coordinator 的 retry 操作：重试图片任务时把关联的 REJECTED 草稿恢复为 DRAFT，避免误发布。
- Fake ComfyUI 仍保留为确定性测试替身。

## 边界与未包含

- 当前 `ComfyUiHttpClient` 要求调用方提供已经编译好的 ComfyUI workflow JSON；workflow builder、模型/节点资产管理和提示词编译仍是后续阶段。
- 当前使用 HTTP history 轮询边界，尚未接入 ComfyUI WebSocket 进度流、对象存储上传或真实生成服务。
- 当前环境没有可用 ComfyUI 或 PostgreSQL 服务，因此只验证注入式 HTTP 响应、SQL 参数/映射和迁移文本，不声称真实端到端生成已验证。

## 验证

- `node --test packages/domain/src/behavior-media.test.ts`
- `node --test apps/worker/src/media.test.ts`
- `node --test packages/database/src/sql.test.ts packages/database/src/migration-behavior-media.test.ts`
- `node --test packages/config/src/*.test.ts packages/contracts/src/*.test.ts`
- 所有受影响 package 的严格 `tsc` 检查。
- 最终还需运行仓库全量 Node 测试和全部严格 `tsc` 项目。

## 回滚

删除本任务文档及 HTTP 客户端测试，恢复 `packages/config` 的 timeout 字段、`ImageJob.attempt` 及 `0006` migration 的变更；保留 Task 0020 的 Fake ComfyUI 和原有图片生命周期即可。
