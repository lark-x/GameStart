# Packages 局部执行规则

- 修改 `packages/**` 前读取根 `AGENTS.md` 和当前功能直接涉及的 Contract、Domain、Port 或 Adapter；不要求创建或读取任务 JSON。
- 保持 Contracts → Domain/Ports → Adapters 的方向；Domain 不依赖 Ports、数据库、HTTP、队列或供应商实现。
- 纵向功能可以同步修改 `src/v2/shared`、顶层 V2 barrel、migration、包清单和锁文件，无需 Interface Request；修改仍须与当前用户结果直接相关，并保持既有依赖方向。
- V1 文件默认只读；只有用户明确要求物理退役或兼容修复时才修改。
- Fake/Mock 放在消费模块测试附近；稳定重复并能降低复杂度后才提取公共测试工具。
