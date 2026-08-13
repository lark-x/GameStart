# 架构决策记录

ADR 记录难以从代码局部推断、且容易被后续开发重新讨论的架构选择。状态为“已接受”的 ADR 约束当前实现；若决策变化，应新增 ADR 并标记被替代关系。

当前运行时说明：ADR-0002、ADR-0003 及其中仅适用于 V1 的运行时选择已冻结在 V1 归档维护线；ADR-0001 的模块化单体原则、ADR-0004 的依赖方向和 ADR-0005 的外部信任边界在不与 V2 决策冲突时继续适用。V2 replacement 的目标边界由 ADR-0006 定义，正式运行时切换和 V1 退役由 ADR-0007 定义。历史 ADR 文件保留原文，不回写历史结论。

- [ADR-0001：模块化单体与独立 Worker](./0001-modular-monolith-and-worker.md)
- [ADR-0002：原生 HTTP API](./0002-native-http-api.md)
- [ADR-0003：PostgreSQL、手写 SQL 与 Redis 职责](./0003-storage-and-queue-boundaries.md)
- [ADR-0004：Ports 与依赖方向](./0004-ports-and-dependency-direction.md)
- [ADR-0005：外部生成服务信任边界](./0005-external-generation-trust-boundary.md)
- [ADR-0006：V2 本地创作者驱动互动游戏平台](./0006-v2-local-creator-game-platform.md)
- [ADR-0007：V2 正式运行时切换与 V1 退役](./0007-v2-runtime-cutover-and-v1-retirement.md)
