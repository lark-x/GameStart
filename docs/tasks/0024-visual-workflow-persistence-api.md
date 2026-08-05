# Task 0024 — 视觉档案与 Workflow 持久化/API

## 目标

把 Task 0023 的角色视觉身份和版本化 Workflow 模板接入可替换仓储，并提供最小只读 API，供 Worker、管理界面和后续编译流程复用。

## 交付内容

- `CharacterVisualIdentityRepository`：按 id/角色读取并保存视觉身份；每个角色最多一份身份档案。
- `ImageWorkflowTemplateRepository`：按 `id + version` 读取、列表和保存模板。
- 内存仓储的防御性拷贝、角色/世界引用校验和重复角色约束。
- PostgreSQL migration `0008_visual_workflows.sql/down.sql`：
  - `character_visual_identities` 保存提示词、风格标签、参考图引用和 revision；
  - `image_workflow_templates` 保存 JSON graph、节点路径和复合主键版本。
- SQL 仓储的参数化查询/upsert、JSONB 映射和数组字段映射。
- 只读 API：
  - `GET /v1/characters/:characterId/visual-identity`
  - `GET /v1/comfyui/workflows`

## 明确未包含

- 视觉身份编辑 API、鉴权/角色权限、对象存储上传和参考图内容校验。
- Workflow graph 的 ComfyUI 节点语义校验、模板热加载和 WebSocket 进度。
- 真实 PostgreSQL 连接执行；当前 SQL 仍通过 Recording client 验证参数、映射和 upsert 形状。

## 验证

- domain、内存仓储、migration、SQL、API 测试。
- 全量 Node 测试与全部严格 TypeScript 项目检查。

## 回滚

删除 `0008_visual_workflows*`、视觉仓储接口/实现、API 端点、相关 contracts 测试和本任务文档；恢复 Task 0023 的纯 domain/workflow 编译边界。
