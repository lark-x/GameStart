# Task 0038 — Web 图片与表情消息发送

## 目标

把 Message domain 已支持的 IMAGE/STICKER 类型接入 Web 聊天，允许当前角色发送图片媒体引用和已导入表情。

## 交付内容

- Chat composer 在 TEXT 与 IMAGE 之间切换；IMAGE 输入 `mediaRef` 或可访问图片 URL。
- 聊天消息中的 IMAGE 使用懒加载图片卡展示。
- 表情包资产条目可以发送到当前会话，消息使用唯一 id/idempotency key。
- 发送成功后刷新当前消息列表并显示状态。

## 明确未包含

- 图片文件上传、对象存储签名、缩略图和内容扫描。
- Sticker 消息当前显示 stickerId；把 stickerId 解析为媒体缩略图需要消息详情聚合或客户端缓存索引。
- 服务端尚未在发送 STICKER 时验证 stickerId 必须存在。

## 验证

- `node --test apps/web/web-shell.test.ts apps/api/src/chat.test.ts packages/domain/src/conversation-message.test.ts`
- 仓库全量 Node 测试与全部严格 TypeScript 检查。
