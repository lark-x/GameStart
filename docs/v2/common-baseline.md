# Living Network V2 公共开发基线

状态：V2 replacement 公共基线

最后核对：2026-08-12（`96130c5`）

适用范围：Gate 0、后续三个独立 AI 分支，以及最终集成分支

本文是 V2 并行开发前的共同边界。任何 V2 任务开始前必须先读根目录 `AGENTS.md`、`docs/DEVELOPMENT.md`、`docs/frontend-development-standard.md`（如修改 Web）、本文件和 `docs/v2/ai-parallel-master-plan.md` 中自己的任务章节。

## 1. V2 产品目标

V2 是本地优先的 AI 互动游戏脚本创作、审核、发布和游玩系统。创作者维护故事世界、角色、地理、时间、事实和叙事图；AI 只生成单场景候选、关系/记忆/状态变化候选、图片资产候选或临时互动内容；创作者审核后才能进入 canon 或发布版本。玩家游玩时读取固定发布版本，存档固定绑定该版本。

V2 不迁移 V1 旧数据，不兼容旧 API，不保留旧社交模拟作为核心产品形态。V1 代码只作为参考和可复用资产来源。

## 2. 目标技术边界

- Monorepo：继续使用 TypeScript workspace。
- Web：Vue 3 + Vite，复用现有 UI 原语、主题令牌、API 客户端组织方式和前端规范。
- API：Fastify，Route -> Parser/Schema -> Use Case -> Port -> Adapter。
- API 路径：V2 统一使用 `/api/v2` 前缀；V1 路径不作为兼容目标。
- Worker：BullMQ + Redis，负责生成任务、ComfyUI、索引刷新和其他明确建模的长任务；发布语义仍由核心 Use Case 决定。
- 事实库：SQLite + FTS5。
- 队列：Redis 只保存可重建队列状态，不保存业务事实。
- 向量库：Qdrant 独立保存 embeddings，可从 SQLite 重新构建。
- AI：复用 `packages/ai` 的 provider、流式协议、超时、错误归一化和测试替身。
- ComfyUI：复用当前 ComfyUI 协议客户端、Workflow 安全检查、媒体下载和本地媒体存储思路。
- 实现约定：Node.js 24；SQLite 默认使用内置 `node:sqlite`，本轮不引入 ORM 或新的 schema 库。改变驱动或验证方案必须先更新 ADR/计划。

## 3. 核心领域模块

`packages/domain` 是 V2 核心，目标上至少分为以下独立子域：

| 子域 | 职责 |
| --- | --- |
| World Canon | StoryWorld、角色、阵营、地点、时间轴、事实、规则、标签和可见性 |
| Narrative Graph | Arc、Scene、Choice、Gate、Consequence、Dependency 和图合法性 |
| Typed State | 类型化世界状态、变量、资源、flags、关系指标和状态变更约束 |
| Candidate Review | AI 生成候选、审核状态、差异、拒绝原因、应用审计 |
| Generation Context | 上下文快照、授权策略、引用来源、token 预算和提示输入 |
| Release | 不可变发布包、版本号、manifest、资源引用和兼容性 |
| Play Runtime | 运行游玩、选择、条件判断、存档、回滚和版本绑定 |
| Assets | 图片、角色立绘、场景图、Workflow 版本、seed、来源任务 |
| Social/Chat Temp | 临时聊天、跨角色互动、社交候选和不进入 canon 的会话记录 |

领域层不得依赖 Fastify、Vue、SQLite、BullMQ、Qdrant、供应商 SDK 或 `packages/ports`。领域层输出可持久化对象、状态机结果和领域错误；外部副作用放在应用层或适配器层。

## 4. V2 持久化事实

SQLite 是唯一业务事实来源，至少保存：

- 世界、角色、地点、时间线、事实、规则和标签。
- 叙事图：Arc、Scene、Choice、Gate、Consequence、Dependency。
- 类型化状态 schema、初始状态、状态迁移记录和审核后的 canon delta。
- 生成任务、上下文快照、AI 输出原文摘要、候选、审核记录。
- 资产任务、媒体文件引用、Workflow 版本、seed、来源候选。
- 发布版本、manifest、导出记录和完整性校验。
- 玩家存档、游玩事件、选择历史、发布版本绑定。
- 临时聊天、跨角色互动、社交互动和候选记录。
- Worker 心跳、Outbox、任务派发和可审计日志。

FTS5 用于本地关键词检索。Qdrant 只保存可重建向量索引，不保存唯一事实。

## 5. 公共接口契约

三个分支共享以下接口原则：

- Contract 类型优先放入 `packages/contracts`，不要在 Web/API/Worker 各自复制 DTO。
- 可被客户端或任务系统重试且会创建副作用的命令必须有 idempotency key；相同 key 的冲突 payload 返回 409。普通读取不需要幂等键，资源更新仍使用 revision/条件写保护并发。
- 所有 AI/ComfyUI 输出接口都返回 Job 或 Candidate，不同步等待长任务完成。
- 审核接口必须区分 approve、reject、request changes，并保存 reviewer、时间、原因和应用后的领域版本。
- 发布接口只能基于已审核 canon 创建不可变 release，不能读取 pending candidate。
- 玩家 runtime 只能读取 release + save，不读取创作者工作区 pending 数据。

V2 初始 API 分组：

| 分组 | 典型接口 |
| --- | --- |
| Canon | worlds、characters、locations、timeline、facts、rules |
| Graph | arcs、scenes、choices、gates、consequences、graph validation |
| State | state schema、initial state、state preview、state delta candidates |
| Candidate Review | canon candidate list、diff、review、apply、audit |
| Generation | context preview、scene generation job、job-to-candidate reference |
| Assets | asset jobs、ComfyUI workflow、media refs、asset candidate review |
| Release | release validation、create release、manifest、export |
| Runtime | start run、load scene、submit choice、save/load |
| Social Temp | chat session、crossover session、feed item、social candidate review |
| Operations | task status、logs、provider settings、index rebuild |

## 6. 可复用内容

直接复用或低成本改造：

- `packages/ai` provider 抽象、OpenAI-compatible/Anthropic 协议、超时、错误归一化、fake fetch 测试方式。
- 当前 ComfyUI HTTP/WebSocket 协议处理、Workflow 版本化、安全检查、媒体下载、本地媒体根目录、失败终态思路。
- BullMQ Worker、Outbox、心跳、有限重试、correlation id、日志脱敏。
- Web 的 Vue/Vite 基线、Pinia、SSE 客户端、`api.ts` 组织方式、基础 UI 组件、六主题和语义令牌。
- parser/schema 拆分经验、migration 注册一致性测试、边界检查脚本思路。

可参考但必须重写规则和测试：

- 世界/角色/关系、Conversation/Message、Memory、Story Graph、Moment Draft、Relationship Feedback、Social Feed。
- 这些模块的概念可复用，但 V2 的 canon、candidate、release、save 规则不同，不能原样搬运。

不复用为目标架构：

- PostgreSQL SQL/migration/repository 实现。
- 原生 `node:http` 路由层。
- `DomainRepositories` 大型 Repository Bag。
- V1 API 路径和旧 DTO。
- 旧 Story Graph 作为“内容管理补丁”的业务语义。

## 7. 并行开发规则

- 先完成并验收 `ai-parallel-master-plan.md` 定义的 Gate 0，再从同一个 `V2_BOOTSTRAP_SHA` 创建三个 AI 分支。
- 分支不得互相改对方 owner paths；公共基线、根依赖、lockfile 和平台 composition root 在并行期只读。
- 缺失接口写入本分支专属 `docs/v2/interface-requests/*.md`；blocking 请求立即裁决，其他请求在对应 Slice 集成时处理，不等最终一次性收口。
- 所有分支必须保留 `pnpm check:boundaries`、`pnpm typecheck`、相关测试和文档更新。
- 后端分支可以使用 Web mock fixtures 证明 contract，但不要实现页面。
- Web 分支可以使用 mock adapter 和 contract fixtures 完成交互，不要改写后端领域规则。
- 实现中发现基线错误时，先在本分支文档记录问题和建议，不要私自改变全局目标。

## 8. 验收门槛

单分支完成时至少报告：

- 修改范围和 owner paths。
- 新增/修改的领域规则和 contract。
- 已执行命令、退出码和未执行原因。
- Fake/内存、SQLite、Redis、Qdrant、真实 LLM、真实 ComfyUI 的证据等级。
- 与 `docs/v2/ai-parallel-master-plan.md` 的偏差。

最终集成完成前必须额外验证：

- 从空仓库运行 V2 本地开发环境。
- 创建世界、角色、地点、事实和第一段叙事图。
- 生成单场景候选，审核后进入 canon。
- 生成并审核图片资产。
- 创建不可变 release。
- 玩家基于 release 游玩、选择、保存、恢复。
- 导出 JSON + Markdown 包。
- 关闭 AI/ComfyUI/Qdrant 时，核心编辑和已发布游玩仍可用。
