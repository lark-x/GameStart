# Task 0011：聊天仓储、幂等写入与 API

## 目标

把 Task 0010 的 Conversation/Message domain 接入 API 和可重复测试的内存仓储，验证私聊/群聊创建、消息读取、文本/系统消息发送和幂等重放。

## 本阶段范围

- `ConversationRepository`、`MessageRepository` 端口。
- 内存会话/消息存储和防御性复制。
- 同一会话内幂等键重放返回原消息；不同 payload 返回冲突。
- API 创建会话、按角色列出会话、读取消息、发送消息。
- API 成员访问校验、SYSTEM 消息无作者和消息输入解析。
- contracts 请求类型和请求 Schema。

## 不在范围内

PostgreSQL 聊天迁移、SQL 聊天仓储、SSE、WebSocket、LLM Provider、记忆、附件上传、认证和新增依赖。

## 验收标准

- PRIVATE/GROUP 规则继续由 domain 校验，API 不复制业务规则。
- 读取消息必须由活跃会话成员发起。
- 重放相同幂等 payload 返回 `inserted: false` 和首次消息；冲突 payload 返回 409。
- API 支持文本和 SYSTEM 消息，其他媒体类型沿用 domain/contract 约束。
- 旧 API、config、database、contracts、domain 测试全部通过。

## 未验证项

SQL adapter 当前没有实现可选聊天仓储，使用真实数据库时聊天路由返回未配置；SSE/LLM 尚未开始。

## 回滚

删除聊天 repository 端口、内存实现、API chat 路由/测试、contracts 请求类型/Schema 和本任务文档；恢复 API/domain/database/contracts 到 Task 0010 状态，不触碰迁移 0001、配置和 runtime。

## 返回格式

1. 调查结论
2. 修改文件
3. 关键代码变化
4. 执行的命令
5. 测试结果（含退出状态）
6. 未解决问题
7. 风险和建议
