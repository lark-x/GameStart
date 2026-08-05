# Task 0023 — 角色视觉身份与 Workflow 编译边界

## 目标

把“角色稳定身份”和“事件场景”拆成两个可审计的提示词层，并用版本化 ComfyUI workflow 模板把编译结果写入明确节点路径，避免靠一段自由文本维持角色一致性。

## 交付内容

- `CharacterVisualIdentity`：角色/世界归属、正面身份提示词、负面词、风格标签、参考图引用和 revision。
- `ImageWorkflowTemplate`：模板 id/version、JSON graph，以及正面提示词、负面提示词、seed 的节点路径。
- `compileImageWorkflow`：
  - 合并身份层、风格标签和场景层；
  - 在模板副本中注入提示词与可选 seed；
  - 返回 `workflowVersion`、编译后的 prompt 和完整 JSON；
  - 校验节点路径、非空字段和 seed，模板默认负面词在未配置新负面词时保持不变。
- contracts 中新增视觉身份、workflow 模板和编译结果 JSON Schema。
- 纯 domain/contract 测试覆盖提示词合成、不可变模板副本、路径错误和 seed 边界。

## 明确未包含

- 视觉身份的 PostgreSQL 表、API 编辑端点和参考图对象存储；下一阶段再接入持久化。
- ComfyUI 节点语义校验、模型/LoRA/ControlNet 资产发现、workflow builder UI。
- WebSocket 进度、真实 ComfyUI 连接和输出文件安全校验；HTTP client 仍由 Task 0022 提供。

## 验证

- `node --test packages/domain/src/visual-workflow.test.ts packages/contracts/src/contracts.test.ts`
- `packages/domain/tsconfig.json` 与 `packages/contracts/tsconfig.json` 严格 TypeScript 检查。
- 阶段完成前重新运行仓库全量 Node 测试和全部严格 `tsc` 项目。

## 回滚

删除 `packages/domain/src/visual-workflow.ts`、对应测试/contracts/schema 和本任务文档；恢复 domain index 与 contracts registry 到 Task 0022 状态，不触碰图片任务、HTTP client、迁移和 API。
