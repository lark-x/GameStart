# 架构决策记录

ADR 记录难以从代码局部推断、且容易被后续开发重新讨论的架构选择。状态为“已接受”的 ADR 约束当前实现；若决策变化，应新增 ADR 并标记被替代关系。

- [ADR-0001：模块化单体与独立 Worker](./0001-modular-monolith-and-worker.md)
- [ADR-0002：原生 HTTP API](./0002-native-http-api.md)
- [ADR-0003：PostgreSQL、手写 SQL 与 Redis 职责](./0003-storage-and-queue-boundaries.md)
- [ADR-0004：Ports 与依赖方向](./0004-ports-and-dependency-direction.md)
- [ADR-0005：外部生成服务信任边界](./0005-external-generation-trust-boundary.md)
