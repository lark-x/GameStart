# Living Network 开发进度

最后核对：2026-08-12（`96130c5`）

本文是当前能力与验证状态的唯一进度视图。当前技术架构见 [architecture.md](./architecture.md)；[archive/](./archive/) 中的任务和报告只代表历史语境。

## 1. 当前阶段

项目已经形成可重复的本地 MVP 和持久化运行链，当前重点从“搭建基础能力”转向“内容生成闭环、世界反馈、玩家互动和产品化验收”。

最新 Story Graph 工作区已经加入剧情弧、节点、边、Prompt 模板/预览和记忆候选审核，并具备 Domain、Contracts、API、内存仓储、PostgreSQL migration/仓储与 Web 内容管理入口。后续又增加了 World Context Policy、Story Generation Job/Candidate、Relationship Feedback、Social Feed 和评论自动回复入口，但 Story Generation 仍缺少实际 Worker 生成消费者，新增反馈/互动链路仍需补强事务和专项测试。

## 2. 当前能力矩阵

| 能力 | 状态 | 当前证据与边界 |
| --- | --- | --- |
| 世界、角色、关系、ActorSession | 已实现 | Domain、Contracts、内存/SQL 仓储、API 与 Web；角色切换不是生产认证 |
| 私聊、消息与 SSE | 已实现 | 消息幂等、成员校验、流式回复、自动回复失败保留和显式重试 |
| 记忆 | 基础实现 | 可见性、来源、置信度、内存关键词和 PostgreSQL FTS；无 pgvector/RRF |
| 世界资料 | 已实现 | 分类、标签、启用状态、全文检索和内容管理 |
| Story Graph | 编辑工作区已实现 | Arc/Node/Edge、Prompt Template/Preview、Memory Candidate；自动剧情推进未实现 |
| 事件、日程与执行 | 已实现 | 定义、Occurrence、Executor、状态、预算和日历；完整关系反馈闭环待补 |
| 创作者事件派发 | 已实现 | 扫描、只读预览、PostgreSQL 请求、Worker Pump、BullMQ 与批次状态 |
| 动态与媒体 | 基础闭环已实现 | 草稿、发布、图片任务、相册、互动 API、Feed 事件和评论自动回复入口；事务边界、运行时校验和直接测试仍需补强 |
| LLM | 协议与编排已实现 | OpenAI-compatible/Anthropic、超时、流式、日志和测试替身；真实供应商需显式验收 |
| ComfyUI | 协议与 Worker 链路已实现 | HTTP、WebSocket、重试、本地媒体；真实实例需显式验收 |
| Web | Vue/Vite 默认入口 | Vue Router、Pinia、创作中心、六主题、基础 UI 原语和响应式基线；仍存在前端规范债务 |
| PostgreSQL/Redis | 持久模式已实现 | migration、seed、API、Worker、Outbox、真实服务 CI；不是所有产品链路都已人工验收 |
| CI/E2E | 已接入 | PR/main 执行 verify、PostgreSQL/Redis 集成和 Playwright 11 条核心路径 |

## 3. 已验证的工程门槛

仓库当前 `pnpm verify` 定义以下门槛：

- 架构边界检查。
- 严格 TypeScript 检查。
- 工作区单元测试。
- Web ESLint。
- 全仓构建。

`pnpm test:coverage` 存在，但当前未被 `pnpm verify` 调用；不能把覆盖率门槛描述为 verify 已强制执行。覆盖率、真实 PostgreSQL/Redis 集成和 Playwright E2E 需要独立运行并报告退出状态。

仓库另有以下验证能力：

- 覆盖率命令：`pnpm test:coverage`。
- PostgreSQL 17 + Redis 7 真实服务集成测试。
- Playwright Chromium E2E。

2026-08-11 的一次性重构验证记录已归档至 [历史验证报告](./archive/validations/refactor-integration-validation.md)。它绑定当时提交，不能替代当前 CI 结果。

真实 LLM 和真实 ComfyUI 默认不会被 CI 调用。只有设置 `RUN_LLM_ACCEPTANCE=1` 或 `RUN_COMFYUI_ACCEPTANCE=1` 并提供可用服务后，才能声明对应真实验收完成。

## 4. 当前限制与风险

### 产品能力

- Story Graph 目前是人工创作与上下文预览工作区，不自动生成正文或推进剧情。
- Story Generation 已有 Job/Candidate API 和仓储基础，但缺少实际 Worker 生成消费者。
- 世界观、关系和日程已经有 World Context Policy 入口，但尚未形成完整、可验收的外发授权生成闭环。
- 动态点赞/评论、Feed 事件和角色自动回复已有入口，但自动回复分析使用的结构化解析和 provider 装配仍需补强，实时刷新体验仍需验收。
- 关系变化和事件记忆有候选/事件基础，但审核应用仍需事务化和更完整的行为测试。
- 真实 LLM 与真实 ComfyUI 仍取决于使用者提供配置和单独验收。

### 工程治理

- API/Worker 尚未全部直接从 Ports 导入接口，Database 仍保留兼容导出。
- `DomainRepositories` 仍是较大的可选 Repository Bag。
- SQL、内存仓储、Contracts Schema、Parser 和部分 Vue 页面已开始拆分，但仍存在较大 façade 和历史页面债务。
- Web 存在裸交互元素、硬编码颜色、`!important` 等历史规范债务，当前 lint 不能完整阻止新增违规。
- `pnpm verify` 未包含 coverage；`pnpm test:coverage` 必须独立报告。
- 生产级认证、TLS、秘密管理、对象存储适配和完整监控部署尚未完成。

## 5. V2 替换计划

V2 replacement 的公共边界已记录在 [V2 公共开发基线](./v2/common-baseline.md)，唯一实施入口为 [V2 AI 并行开发主文档](./v2/ai-parallel-master-plan.md)。该计划要求先完成 Gate 0 骨架，再从同一 `V2_BOOTSTRAP_SHA` 创建三个分支，并按 Slice A-D 分阶段集成。V2 目标允许 Fastify、SQLite + FTS5 和 Qdrant，但只适用于明确标记为 V2 replacement 的分支；当前 V1 维护任务不得把这些技术视为默认选型。

## 6. 后续优先顺序

1. 内容生成质量：把 Story Graph、世界资料、关系、日程和可见记忆通过明确授权接入结构化生成与审核。
2. 图文动态闭环：统一草稿、图片终态、发布与失败恢复，并完善 Feed 交互体验。
3. 世界反馈：领域规则应用关系变化，事件和互动写入可追溯记忆，模型只提交候选。
4. 玩家互动：完成点赞、评论、角色回复和实时刷新，使互动可继续触发事件。
5. 架构治理自动化：增强 Ports、前端规范、依赖方向、migration 和文档同步门禁。
6. 产品化验收：真实 LLM/ComfyUI、备份恢复、认证、安全部署和核心用户闭环。

## 7. 统一完成标准

每项能力必须有明确范围、领域或 Contract 边界、失败模式、独立测试、退出码为 0 的验证命令和同步后的当前文档。涉及数据库迁移、事务一致性、外部数据发送、身份权限或自动状态变更的任务，在实现前需要单独风险审查。

内存/Fake 测试、真实 PostgreSQL/Redis、真实 LLM 和真实 ComfyUI 是不同证据等级，交付时必须分别说明，不能互相替代。
