# ADR-0003：PostgreSQL、手写 SQL 与 Redis 职责

- 状态：已接受
- 日期：2026-08-12

## 决策

持久模式以 PostgreSQL 为业务事实来源，通过 `pg`、顺序 SQL migration 和手写仓储实现访问。派发请求、Worker 心跳、业务终态和幂等约束保存在 PostgreSQL；Redis 用于 BullMQ 及其可重建队列数据。本地文件系统保存当前媒体输出。Drizzle 与 pgvector 不是当前实现。

## 原因与影响

手写 SQL 与现有迁移、事务和测试体系一致。业务记录、审计、Outbox 和多数幂等约束必须落在 PostgreSQL；Redis 不得成为不可恢复业务状态的唯一存储。未来更换 ORM、增加向量检索或对象存储需要独立迁移方案与 ADR。
