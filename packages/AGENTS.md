# Packages 局部执行规则

- 修改 `packages/**` 前先读取根 `AGENTS.md`、当前 `docs/tasks/*.json` 和 `.ai/modules.json`。
- 保持 Contracts → Domain/Ports → Adapters 的方向；Domain 不依赖 Ports、数据库、HTTP、队列或供应商实现。
- `src/v2/shared`、顶层 V2 barrel、migration、包清单和锁文件属于 Integration-only。功能任务需要这些变化时提交 Interface Request，不直接修改。
- V1 文件默认只读；只有明确标记为 `v1-retirement` 的 Integration 任务可以修改。
- Fake/Mock 放在消费模块测试附近；稳定重复并能降低复杂度后才提取公共测试工具。
