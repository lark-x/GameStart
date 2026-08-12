# Task 0002：角色与关系领域模型

## 目标

在 Task 0001 的纯 TypeScript domain 包上建立角色、故事世界、关系边和用户角色会话的稳定领域边界，为 API、事件调度和 UI 提供可复用模型。

## 本阶段范围

- `Character`：AI/USER 角色、世界归属、时区、生日和提示词引用。
- `StoryWorld`：时区、现有 `StoryMode` 和关系动态开关。
- `RelationshipEdge`：关系方向、关系类型、初始关系状态和可见性。
- `ActorSession`：当前用户角色、故事世界、会话时间和角色切换。
- 领域错误、输入不可变性和 Node 内置测试。
- `packages/domain/package.json`：让 domain 测试脚本覆盖全部 `*.test.ts` 测试文件。

## 不在范围内

数据库、迁移、API、前端、认证、LLM、ComfyUI、Redis、日历调度和新增生产依赖。

## 验收标准

- 静态世界必须关闭关系动态开关，动态世界必须打开。
- 关系边拒绝自环、跨世界角色和越界初始状态。
- ActorSession 只能使用同一世界的 USER 角色，不能切换到 AI 角色。
- 构造函数和切换函数不修改输入对象。
- `pnpm typecheck`、`pnpm test`、`pnpm build` 和 domain Node 测试全部通过。

## 回滚

只删除本任务新增的 domain 文件和本任务文档，恢复本任务修改的既有 domain 文件及 `packages/domain/package.json` 测试脚本；不得触碰 Task 0001 文件和根配置。
