# Living Network 文档索引

本目录按“当前事实、开发规范、产品状态、历史记录”分层管理。阅读或更新文档时，先确认文件职责，避免用产品愿景或历史任务替代当前实现证据。

## 当前权威文档

| 文档 | 职责 |
| --- | --- |
| [系统架构](./architecture.md) | 当前实现架构、依赖方向、运行模式和数据流的唯一文档事实来源 |
| [开发原则](./DEVELOPMENT.md) | 长期架构原则、开发纪律、质量和安全要求 |
| [前端开发规范](./frontend-development-standard.md) | Web 组件、样式、响应式、无障碍和前端验收规则 |
| [开发进度](./PROGRESS.md) | 当前能力、验证证据、限制和后续路线 |
| [发布验收](./RELEASE.md) | 当前本地运行、自动检查和发布候选清单 |
| [产品需求](./product-requirements.md) | 产品目标、功能优先级和体验愿景；状态需与进度文档一致 |
| [核心业务流程](./user-flows.md) | 当前关键用户路径及系统交互 |

## V2 替换计划与当前切换

| 文档 | 职责 |
| --- | --- |
| [V2 AI 并行开发主文档](./v2/ai-parallel-master-plan.md) | 唯一执行计划；包含 Gate 0、三个独立分支、复用、接口协作、分阶段集成和验收 |
| [V2 公共开发基线](./v2/common-baseline.md) | Gate 0、三个 AI 分支和集成分支共同遵守的产品、架构、接口、复用和验收边界 |
| [旧版三 AI 独立分支计划](./v2/three-ai-execution-plan.md) | 已替代，仅保留迁移说明并指向主计划 |
| [V2 Interface Requests](./v2/INTERFACE_REQUESTS.md) | 每分支独立接口请求文件的格式和处理规则 |
| [V2 三设备执行提示词](./v2/three-device-prompts.md) | 不同设备通过 GitHub 拉取、等待 Gate 0、创建独立分支和执行各自任务时直接使用 |

V2 已在 `codex/v2-integration` 完成 Core/Generation/Assets/Web 集成，当前默认运行时、Compose、CI 和发布验收均以 V2 为准。V1 资料只在明确标记的归档、退役和历史 delivery 文档中保留。

根目录 [AGENTS.md](../AGENTS.md) 是模型和开发代理的强制执行入口。

## 架构决策

[decisions/](./decisions/) 保存当前接受的架构决策。架构选择发生变化时，应新增替代 ADR，并同步 `architecture.md`，不得直接改写历史 ADR 的结论。

## 历史资料

[archive/](./archive/) 保存已完成任务契约和一次性验证报告。历史文件保留当时语境和技术口径，不代表当前架构、开发规范或完成状态。

## 更新规则

- 当前架构或数据流变化：更新 `architecture.md`，必要时新增 ADR。
- 开发约束变化：更新 `DEVELOPMENT.md`、对应专项规范及 `AGENTS.md`。
- 能力或验证状态变化：更新 `PROGRESS.md`；影响用户目标时同步产品需求。
- 启动或验收命令变化：同步 README 与 `RELEASE.md`。
- 历史记录只归档、索引和勘误，不用当前结论覆盖当时记录。
