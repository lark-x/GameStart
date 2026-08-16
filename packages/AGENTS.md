# Packages 局部执行规则

- 修改 `packages/**` 前先读取根 `AGENTS.md` 和与当前用户路径直接相关的代码；不要求创建或读取任务 JSON。
- 保持 Contracts → Domain/Ports → Adapters 的方向；Domain 不依赖 Ports、数据库、HTTP、队列或供应商实现。
- 共享 Contract、顶层 barrel、migration、包清单和锁文件可以在同一纵向功能中修改，但必须保持既有依赖方向，不复制 DTO 或绕过 Domain/Ports。
- V1 文件保留作为历史实现；未明确要求时不要删除或大规模重构。
- Fake/Mock 放在消费模块测试附近；稳定重复并能降低复杂度后才提取公共测试工具。
