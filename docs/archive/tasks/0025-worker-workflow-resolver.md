# Task 0025 — Worker Workflow Resolver 与 ComfyUI 提交链路

## 目标

把图片任务中的 `workflowVersion`、角色视觉身份和场景 prompt 组合成可提交的 ComfyUI JSON，接入 Worker 的 `ImageJob` 提交流程。

## 交付内容

- `RepositoryImageWorkflowResolver`：
  - 解析 `templateId@version`；
  - 从仓储读取角色视觉身份和 Workflow 模板；
  - 调用 domain `compileImageWorkflow` 注入正/负面词和 seed；
  - 对缺少模板、缺少视觉身份和非法版本返回不可重试的配置错误。
- `BehaviorMediaCoordinator` 接受可选 resolver；配置 resolver 时，`submitImageJob` 将编译后的 `workflow` 传给 `ComfyUiClient`。
- Worker 测试覆盖编译结果、submit payload 和缺少模板时保持任务 `QUEUED`。

## 明确未包含

- 自动选择最新模板、模板灰度发布、ComfyUI 节点语义验证和模型资产发现。
- 真实 ComfyUI 请求、WebSocket 进度和输出文件安全校验；这些仍由外部服务环境验证。
- 将身份 reference image 自动写入 IP-Adapter/ControlNet 节点；当前只保存引用并保留模板节点路径扩展点。

## 验证

- `node --test apps/worker/src/workflow.test.ts`
- Worker 严格 TypeScript 检查。
- 阶段结束运行仓库全量 Node 测试和全部严格 `tsc` 项目。

## 回滚

删除 resolver、Coordinator 的可选参数、Worker 测试和本任务文档；保留 Task 0024 的仓储、API 和 Task 0023 的纯编译器。
