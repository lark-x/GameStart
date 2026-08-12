# Task 0013：OpenAI-compatible LLM Provider

## 目标

建立统一的 LLM Provider Adapter，兼容 OpenAI、DeepSeek、MiMo 等 OpenAI-compatible 服务，支持普通完成、SSE 增量、超时和错误归一化。

## 本阶段范围

- `packages/ai` 的聊天请求/响应类型。
- `OpenAICompatibleProvider.complete`。
- `OpenAICompatibleProvider.stream` 和 SSE `data:`/`[DONE]` 解析。
- API Key 只进入 Authorization Header，不出现在错误文本/测试摘要。
- ProviderError 的配置、网络、超时、HTTP 和响应格式分类。
- Fake fetch 测试。

## 不在范围内

Prompt 编排、结构化行为 Schema、记忆检索、SSE API 路由、重试队列、模型计费、具体 SDK、日志系统和新增依赖。

## 验收标准

- complete 使用 `/chat/completions`、参数化 JSON body 和可选 `response_format`。
- stream 能处理分块 SSE，并在 `[DONE]` 结束。
- 429/5xx/超时可标记 retryable；错误消息不泄露 API Key。
- Provider 配置和请求输入非法时抛出 `ProviderError`。
- AI 测试、既有全套测试和严格类型检查通过。

## 未验证项

尚未连接真实 LLM Provider，暂未验证各供应商的具体扩展字段和网络 TLS 行为。

## 回滚

删除 `packages/ai/**` 和本任务文档，不触碰 API、database、domain、contracts、config 或迁移。

## 返回格式

1. 调查结论
2. 修改文件
3. 关键代码变化
4. 执行的命令
5. 测试结果（含退出状态）
6. 未解决问题
7. 风险和建议
