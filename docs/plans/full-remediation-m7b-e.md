# Living Network 全面整改与 M7B–M7E 产品闭环计划

状态：仅规划，未开始实施  
实施基线：`codex/architecture-governance`  
建议实施分支：`codex/full-remediation-m7b-e`

## 一、审计结论

项目需要整改，且存在一项应立即修复的 P0 正确性问题：

- `0020_story_graph.sql` 已存在，但未登记到 migration runner；新数据库可能不会创建 Story Graph 表，`/ready` 也无法发现缺少 0020。
- Story Graph 新增约 3300 行实现，但缺少 Domain、Contract Schema、migration、仓储、API 和 E2E 专项测试。
- 边界检查虽然通过，但 API/Worker 业务代码仍大量从 Database 导入 Ports 类型。
- Web lint 存在 27 个 warning，且页面中有裸交互元素、硬编码颜色和 `!important`，现有 CI 不会拦截这些规范违规。
- `sql.ts`、`in-memory.ts`、`schemas.ts`、`parsers.ts`、`ChatView.vue` 等文件过大。
- `api.js + api.d.ts` 双份维护，已存在已知请求类型使用 `unknown` 和前端重复 DTO。
- 当前产品缺少 Story Graph 生成审核、图文草稿审核、关系反馈、记忆审核闭环和完整 Feed 互动体验。

实施基线为 `codex/architecture-governance`。创建单一分支 `codex/full-remediation-m7b-e`，按以下阶段串行提交；不允许多个模型同时修改同一模块。

## 二、阶段实施计划

### 阶段 1：修复 Story Graph 正确性与测试缺口（P0）

提交：`fix: register and validate story graph persistence`

- 将 `0020_story_graph` 登记到 migration runner，迁移版本断言更新为连续的 1–20。
- 增加自动校验：每个 migration 必须同时存在 up/down 文件、只登记一次、版本连续、磁盘文件不能遗漏登记。
- 新增 0020 migration 测试，验证表、索引、跨世界约束、删除顺序和 rollback。
- 新增 Story Graph Domain 测试，覆盖 Arc/Node/Edge、时间模式、锁定、跨世界引用、自环、权重和状态。
- 为 Story Graph DTO 补充 JSON Schema，并加入 `contractSchemas` 注册表。
- 增加内存与 SQL 仓储测试、API CRUD/错误/删除测试和 Web API 客户端测试。
- 增加真实 PostgreSQL 验收：从空数据库执行 1–20，完成 Story Graph CRUD，重启后读取数据。
- 将记忆候选批准操作改为事务：MemoryItem 与候选审核状态必须同时成功或同时回滚。
- 清理 Story Graph Use Case 中的重复或不可达语句，不改变外部行为。

验收：

- 新数据库实际包含 0020 的五类表。
- 缺少 0020 时 `/ready` 报 Schema behind。
- Story Graph 各层均有专项测试。
- `pnpm typecheck`、Contracts/Domain/Database/API/Web 测试通过。

### 阶段 2：把开发规范变成自动门禁

提交：`ci: enforce architecture and frontend governance`

- 扩展边界检查：
  - 检查所有 package manifest 的允许依赖方向。
  - 禁止 API/Worker 非运行时文件从 Database 导入接口类型。
  - Database 只能依赖 Domain、Contracts、Ports 和 `pg`。
  - Domain、Contracts、Ports 的限制覆盖子路径导入和动态导入。
  - 仅允许 `persistent-main`、migration、seed、开发仓储组装等明确入口直接依赖 Database。
- 新增治理检查：
  - migration 文件与注册表一致。
  - 生产文件体积门槛：普通文件 800 行、Vue View 600 行、Parser/Repository 600 行；测试文件上限 1200 行。
  - Web View/业务组件禁止裸 `<button>/<input>/<select>/<textarea>`，隐藏文件 input 和统一表单原语除外。
  - Vue 样式禁止十六进制品牌色和 `!important`。
  - 新增架构敏感变更时必须同步 `architecture.md` 或 ADR。
- 修复当前 27 个 lint warning，并将 Web lint 改为 `--max-warnings=0`。
- 根脚本新增 `pnpm verify`：边界、治理、类型、测试、覆盖率、构建和 lint。
- CI 使用 `pnpm verify`，真实服务与 E2E 继续独立运行。
- 为治理脚本增加正反 fixture 测试，确保门禁本身不会静默失效。

验收：

- 当前存量违规清零后才启用全量门禁。
- 人为加入一个非法 Database 导入、裸按钮、未登记 migration 或硬编码颜色时，CI 必须失败。
- 不允许通过新增 ignore、降低 warning 或扩大 allowlist 绕过门禁。

### 阶段 3：收紧 Ports 和依赖方向

提交：`refactor: align applications with repository ports`

- 在 Ports 中按能力组合接口：
  - `CoreRepositories`
  - `ChatRepositories`
  - `MemoryRepositories`
  - `EventRepositories`
  - `StoryGraphRepositories`
  - `MediaRepositories`
  - `SocialRepositories`
  - `SettingsRepositories`
  - `OperationalRepositories`
- 保留 `ApplicationRepositories` 作为运行时完整组合，但每个 Use Case、Coordinator 和 Worker 只接收实际需要的最小能力接口。
- API 的 `ApiStore`、Worker Runtime、Conversation Orchestrator、Scheduler、Executor、Publication 和图片协调器全部直接从 Ports 导入接口。
- 运行时组装入口继续从 Database 导入具体内存/PostgreSQL 实现。
- 将 interaction-log 的纯游标、脱敏和预览工具移至 Contracts 的日志模块，API/Worker 不再通过 Database 获取纯工具。
- 所有业务代码迁移完成后，删除 Database 对 Ports 类型的兼容 re-export。
- 消除 `require*Store()` 后的强制类型断言；能力缺失由运行时组装类型或明确的可选 Feature Adapter 表达。
- 保持现有内存模式、持久模式和 501 行为兼容；对真正必需的仓储改为启动期失败。

验收：

- 除运行时组装、migration、seed 外，API/Worker 中不存在 `@living-network/database` 导入。
- Use Case 单测可以只注入它所需的最小 Port。
- API 路由、状态码和 DTO 不发生破坏性变化。

### 阶段 4：拆分巨型模块

提交：`refactor: split oversized repository contract and parser modules`

- 将 SQL 仓储拆为：
  - core identity
  - chat/memory
  - events/execution
  - media/social
  - story content
  - settings/operations
  - shared row mapping
- `SqlRepositories` 保留为小型组合 façade；事务返回同构仓储集合。
- 内存仓储按相同业务域拆分，公共复制、索引和引用校验进入共享内部工具。
- Contracts Schema 按 world、chat、memory、events、media/social、story/settings 拆分；保留原 barrel export 和 `contractSchemas` 名称。
- API Parser 按现有路由模块拆分；`parsers.ts` 暂作为兼容 barrel，迁移完成后路由直接导入对应 parser。
- 测试按业务域拆分，保持行为断言，不用 Snapshot 替代。
- 拆分后目标：
  - `sql.ts` façade 不超过 250 行。
  - `in-memory.ts` façade 不超过 300 行。
  - 单个仓储/Parser/Schema 文件不超过 600 行。
  - 测试文件不超过 1200 行。

验收：

- 所有公开 export 保持兼容。
- SQL 文本、参数顺序、事务、幂等和异常行为不变。
- 全量测试与覆盖率通过。

### 阶段 5：统一前端 API 与清理规范债务

提交：`refactor: unify typed web client and design primitives`

- 将 `api.js + api.d.ts` 合并为单一 `api.ts`，删除人工声明文件。
- 将上传响应、自动回复状态、SSE 事件、世界资料请求等共享 wire 类型移入 Contracts。
- 已知请求不再使用 `unknown`；`types.ts` 只保留页面视图模型和 Contract 别名。
- 新增或完善 UI 原语：
  - Tabs
  - Checkbox
  - RadioGroup
  - Range
  - 隐藏 FileInput
  - Field/ErrorMessage
- 页面中的普通交互改用 UI 原语；原生 file input 只允许在统一隐藏组件内部。
- 在语义令牌中增加遮罩、反差文本和关系指标色，替换 Chat、Relationships、Assets、Integrations 中的十六进制颜色。
- 通过组件 variant、slot 和选择器职责修正移除全部 `!important`。
- 将 Chat、InteractionLogs、Assets、CreatorIntegrations、ContentSettings 拆为 composables 与 domain components，使 View 只负责页面编排。
- 保留功能性滚动区，删除页面级重复滚动；验证 `.app-main` 为唯一页面滚动容器。
- 所有图片补 alt，图标按钮补 `aria-label`，异步操作补 loading/disabled/error。

验收：

- Web lint 0 warning。
- `api.d.ts` 不再存在。
- 三主题和 360px/桌面截图通过。
- 聊天、资源、内容管理、日志和集成设置 E2E 行为不变。

### 阶段 6：M7B——按世界授权的结构化内容生成

提交：`feat: add governed story generation workflow`

新增 migrations：

- `0021_world_context_policy`
- `0022_story_generation`

新增世界级上下文策略：

- `worldLoreEnabled`
- `relationshipsEnabled`
- `schedulesEnabled`
- `memoriesEnabled`
- 默认全部 `false`。
- 系统级 `EXTERNAL_CONTEXT_ENABLED=false` 作为紧急总停。
- Memory 还需同时满足现有 `MEMORY_RETRIEVAL_ENABLED`。
- 节点本身、选中的 Prompt Template 和节点涉及角色的人设属于用户本次显式生成请求的基础上下文；实际发送内容必须在预览和日志中可见。

新增持久模型：

- `StoryGenerationJob`
  - `PENDING/RUNNING/SUCCEEDED/FAILED/CANCELLED`
  - attempt、idempotencyKey、provider/model、失败原因、时间戳。
- `StoryGenerationCandidate`
  - 节点、正文、关键选择、Prompt 版本、来源 Job、审核状态。
- StoryNode 增加可选 `generatedContent` 和 `generatedChoices`。

生成流程：

1. 创作者查看 generation context 预览。
2. API 幂等创建持久化 Job，返回 202。
3. Worker Pump 将 Job 加入独立 BullMQ 队列。
4. Worker 从活跃模型档案构造 Provider，按有效世界策略组装上下文。
5. 模型输出严格解析为正文、选择、关系变化候选和记忆候选。
6. 非法结构使 Job 失败，不保存部分结果。
7. 正文保存为待审核 StoryGenerationCandidate；关系与记忆分别保存为待审核候选。
8. 创作者批准正文后才写入节点并将节点标为 `GENERATED`；拒绝不修改节点。
9. 不自动选择分支，不自动推进后续节点。

新增 API：

- `GET/PUT /v1/worlds/:id/context-policy`
- `GET /v1/story-nodes/:id/generation-context`
- `POST /v1/story-nodes/:id/generation-jobs`
- `GET /v1/story-generation-jobs/:id`
- `GET /v1/story-generation-candidates`
- `POST /v1/story-generation-candidates/:id/review`

关键类型：

- `WorldContextPolicyDto`
- `StoryGenerationJobDto`
- `StoryGenerationCandidateDto`
- `StoryChoiceDto`
- `ReviewStoryGenerationCandidateRequest`

所有创建和审核请求均带幂等键；相同重放返回原结果，不同载荷返回 409。

### 阶段 7：M7C——图文动态审核与失败恢复

提交：`feat: complete reviewed moment publication workflow`

新增/完善能力：

- 创作中心展示 DRAFT、READY、REJECTED、PUBLISHED 动态草稿。
- 所有模型生成的动态默认需要审核；现有系统级 `MANUAL_REVIEW_BEFORE_PUBLISH=true` 保持紧急强制审核。
- 文本草稿可直接批准；有关联图片时，仅当 Image Job 为 `SUCCEEDED` 且有 mediaRef 才能批准。
- 图片成功后只把草稿推进到 READY，不自动绕过审核发布。
- 图片失败保留草稿和失败原因，可显式重试；重试生成新 attempt，不重复草稿或最终 Moment。
- 批准、拒绝、重试均幂等。
- 已发布 Moment 不允许再次发布或重新挂接图片。

新增 API：

- `GET /v1/moment-drafts`
- `POST /v1/moment-drafts/:id/review`
- `POST /v1/image-jobs/:id/retry`

新增类型：

- `MomentDraftReviewRequest`
- `MomentDraftReviewResultDto`
- `RetryImageJobRequest`

保留现有 Moment、Image Job 和 Feed API 的兼容性。

### 阶段 8：M7D——关系与记忆反馈闭环

提交：`feat: add audited world feedback`

新增 migration：`0023_world_feedback`

新增模型：

- `RelationshipChangeCandidate`
  - edge、sourceType/sourceRef、四项 delta、理由、规则版本、审核状态。
  - 每项候选值限制在 `[-20, 20]`，但任何大小都必须审核。
- `RelationshipEvent`
  - before/after、实际应用 delta、来源、审核人、幂等键和时间戳。

审核规则：

- 关系变化一律人工审核，不启用自动阈值。
- 只有 DYNAMIC 且 `relationshipDynamicsEnabled=true` 的世界可批准。
- 批准时在事务中锁定当前关系边、重新计算 before/after、写回关系并追加 RelationshipEvent。
- STATIC 世界、跨世界引用、已处理候选或冲突重放返回明确错误。
- 保留现有 `RelationshipEdgeDto.initialState` 字段以兼容客户端；内部将其视为当前状态，不在本轮破坏性改名。

记忆规则：

- 模型生成、事件推导和互动推导的长期事实全部先进入 MemoryCandidate。
- 批准时 MemoryItem 与候选状态同事务写入。
- 拒绝或合并不产生重复 MemoryItem。
- 用户原始消息/评论仍是审计事实，但不会自动转成角色长期记忆。

新增 API：

- `GET /v1/relationship-change-candidates`
- `POST /v1/relationship-change-candidates/:id/review`
- `GET /v1/relationships/:id/events`
- 复用并增强现有 Memory Candidate 审核 API。

新增类型：

- `RelationshipDeltaDto`
- `RelationshipChangeCandidateDto`
- `RelationshipEventDto`
- `ReviewRelationshipChangeRequest`

### 阶段 9：M7E——玩家互动与自动评论回复

提交：`feat: complete social interaction loop`

新增 migration：`0024_social_interaction_events`

数据模型变化：

- MomentInteraction 增加可选 `replyToInteractionId`。
- 新增 SocialFeedEvent，使用单调游标记录 Moment/Interaction 创建、删除和回复事件。
- 评论写入与 Outbox/Feed Event 在同一事务完成。

互动规则：

- 点赞使用幂等 PUT，取消点赞使用幂等 DELETE。
- 保留现有 POST interaction 接口兼容旧客户端。
- 评论保存成功后立即返回，不等待模型。
- 只有玩家对他人动态发表的根评论触发一次自动角色回复。
- 点赞不触发模型回复。
- AI 评论、回复评论和作者自己的评论不递归触发。
- 自动回复 ID 和幂等键由源评论确定。
- 回复失败不回滚玩家评论；BullMQ 最多重试 3 次并记录日志。
- 自动评论回复是本轮唯一允许无需人工审核直接公开的模型生成内容；不得在同一响应中自动应用关系或记忆变化，只能生成待审核候选。

Worker：

- 为 Outbox Queue 增加实际 Consumer。
- 处理 `moment.comment.created`，加载动态作者、源评论、有效上下文策略和活跃 Provider。
- 生成一条简短角色回复，保存为带 `replyToInteractionId` 的 COMMENT。
- 同步创建可选关系/记忆候选，但不自动应用。

新增 API：

- `PUT /v1/moments/:id/like`
- `DELETE /v1/moments/:id/like`
- `GET /v1/worlds/:id/feed/stream?cursor=...`
- 现有互动 GET/POST 保持兼容。

新增类型：

- `SocialFeedEventDto`
- `MomentInteractionDto.replyToInteractionId`
- `MomentInteractionPageDto`

Web Feed：

- 展示点赞数、评论数、评论线程和角色回复。
- 支持乐观点赞/取消，失败回滚 UI。
- 评论发送有 loading、disabled、错误和重试状态。
- 订阅 Feed SSE；断线携带 cursor 重连，收到事件后只刷新对应 Moment。
- 360px 下无横向溢出，键盘与屏幕阅读器可操作。

## 三、公共接口和兼容策略

- 所有现有 URL、请求字段和响应字段保持兼容。
- 新字段均为可选或由新端点返回。
- `StoryNodeDto` 只新增可选生成内容字段。
- `MomentInteractionDto` 只新增可选回复引用。
- `RelationshipEdgeDto.initialState` 暂不改名。
- `api.js/api.d.ts` 迁移为 `api.ts` 属于内部实现变化，不改变 HTTP 协议。
- 所有新增表使用 0021–0024 migration，均提供 down migration。
- 新增 Feature Flag 默认关闭，部署 migration 后不会自动调用模型或改变现有世界。
- 世界上下文策略默认关闭，必须由创作者逐世界启用。
- 不增加新的第三方运行时依赖；继续使用 Node、pg、BullMQ 和现有 Provider。

## 四、测试与验收计划

### 单元与契约

- Story Graph、生成 Job、候选审核、关系事件、Feed Event 和回复线程的 Domain/Contract 测试。
- 所有请求 Parser 覆盖未知字段、越界、跨世界、无权限和冲突重放。
- 结构化模型输出覆盖合法、缺字段、未知字段、过大正文、非法 delta 和恶意内容。

### 数据库与事务

- migration 1–24 连续性、up/down、空库安装和旧 19/20 版本升级。
- 候选审核、关系应用、评论 + Outbox、发布操作的事务回滚测试。
- PostgreSQL 并发审核确保最多应用一次。
- Redis 离线时 Job/评论请求仍保存在 PostgreSQL，可恢复派发。

### Worker

- Story Generation Job 成功、Provider 失败、结构解析失败、重试耗尽和重启恢复。
- Image Job 重试不重复 Moment。
- Outbox 评论消费者最多生成一次回复，不递归回复。
- 所有模型调用验证上下文策略；关闭策略时不发送对应数据。

### Web 与 E2E

- 世界上下文授权、上下文预览、创建生成 Job、审核正文。
- 审核图文动态和重试失败图片。
- 审核关系变化和记忆候选。
- 点赞、取消、评论、自动回复和 SSE 重连。
- 三主题、桌面、360px、键盘操作、无横向溢出。
- E2E 使用 Fake Provider/ComfyUI，不访问真实供应商。

### 最终门槛

- `pnpm verify`
- `RUN_REAL_INTEGRATION=1 pnpm test:integration`
- `pnpm test:e2e`
- migration 空库与升级路径通过。
- Web lint 0 warning，治理脚本无例外扩张。
- 默认测试确认真实 LLM/ComfyUI 调用次数为 0。
- 在允许监听端口的 CI/本机环境执行 HTTP 测试；当前沙箱中的 4 个 `EPERM` 监听失败不能当作业务失败，也不能因此删除测试。

## 五、分支、提交与回滚纪律

- 从 `codex/architecture-governance` 创建 `codex/full-remediation-m7b-e`。
- 使用一个整改分支，但严格按上述九个阶段分别提交。
- 阶段之间串行；禁止多个模型并行修改 Ports、Database、Contracts、API 或 Web 公共文件。
- 每阶段必须先通过相关包测试和 typecheck，失败不得进入下一阶段。
- migration 提交一旦用于共享数据库，不通过改写旧 migration 修复；后续修正必须新增 migration。
- 最终统一更新 `architecture.md`、`PROGRESS.md`、`RELEASE.md`、产品需求、业务流程和相关 ADR。
- 不直接推送或合并 `main`；完整验证后再创建一个总 PR。

## 六、明确不在本次范围

- 生产级认证与账号体系。
- TLS、域名和反向代理生产配置。
- S3/MinIO 应用适配迁移。
- 备份恢复、灾难恢复和生产监控部署。
- pgvector、ORM、Fastify、微服务或桌面包装。
- 真实供应商自动验收；真实 LLM/ComfyUI 仍需使用者显式启用。
