# Task 0012：聊天 PostgreSQL 迁移与 SQL 仓储

## 目标

把 Task 0011 的聊天仓储边界落实到 PostgreSQL migration 0002 和 `SqlRepositories`，覆盖会话成员、消息 payload、活跃作者以及幂等写入。

## 本阶段范围

- `conversations`、`conversation_members`、`messages` 三张表。
- 私聊/群聊人数的延迟约束触发器。
- 消息类型 payload 检查和活跃成员作者触发器。
- `(conversation_id, idempotency_key)` 唯一约束。
- Conversation JOIN 行映射、Message 查询和参数化 upsert。
- Fake SQL client 测试。

## 不在范围内

真实 PostgreSQL 连接池、pg 驱动安装、Drizzle ORM、事务封装、SSE、LLM、记忆检索、附件存储和生产部署。

## 验收标准

- migration up/down 结构和依赖顺序正确。
- 关系成员只能来自同一世界，消息 payload 与 kind 一致。
- SQL adapter 对消息幂等重放返回已有行，对不同 payload 返回冲突。
- Conversation JOIN 能恢复 domain aggregate，写入值全部参数化。
- 全套 Node 测试和严格类型检查通过。

## 未验证项

当前环境没有可访问的 PostgreSQL daemon，因此 migration 和 SQL 语句尚未在真实数据库执行；静态 migration 测试和 Fake client 测试已完成。

## 回滚

删除 `migrations/0002_chat*`、`migration-chat.test.ts`、SQL adapter 聊天扩展、README 迁移说明和本任务文档；恢复 database 与 repository 到 Task 0011 状态，不触碰 0001 migration、API chat/domain/config。

## 返回格式

1. 调查结论
2. 修改文件
3. 关键代码变化
4. 执行的命令
5. 测试结果（含退出状态）
6. 未解决问题
7. 风险和建议
