# ADR-0004：Ports 与依赖方向

- 状态：已接受
- 日期：2026-08-12

## 决策

`packages/ports` 定义应用和 Worker 所需的仓储、Outbox、派发及日志接口；`packages/database` 提供内存和 PostgreSQL 适配器。业务代码面向最小 Port 能力，具体适配器只在运行时入口组装。

## 目标依赖方向

```text
Web -> Contracts
Web -. HTTP .-> API
API / Worker -> Contracts + Domain + Ports
Database -> Domain + Contracts + Ports
Runtime entrypoints -> Database + AI + Config
```

Database 当前保留部分 Ports 类型的兼容导出，属于迁移期技术债务，不应成为新代码的导入方式。
