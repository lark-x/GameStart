# Task 0033 — Web 私聊/群聊视图

## 目标

在 Web MVP shell 中接入现有 Conversation/Message API，让当前角色可以读取会话并发送文本消息。

## 交付内容

- 会话选择、消息气泡、当前角色消息样式和发送表单。
- API client 支持会话列表、消息列表和带幂等键的文本发送。
- 保留动态 Feed、角色切换和表情包资产视图。
- 静态入口测试覆盖聊天端点和渲染入口。

## 明确未包含

- SSE LLM 流式回复、群聊成员编辑、图片/表情发送、认证和离线缓存。
- 当前仍是浏览器原生 ES module shell，Vue 3/Vite 构建和 Playwright E2E 等待前端依赖可用。

## 验证

- `node --test apps/web/web-shell.test.ts`
- 仓库全量 Node 测试与全部严格 TypeScript 检查。
