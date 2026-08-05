# Task 0034 — Web 动态互动与 SSE 回复

## 目标

把现有 MomentInteraction 与聊天 SSE API 接入 Web shell，完成动态点赞/评论和流式角色回复的可见交互。

## 交付内容

- 动态卡片读取互动、展示点赞/评论计数和评论列表。
- 当前角色可以点赞一次并提交文本评论，写入请求使用唯一 idempotency key。
- Chat 视图可以请求 SSE 回复，逐段追加 `ChatDelta.content` 并处理错误/DONE 事件。
- `parseSseBlock` 单元测试覆盖正常增量、错误、DONE 和无效 JSON。
- 角色切换后同步刷新 Feed 与会话列表。

## 明确未包含

- 点赞取消、评论删除/分页、互动通知和乐观缓存。
- SSE 输出当前只在界面中临时显示；服务端尚未把生成的 assistant 文本自动持久化为 Message。
- 当前沙箱不能启动浏览器端口，未执行真实浏览器 E2E。

## 验证

- `node --test apps/web/web-shell.test.ts apps/web/src/api.test.ts`
- 仓库全量 Node 测试与全部严格 TypeScript 检查。
