# 角色生活模拟与社交叙事系统开发文档

状态：Draft 1（可进入基础设施开发）  
参考项目：[icecranberry/galgame-with-comfyUI](https://github.com/icecranberry/galgame-with-comfyUI)

## 1. 项目目标

构建一个本地优先、可长期运行的 AI 角色生活模拟系统。系统中的角色拥有固定人设、关系网络、记忆、日程和视觉身份，能够在世界事件、现实节日、生日及剧情节点的驱动下产生行为、聊天、朋友圈动态和 ComfyUI 图片。

用户本身也是世界中的一个角色。系统采用“切换当前用户角色”而非 SaaS 多租户：当前用户角色决定可见信息、私聊身份、群聊身份和互动权限。

### 1.1 核心能力

- 角色档案：姓名、生日、背景、性格、说话风格、视觉提示词、禁用提示词。
- 关系网络：关系类型、初始强度、可见性、双向或单向关系、关系事件。
- 故事模式开关：完整静态故事与动态生活模拟可以按故事独立选择。
- 世界与日历：世界观日历、现实节日、生日、纪念日和剧情事件。
- 生活模拟：角色日程、地点、活动、情绪、事件响应和自主行为。
- 私聊与群聊：流式回复、主动消息、图片、表情包和系统事件。
- 社交动态：朋友圈或小红书式卡片瀑布流、评论、点赞和角色回复。
- 图片生成：根据角色视觉身份、地点、活动和镜头语言调用 ComfyUI。
- 长短期记忆：会话上下文、滚动摘要、事件记忆和混合检索。
- 模型适配：通过统一 API 接入 OpenAI-compatible 模型，不绑定单一供应商。

### 1.2 非目标（MVP 阶段）

- 不实现组织级多租户、计费和复杂 RBAC。
- 不允许 LLM 直接修改关系、资产或世界状态；状态变化必须经过领域规则验证。
- 不追求每天生成大量无意义对话；只有事件、计划或用户交互触发内容。
- 不在第一阶段制作桌面启动器、移动客户端或完整剧情编辑器。
- 不让角色自由调用任意工具或访问网络。

## 2. 从参考项目继承与优化的内容

参考项目已经验证了角色人格、VAD 情绪、混合记忆检索、朋友圈、ComfyUI 自动生图和流式对话的产品可行性。其实现采用 Vue 3、Express、SQLite/FTS5、FastAPI/ChromaDB 和 ComfyUI。

本项目保留以下设计：

- Vue 单页应用作为主要交互界面。
- 主控后端统一处理聊天、人格、记忆和图片任务。
- ComfyUI 使用 HTTP 提交任务、WebSocket 观察进度。
- 角色动态、相册、聊天和角色管理作为一级功能。
- 固定人设、动态情绪和记忆共同参与回复生成。

主要优化：

- 全栈 TypeScript，避免 Express JavaScript 主控层缺少类型边界。
- 模块化单体加独立 Worker，业务边界清晰但避免过早微服务化。
- PostgreSQL 同时承载关系数据、事件数据、全文检索和 pgvector，减少独立向量服务的运维负担。
- Redis + BullMQ 承载延迟任务、重复任务、失败重试和并发控制。
- 领域事件与 Outbox 保证状态写入和异步任务之间的一致性。
- 所有 LLM 输出先经过结构化解析和领域校验，不让模型直接写数据库。
- ComfyUI 工作流模板版本化；人物身份提示词与场景提示词分层组合。
- 图片、聊天、事件任务统一使用幂等键，避免重试造成重复帖子或重复图片。

## 3. 总体架构

```text
Vue Web App
  ├─ Chat / Group Chat
  ├─ Moments / Card Waterfall
  ├─ Character & Relationship Editor
  ├─ Calendar / World Events
  └─ Settings / ComfyUI Workflows
           │ HTTP + SSE + WebSocket
           ▼
TypeScript API (Fastify modular monolith)
  ├─ Actor Context / Role Switching
  ├─ Character & Relationship Domain
  ├─ Story / World / Calendar Domain
  ├─ Conversation Orchestrator
  ├─ Memory Retrieval
  ├─ Moment & Media Domain
  ├─ LLM Provider Gateway
  └─ Outbox Publisher
           │
           ├─ PostgreSQL + pgvector
           ├─ Redis + BullMQ
           └─ Object Storage (local / S3-compatible)
                         │
                         ▼
TypeScript Worker
  ├─ Scheduled Event Evaluation
  ├─ Character Action Planning
  ├─ LLM Generation Jobs
  ├─ ComfyUI Workflow Jobs
  ├─ Memory Summarization
  └─ Moment Publishing
                         │ HTTP + WebSocket
                         ▼
                      ComfyUI
```

### 3.1 架构原则

- 先模块化单体，只有独立扩缩容或故障隔离确有需要时才拆服务。
- PostgreSQL 是业务事实来源；Redis、向量索引和派生摘要均可重建。
- API 不等待长时间图片生成，返回 Job ID，由前端订阅进度。
- 定时任务只创建领域命令，不直接生成内容或修改最终状态。
- 业务状态变化具备来源、因果链、幂等键和审计记录。
- 静态剧情与动态关系共享数据结构，但使用不同状态推进策略。

## 4. 技术栈

| 层级 | 选择 | 用途与原因 |
|---|---|---|
| Monorepo | pnpm workspace + Turborepo | 统一脚本、缓存和共享类型 |
| Web | Vue 3 + TypeScript + Vite | 延续参考项目结构，生态成熟、交互开发效率高 |
| Web 状态 | Pinia + TanStack Query | Pinia 管本地 UI/当前角色；Query 管服务端缓存 |
| 路由 | Vue Router | 页面和角色上下文路由 |
| UI | Tailwind CSS + Headless/Radix 风格组件层 | 快速构建聊天、弹窗和瀑布流，同时保持可定制性 |
| API | Node.js + TypeScript + Fastify | 比 Express 提供更好的性能、Schema 和插件边界 |
| Schema | TypeBox + JSON Schema | API 校验、OpenAPI 和共享契约使用同一来源 |
| ORM | Drizzle ORM | 类型安全、迁移透明、便于保留 SQL 控制权 |
| 主数据库 | PostgreSQL | 角色、关系、聊天、事件、动态、任务和审计记录 |
| 向量检索 | pgvector + PostgreSQL FTS | 语义与关键词混合检索，减少独立向量服务 |
| 队列/调度 | Redis + BullMQ | 延迟任务、节日任务、生日任务、重试与并发限制 |
| 实时通信 | SSE + WebSocket | SSE 用于 LLM 文本流；WebSocket 用于任务和图片进度 |
| LLM | OpenAI-compatible Provider Adapter | 兼容 OpenAI、DeepSeek、MiMo 及其他 Base URL |
| 图片 | ComfyUI HTTP + WebSocket | 提交工作流、查询历史和进度事件 |
| 媒体存储 | 本地文件系统适配器；后续 S3/MinIO | MVP 易部署，接口允许无痛迁移 |
| 日志 | Pino | Fastify 原生生态，结构化日志和请求关联 ID |
| 可观测性 | OpenTelemetry（第二阶段） | 跨 API、Worker、LLM 与 ComfyUI 任务追踪 |
| 单元/集成测试 | Vitest + Testcontainers | 领域规则测试和真实 PostgreSQL/Redis 集成测试 |
| E2E | Playwright | 私聊、动态流、角色切换和图片任务端到端验证 |
| 本地基础设施 | Docker Compose | PostgreSQL、Redis、MinIO 可重复启动 |
| CI | GitHub Actions | lint、typecheck、test、build、migration check |
| 桌面包装（后续） | Tauri | 复用 Web UI，避免再次维护 PySide 启动器界面 |

所有依赖在实现时锁定具体版本；开发文档只约束技术方向，不把“最新版本”写死为长期架构要求。

## 5. 仓库结构

```text
apps/
  web/                 # Vue 前端
  api/                 # Fastify API
  worker/              # BullMQ Worker 与定时事件执行
packages/
  contracts/           # TypeBox API/事件 Schema
  domain/              # 无框架领域模型和规则
  database/            # Drizzle Schema、迁移、仓储实现
  ai/                  # LLM Provider、Prompt、结构化输出
  comfyui/             # ComfyUI Client、工作流模板和提示词编排
  config/              # 环境变量 Schema 与共享配置
  observability/       # 日志、Trace、请求上下文
infra/
  compose/             # PostgreSQL、Redis、MinIO
  comfyui/             # 工作流模板、示例与版本说明
docs/
  DEVELOPMENT.md
  decisions/           # ADR
  tasks/               # Sol 发给 Luna 的有边界任务契约
```

## 6. 核心领域模型

### 6.1 Actor 与角色切换

- `UserProfile`：现实用户设置，不等同于登录租户。
- `Character`：世界中的人物，包括用户扮演角色和 AI 角色。
- `ActorSession`：当前正在扮演的角色、可见范围和会话上下文。
- 所有写操作必须携带 `actorCharacterId`，服务端校验其是否允许执行操作。

### 6.2 Story 与动态关系开关

`StoryMode`：

- `STATIC`：人物关系及关键剧情节点由作者预设；LLM 只能补充表现，不改变核心状态。
- `DYNAMIC`：领域规则可以基于事件修改关系指标，LLM 只提出候选变化。

每个 `StoryWorld` 保存独立的 `relationshipDynamicsEnabled`。关闭后：

- 不执行关系增量计算。
- 不写入动态关系快照。
- 对话仍可读取预设关系和当前剧情节点。
- 事件只能推进作者允许的剧情状态机。

### 6.3 关系网络

- `RelationshipEdge`：`sourceCharacterId`、`targetCharacterId`、关系类型、公开性和双向策略。
- `RelationshipState`：信任、亲密、好感、冲突、依赖等可配置指标。
- `RelationshipEvent`：导致变化的领域事件、前后值、规则版本和原因。
- `RelationshipRuleSet`：变化上限、衰减、锁定条件和剧情保护条件。

第一阶段采用关系表加领域查询，不引入图数据库。只有关系查询复杂度和规模被实际数据证明成为瓶颈后，才评估图数据库。

### 6.4 事件与日程

- `WorldEventDefinition`：事件模板、触发条件、目标角色、优先级和冷却。
- `ScheduledOccurrence`：具体执行时间、时区、状态和幂等键。
- `CharacterPlan`：角色在时间段内的地点、活动及可打断性。
- `TriggerSource`：生日、现实节日、世界节日、剧情节点、用户互动、关系事件或手动触发。
- `EventExecution`：一次执行的输入快照、规则版本、输出和失败原因。

所有日期持久化为 UTC，同时保存事件所属时区。生日和节日按故事世界时区计算。

### 6.5 对话与记忆

- `Conversation`：私聊或群聊。
- `ConversationMember`：成员、进入时间、离开时间和可见范围。
- `Message`：文本、图片、表情包、系统事件或动作。
- `MemoryItem`：事件事实、对话摘要、角色印象和用户偏好。
- `MemoryVisibility`：本人、关系双方、群组、公开或系统私有。

检索采用关键词、向量和实体关系三路召回，再用 RRF 或可配置权重融合。任何记忆写入都必须标记来源，不把模型猜测作为事实。

### 6.6 动态与媒体

- `Moment`：作者角色、文本、地点、可见范围、发布时间和生成来源。
- `MomentMedia`：图片、缩略图、ComfyUI Job、Workflow 版本和 Seed。
- `MomentInteraction`：点赞、评论和角色回复。
- `StickerPack` / `Sticker`：导入包、标签、适用情绪和文件校验信息。

## 7. 关键工作流

### 7.1 定时生活事件

1. Scheduler 生成带幂等键的 `ScheduledOccurrence`。
2. Worker 读取角色、关系、世界和日程快照。
3. 规则引擎判断是否触发、延后、合并或取消。
4. 行为规划器生成结构化候选行动。
5. 领域层校验行动是否符合角色、剧情和权限边界。
6. 创建聊天消息、动态草稿或图片任务。
7. 内容与图片完成后原子发布动态，或进入人工审核队列。

### 7.2 私聊/群聊

1. API 校验当前 ActorSession 和会话成员关系。
2. 保存用户消息并生成请求幂等键。
3. 检索角色人设、关系、最近消息和相关记忆。
4. LLM 以结构化响应返回文本、动作、图片意图和记忆候选。
5. 领域层校验后流式发送文本。
6. 图片意图进入 BullMQ，不阻塞文本回复。
7. 合格事实异步写入记忆；模型推测仅存为低置信候选。

### 7.3 ComfyUI 图片

1. 角色视觉档案提供稳定身份层：发型、瞳色、服装基线、LoRA、参考图和负面词。
2. 事件提供场景层：地点、时间、动作、情绪、同框人物。
3. 镜头模板提供构图层：景别、角度、光线和画幅。
4. Prompt Builder 合并三层并记录版本。
5. Worker 向 ComfyUI 提交版本化 Workflow JSON。
6. WebSocket 记录节点进度；完成后校验输出文件。
7. 媒体服务生成缩略图并关联聊天或动态。

不得直接依靠一段自由文本维持角色一致性。核心角色至少需要视觉设定表；后续可增加参考图、IP-Adapter、ControlNet 或角色 LoRA。

## 8. API 边界（首版）

```text
GET    /health
GET    /v1/characters
POST   /v1/characters
GET    /v1/relationships
PUT    /v1/relationships/:id
POST   /v1/actor-sessions/switch
GET    /v1/conversations
POST   /v1/conversations/:id/messages
GET    /v1/conversations/:id/stream
GET    /v1/moments
POST   /v1/moments/:id/comments
GET    /v1/worlds/:id/calendar
POST   /v1/events/:id/trigger
GET    /v1/jobs/:id
POST   /v1/comfyui/workflows/validate
```

共享 Contract 定义请求、响应、领域事件和 Job Payload。API、Worker 和 Web 不得分别复制类型。

## 9. LLM 与 Prompt 设计

- Provider 层只负责认证、Base URL、模型参数、流式协议和错误归一化。
- Prompt 层分为系统规则、世界观、角色卡、关系上下文、记忆、当前事件和输出 Schema。
- 所有行为规划使用结构化输出；普通聊天文本允许自然语言流式返回。
- 每次生成记录 provider、model、promptVersion、输入摘要、token 用量和关联事件。
- 敏感 Key 只从环境或本地秘密存储读取，不进入数据库日志和前端状态。
- 为主动消息、动态和图片设置每日/每角色预算，避免无意义批量生成。

## 10. 一致性、重试与安全

- API 数据写入和 Outbox 事件在同一数据库事务提交。
- Job Payload 只携带 ID 和版本，不携带无法追踪的大段可变状态。
- 每个 Event、Message Generation、Moment Publish 和 Image Job 都有唯一幂等键。
- Worker 使用有限指数退避；永久错误进入 dead-letter 状态，不无限重试。
- ComfyUI 输出限制在配置目录；服务端验证文件路径、扩展名和大小。
- 导入表情包时检查压缩包路径穿越、文件类型和数量上限。
- 对话、Prompt 和日志进行 API Key、Authorization Header 等秘密脱敏。
- 角色切换不是身份认证；远程部署前必须额外增加真正的认证层。

## 11. 配置与 Feature Flags

至少提供：

- `relationshipDynamicsEnabled`
- `autonomousEventsEnabled`
- `proactiveMessagesEnabled`
- `momentGenerationEnabled`
- `imageGenerationEnabled`
- `memoryWriteEnabled`
- `memoryRetrievalEnabled`
- `manualReviewBeforePublish`

Feature Flag 按世界设置，可被系统级紧急开关覆盖。关闭功能后，已有数据保留，后台任务不得继续产生副作用。

## 12. 测试策略

- 领域单测：静态故事不改变关系；动态关系遵守阈值、锁定和衰减。
- 契约测试：API、队列 Payload、LLM 结构化输出和 ComfyUI Workflow。
- 集成测试：PostgreSQL 迁移、pgvector 检索、Redis 重试和 Outbox 发布。
- E2E：切换用户角色、私聊、群聊、触发生日事件、发布带图动态。
- 失败测试：LLM 超时、重复请求、ComfyUI 离线、任务重放、Worker 崩溃恢复。
- Snapshot 仅用于稳定 Schema，不用来替代行为断言。

## 13. 开发阶段

### Phase 0：工程基础

- pnpm monorepo、TypeScript、lint、format、test、build。
- API、Worker、Web 最小启动入口。
- 共享 Contract 与环境配置校验。
- Docker Compose：PostgreSQL、Redis、MinIO。
- CI 基础检查。

### Phase 1：角色与关系 MVP

- Character、StoryWorld、RelationshipEdge、ActorSession。
- 静态/动态关系开关和领域测试。
- 角色列表、编辑、关系网基础界面。

### Phase 2：聊天与记忆

- 私聊、群聊、SSE、Provider Adapter。
- 消息幂等和结构化行为输出。
- PostgreSQL FTS + pgvector 混合记忆。

### Phase 3：日程与生活模拟

- BullMQ Scheduler、生日、节日和剧情触发器。
- CharacterPlan、EventExecution 和主动消息预算。

### Phase 4：ComfyUI 与动态流

- Workflow 模板、角色视觉身份、图片 Job。
- 朋友圈/小红书式瀑布流、评论、点赞、相册。

### Phase 5：体验与分发

- Tauri 桌面包装、安装检查、备份恢复、可观测性和性能优化。

## 14. MVP 验收闭环

第一条完整链路必须做到：

1. 创建两个角色并配置关系。
2. 用户切换为其中一个角色。
3. 创建一次可重复测试的生日或世界事件。
4. Worker 生成另一个角色的结构化行动和动态草稿。
5. 调用可替换的 Fake ComfyUI 或真实 ComfyUI 生成图片。
6. 动态流展示卡片，包含人物、时间、正文和图片任务状态。
7. 重放相同事件不会产生重复动态或图片。
8. 关闭动态关系后，整条链路不得修改关系状态。

## 15. 开发规则

- 架构决定由 Sol 保留；Luna 只执行有边界、可测试、可回滚任务。
- 每个 Phase 先写领域测试和 Contract，再接 UI 或外部服务。
- 不为未出现的规模问题提前拆微服务。
- 不在领域包中引用 Fastify、Vue、BullMQ、数据库驱动或供应商 SDK。
- 不允许“顺手”引入新框架、生产依赖或重构无关区域。
- 测试命令必须完成并报告退出状态，启动不等于通过。
- 影响相同文件的 Luna 任务串行执行；独立只读探索或测试才可并行。

首个实现任务见 `docs/tasks/0001-foundation.md`。
