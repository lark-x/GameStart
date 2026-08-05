# `@living-network/database`

本包定义异步领域仓储端口，并提供仅用于开发和测试的 `InMemoryRepositories`。`migrations/0001_initial.sql` 定义 StoryWorld、Character、RelationshipEdge 和 ActorSession，`migrations/0002_chat.sql` 定义 Conversation、成员、Message、幂等键和作者约束。

`PostgresSqlClient` 是唯一的 PostgreSQL 驱动边界；它通过惰性加载的 `pg` Pool 提供参数化查询和事务。`applyMigrations` 只执行缺失的 up migration，从不在运行时隐式执行 down migration。API 仍然必须显式注入 `DomainRepositories`。
