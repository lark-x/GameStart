# Task 0062：真实 ComfyUI 图片链路验收

状态：In progress  
执行角色：`luna_implementer`  
审查角色：主线程 Sol Medium

## 1. 任务目标

把 ComfyUI 图片生成从 Fake 适配器推进到真实 HTTP 联调链路，确保任务提交、进度回调和媒体存储在对接真实 ComfyUI 实例时可重复验收。

## 2. 允许范围

允许创建或修改：

- `packages/ai/src/**`（ComfyUI 适配器）
- `packages/database/src/**`（媒体存储相关，不改 schema）
- `apps/worker/src/**`（图片任务执行器）
- `apps/api/src/**`（图片任务状态 API）
- `docs/PROGRESS.md`
- `docs/tasks/0062-real-comfyui-acceptance.md`

## 3. 禁止范围

- 不改动数据库迁移。
- 不引入对象存储（S3/MinIO）新集成；使用本地文件存储。
- 不改动 LLM 或聊天逻辑。

## 4. 已知背景

`apps/worker/src/media.ts` 已有 Fake 与 HTTP ComfyUI client 测试，Worker 已有 workflow resolver、WebSocket 进度适配和本地媒体存储；剩余工作集中在真实 ComfyUI 实例的联调验收：
- 需要用真实 Workflow 验证任务提交后的 WebSocket 终态事件。
- 需要在真实输出文件上验证下载、校验和本地存储路径。
- 需要把真实服务结果纳入发布候选记录。

## 5. 明确实现内容

至少完成：

- ComfyUI HTTP 任务提交的验收脚本或手动联调命令。
- 任务进度 WebSocket 回调解析与状态更新的端到端验证。
- 生成图片下载至本地存储并可被 API 返回。
- 文档中新增真实 ComfyUI 联调说明。

## 6. 完成标准

- 真实 ComfyUI 实例可接收任务、返回图片。
- 图片文件在本地存储可读、API 可查询任务状态。
- 文档更新联调说明。

## 7. 验证方法

- 启动 ComfyUI 实例后执行联调脚本
- API 查询任务状态返回 completed 且图片可访问

## 8. 回滚方式

恢复 `packages/ai`、`apps/worker` 和文档。

当前证据：`integration/comfyui-acceptance.test.ts` 已覆盖 `/system_stats`、有效 Workflow `/prompt`、`/history` 轮询、`/view` 下载和 `LocalMediaStore` 文件校验；`ComfyUiHttpClient.watchProgress()` 已解析 ComfyUI WebSocket 的 progress/executing/execution_success/execution_error 事件，`BehaviorMediaCoordinator.watchImageJobProgress()` 已将完成/失败事件同步到 `ImageJob` 与 MomentDraft；Worker 单元测试覆盖过滤、超时、网络错误、终态更新和本地媒体存储。真实实例的有效 Workflow、WebSocket 进度和输出文件验收仍待外部 ComfyUI 环境。

## 9. 返回格式

1. 调查结论  
2. 修改文件  
3. 关键代码变化  
4. 执行的命令  
5. 验证结果  
6. 未解决问题  
7. 风险和建议
