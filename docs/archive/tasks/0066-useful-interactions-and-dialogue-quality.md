# Task 0066：重点交互日志与对话质量第一阶段

状态：本地实现与验证完成

## 目标

减少交互日志中的生命周期噪声，让创作者能够直接查看 LLM 输入/回复和 ComfyUI 图片任务内容；同时改善角色人设约束与玩家聊天展示，推进 M7B 内容生成质量的第一阶段。

## 已实现

- LLM Provider 的成功调用只写入一条重点日志，合并最近 20 条输入消息和最多 500 字符的回复预览；流式回复会在完成时汇总正文。
- `request_started`、`first_token` 和成功的 provider resolution 不再写入交互日志；错误、缺失配置和取消仍保留。
- ComfyUI 提交与终态日志使用 `IMAGE` 分类，并记录提示词、负面提示词、Workflow 版本、seed、外部任务 ID 和媒体引用。
- 日志页默认只显示消息、角色回复、LLM、ComfyUI 和错误；全部 HTTP、队列、扫描与 Worker 生命周期日志仍可手动查看。
- LLM 日志详情按 `SYSTEM / USER / ASSISTANT` 对话展示，技术字段保留在独立 JSON 区域。
- 角色 Prompt 增加身份一致性、自然口语、语言跟随、事实边界和禁止输出思考/调试内容的规则。
- 聊天页改为显示会话对方而不是当前玩家，补充日期与时间、系统消息、图片/贴纸状态，并隐藏模型内部思考与调试块。

## 数据边界

- 日志仍使用既有 7 天保留、递归脱敏和 500 字符预览边界。
- 本任务只记录本来已经发送给 Provider 的消息，不新增关系、日程或世界资料的数据外发。
- M7B 的关系、日程、世界观自动注入需要独立的显式开关和数据外发授权；结构化内容生成也不在本任务中冒充完成。

## 验证

- `pnpm typecheck`
- `pnpm --filter @living-network/ai test`
- `pnpm --filter @living-network/api test`
- `pnpm --filter @living-network/worker test`
- `pnpm --filter @living-network/web test`
- `pnpm --filter @living-network/web build`

真实 LLM 和真实 ComfyUI 未由自动测试调用，仍按 0059、0062 的验收边界执行。
