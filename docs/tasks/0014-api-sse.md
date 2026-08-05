# Task 0014：API SSE 聊天流

## 目标

把 `ChatProvider` 注入 API，为会话历史提供最小 SSE 流式响应，验证 LLM 增量传输、错误事件和 provider 未配置时的安全失败行为。

## 本阶段范围

- `ApiApplication` 接收可选 `ChatProvider`。
- `GET /v1/conversations/:id/stream?characterId=...`。
- 从已持久化消息构建 system/user/assistant ChatMessage 历史。
- 将 ChatDelta 编码为 SSE `data:` 事件，以 `data: [DONE]` 结束。
- Provider 错误转换为 bounded `event: error`，不泄露 Key。
- runtime 可注入 provider；不隐式创建模型客户端。

## 不在范围内

生成回复持久化、消息幂等写回、模型选择参数、Prompt 编排、Moderation、WebSocket、真实网络端到端测试和新增依赖。

## 验收标准

- 活跃会话成员才能读取 SSE 流。
- 没有 provider 返回 501；没有消息返回 400。
- provider 增量顺序保持不变，响应为 `text/event-stream` 并发送 `[DONE]`。
- provider 异常只产生安全错误事件和结束事件。
- 全套测试、严格类型检查通过。

## 未验证项

当前沙箱禁止真实 socket 监听，未做端到端 HTTP 网络测试；SSE 使用 WHATWG Response 流在应用层测试覆盖。

## 回滚

删除 API SSE 测试/实现、Task 0014 文档和 runtime provider 注入参数，恢复 API/ai 到 Task 0013 状态；不得触碰聊天迁移、domain、database、contracts 或 config。

## 返回格式

1. 调查结论
2. 修改文件
3. 关键代码变化
4. 执行的命令
5. 测试结果（含退出状态）
6. 未解决问题
7. 风险和建议
