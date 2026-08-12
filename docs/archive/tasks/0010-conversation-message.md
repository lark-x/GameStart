# Task 0010：Conversation 与 Message 领域模型

## 目标

为私聊、群聊、文本、图片、表情包和系统消息建立可复用的 domain 边界，并为每条消息强制幂等键，供后续 API、SSE、Worker 和记忆系统使用。

## 本阶段范围

- `ConversationType.PRIVATE/GROUP`。
- Conversation 创建、成员世界归属、重复成员和私聊/群聊人数规则。
- `MessageKind.TEXT/IMAGE/STICKER/SYSTEM`。
- 消息作者成员校验、消息内容类型校验和系统消息无作者规则。
- 消息 `idempotencyKey`、时间戳和输入不可变性。
- contracts DTO、JSON Schema 和 Node 内置测试。

## 不在范围内

数据库聊天表、消息仓储、SSE、WebSocket、LLM、记忆检索、主动消息、附件上传、权限认证和新增依赖。

## 验收标准

- PRIVATE 会话恰好两个成员，GROUP 至少两个成员，成员必须属于同一 StoryWorld。
- 非 SYSTEM 消息必须由活跃成员发送；SYSTEM 消息不能有作者。
- TEXT/SYSTEM 必须有文本；IMAGE 必须有 `mediaRef`；STICKER 必须有 `stickerId`。
- 每条消息必须有非空幂等键，返回对象不修改输入。
- contracts 暴露 Conversation、ConversationMember、Message DTO 和 Schema。
- 全套 Node 测试和严格类型检查通过。

## 回滚

删除 domain 新增的 conversation/message 文件和测试、contracts 中新增的聊天类型/Schema、Task 0010 文档；恢复 domain/contracts index 到 Task 0009 状态，不触碰 API、database、config 或迁移。

## 返回格式

1. 调查结论
2. 修改文件
3. 关键代码变化
4. 执行的命令
5. 测试结果（含退出状态）
6. 未解决问题
7. 风险和建议
