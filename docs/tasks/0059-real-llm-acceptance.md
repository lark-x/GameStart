# Task 0059：真实 LLM 联调与验收

状态：In progress  
执行角色：`luna_implementer`  
审查角色：主线程 Sol Medium

## 1. 任务目标

把当前 LLM 能力从 Provider 边界推进到可验收的真实联调链路，确保聊天、记忆写入和主动消息在真实模型接入时有明确验收标准。

## 2. 允许范围

允许创建或修改：

- `apps/api/src/**`
- `apps/worker/src/**`
- `packages/ai/src/**`
- `packages/config/src/**`
- `docs/PROGRESS.md`
- `docs/RELEASE.md`
- `docs/tasks/0059-real-llm-acceptance.md`

## 3. 禁止范围

- 不改动数据库 schema。
- 不引入生产部署流程或多用户认证体系。

## 4. 已知背景

`packages/ai` 已有完整与流式 Provider 测试，但 `PROGRESS` 中的“AI 回复持久化、记忆写入、主动消息”尚未明确真实 LLM 验收边界。

## 5. 明确实现内容

至少完成：

- 真实 LLM 配置与启动说明。
- 一条最小联调验收路径（聊天或主动消息）。
- 相关文档与验收命令更新。

## 6. 完成标准

- 真实 LLM 联调路径可重复运行。
- 文档、测试或验收说明提供证据。
- 不破坏现有本地 MVP 流程。

## 7. 验证方法

- `pnpm typecheck`
- `pnpm test`
- 手动或脚本执行真实联调流程

## 8. 回滚方式

恢复配置、文档和运行入口。

当前证据：`integration/llm-acceptance.test.ts` 已覆盖 Provider complete/stream，以及 API SSE → 对话编排 → AI Message 持久化 → LLM_DERIVED 记忆写入；真实验收仍需设置 `RUN_LLM_ACCEPTANCE=1`、`LLM_BASE_URL`、`LLM_MODEL` 并连接可用模型。

## 9. 返回格式

1. 调查结论  
2. 修改文件  
3. 关键配置变化  
4. 执行的命令  
5. 验证结果  
6. 未解决问题  
7. 风险和建议
