# `@living-network/database`

当前默认数据库实现是 `src/v2` 下的 Node `node:sqlite` + FTS5 适配器：连接、顺序 migration、事务、Canon/Graph/State、Candidate、Release/Runtime、Generation 和 Asset 仓储均在 V2 命名空间中。

API 负责执行缺失的 V2 up migration；Worker 只检查 schema 是否完整。任何 down migration 都必须由显式维护任务调用，服务启动不得自动回滚。

旧 PostgreSQL client、migration 和仓储仍保留在冻结 V1 工作树中，不是 V2 运行时的事实来源，也不应成为新 V2 代码的导入路径。
