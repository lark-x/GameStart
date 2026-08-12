# Task 0037 — ComfyUI Workflow 校验与 Web 设置

## 目标

为角色视觉档案和版本化 ComfyUI Workflow 提供可检查的设置界面，并在外部提交前验证所有节点路径绑定。

## 交付内容

- domain `assertImageWorkflowTemplateBindings`：验证正面词、可选负面词和 seed 路径均能解析到 Workflow JSON 对象。
- `ValidateImageWorkflowResultDto` 与 JSON Schema。
- `POST /v1/comfyui/workflows`：校验模板结构和节点绑定，返回已检查路径。
- Web 生成设置标签页：
  - 当前角色视觉身份、正/负面词、style tags 和参考图数量；
  - Workflow 模板选择与 JSON 编辑器；
  - 节点绑定验证结果。

## 明确未包含

- Workflow 保存/版本发布 API、模型/LoRA 节点资产探测、ComfyUI `/object_info` 语义校验。
- 视觉身份编辑/上传、IP-Adapter/ControlNet 路径自动注入。
- 当前校验保证 JSON 路径可写，不保证远端 ComfyUI 已安装对应自定义节点。

## 验证

- `node --test packages/domain/src/visual-workflow.test.ts apps/api/src/workflows.test.ts apps/web/web-shell.test.ts`
- 仓库全量 Node 测试与全部严格 TypeScript 检查。
